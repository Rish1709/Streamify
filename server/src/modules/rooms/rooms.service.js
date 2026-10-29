import crypto from 'node:crypto';
import { Room, ROOM_QUEUE_MAX, Track, toTrackDto } from '../../models/index.js';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LENGTH = 6;

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export async function createRoom({ name, isPublic, controlMode }, user) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await Room.create({
        code: generateCode(),
        name,
        isPublic,
        controlMode,
        host: user._id,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err; // retry only on code collision
    }
  }
  throw new AppError(503, 'ROOM_CODE_EXHAUSTED', 'Could not allocate a room code, try again');
}

export async function findRoom(code) {
  const room = await Room.findOne({ code: String(code).toUpperCase() });
  if (!room) throw notFound('Room not found');
  return room;
}

export const isHost = (room, userId) => String(room.host?._id ?? room.host) === String(userId);
export const canControl = (room, userId) => room.controlMode === 'everyone' || isHost(room, userId);

/** Live position of a playback state at time `now` (ms). */
export function currentPosition(playback, now = Date.now()) {
  if (!playback.isPlaying) return playback.positionSec;
  return playback.positionSec + Math.max(0, now - new Date(playback.updatedAt).getTime()) / 1000;
}

export async function toRoomState(room) {
  const populated = await Room.findById(room._id).populate('host', 'username').lean();
  if (!populated) throw notFound('Room not found');
  const ids = [...populated.queue.map(String)];
  if (populated.playback.trackId) ids.push(String(populated.playback.trackId));
  const tracks = await Track.find({ _id: { $in: ids } }).lean();
  const byId = new Map(tracks.map((t) => [String(t._id), toTrackDto(t)]));
  const pb = populated.playback;
  return {
    code: populated.code,
    name: populated.name,
    hostId: String(populated.host?._id),
    hostName: populated.host?.username ?? 'unknown',
    isPublic: populated.isPublic,
    controlMode: populated.controlMode,
    queue: populated.queue.map((id) => byId.get(String(id))).filter(Boolean),
    playback: {
      track: pb.trackId ? (byId.get(String(pb.trackId)) ?? null) : null,
      isPlaying: pb.isPlaying,
      positionSec: pb.positionSec,
      updatedAt: new Date(pb.updatedAt).getTime(),
      version: pb.version,
    },
    serverTime: Date.now(),
  };
}

async function loadTrack(trackId) {
  const track = await Track.findById(trackId, { durationSec: 1 }).lean();
  if (!track) throw notFound('Track not found');
  return track;
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * Pure-ish reducer: given the room document and an action, compute the next
 * { queue, playback } or throw. Permission checks happen here so REST and socket
 * entry points cannot drift apart.
 */
async function reduce(room, userId, action, now) {
  const pb = room.playback.toObject();
  const queue = room.queue.map(String);
  const current = pb.trackId ? String(pb.trackId) : null;
  const controller = canControl(room, userId);
  const requireControl = () => {
    if (!controller) throw forbidden('Only the host can control playback in this room');
  };
  const at = (trackId, positionSec, isPlaying) => ({
    queue,
    playback: {
      trackId,
      positionSec,
      isPlaying,
      updatedAt: new Date(now),
      version: pb.version + 1,
    },
  });
  const step = (dir) => {
    const idx = current ? queue.indexOf(current) : -1;
    const nextId = queue[idx + dir];
    if (!nextId) {
      // Ran off the end/start of the queue: stop on the current track.
      return dir > 0 ? at(current, 0, false) : at(current, 0, pb.isPlaying);
    }
    return at(nextId, 0, true);
  };

  switch (action.type) {
    case 'play': {
      requireControl();
      if (!current) throw badRequest('Pick a track first');
      const pos = action.positionSec ?? currentPosition(pb, now);
      const { durationSec } = await loadTrack(current);
      return at(current, clamp(pos, 0, durationSec), true);
    }
    case 'pause': {
      requireControl();
      if (!current) throw badRequest('Nothing is playing');
      const { durationSec } = await loadTrack(current);
      return at(
        current,
        clamp(action.positionSec ?? currentPosition(pb, now), 0, durationSec),
        false,
      );
    }
    case 'seek': {
      requireControl();
      if (!current) throw badRequest('Nothing is playing');
      const { durationSec } = await loadTrack(current);
      return at(current, clamp(action.positionSec, 0, durationSec), pb.isPlaying);
    }
    case 'setTrack': {
      requireControl();
      await loadTrack(action.trackId);
      if (!queue.includes(action.trackId)) {
        if (queue.length >= ROOM_QUEUE_MAX) throw badRequest('Room queue is full');
        queue.push(action.trackId);
      }
      return at(action.trackId, 0, true);
    }
    case 'next':
      requireControl();
      return step(1);
    case 'prev':
      requireControl();
      return step(-1);
    case 'queueAdd': {
      requireControl();
      await loadTrack(action.trackId);
      if (queue.includes(action.trackId)) throw badRequest('Track is already in the queue');
      if (queue.length >= ROOM_QUEUE_MAX) throw badRequest('Room queue is full');
      queue.push(action.trackId);
      // Starting an empty room: queue the first track paused, ready to play.
      if (!current) return at(action.trackId, 0, false);
      return { queue, playback: { ...pb, version: pb.version + 1 } };
    }
    case 'queueRemove': {
      requireControl();
      if (action.trackId === current) throw badRequest('Cannot remove the track that is playing');
      const idx = queue.indexOf(action.trackId);
      if (idx === -1) throw notFound('Track is not in the queue');
      queue.splice(idx, 1);
      return { queue, playback: { ...pb, version: pb.version + 1 } };
    }
    case 'ended': {
      // Any participant may report the end of a track, but only for the exact state
      // version they were playing, so duplicate/late reports are ignored (idempotent).
      if (action.version !== pb.version || !current || action.trackId !== current) return null;
      return step(1);
    }
    default:
      throw badRequest('Unknown action');
  }
}

/**
 * Applies an action with optimistic concurrency on playback.version, retrying when
 * another participant changed the room in between. Returns the updated room or null
 * when the action was a no-op.
 */
export async function applyRoomAction(code, userId, action, now = Date.now()) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await findRoom(code);
    const next = await reduce(room, userId, action, now);
    if (!next) return null;
    const updated = await Room.findOneAndUpdate(
      { _id: room._id, 'playback.version': room.playback.version },
      { $set: { queue: next.queue, playback: next.playback, lastActiveAt: new Date(now) } },
      { returnDocument: 'after' },
    );
    if (updated) return updated;
  }
  throw new AppError(409, 'CONFLICT', 'Room changed concurrently, please retry');
}

export async function updateRoomSettings(code, user, changes) {
  const room = await findRoom(code);
  if (!isHost(room, user._id)) throw forbidden('Only the host can change room settings');
  room.set(changes);
  room.lastActiveAt = new Date();
  await room.save();
  return room;
}
