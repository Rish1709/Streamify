import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import { ZodError } from 'zod';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { ChatMessage, User, toMessageDto } from '../models/index.js';
import { AUTH_COOKIE, verifyToken } from '../modules/auth/token.js';
import {
  applyRoomAction,
  findRoom,
  toRoomState,
  updateRoomSettings,
} from '../modules/rooms/rooms.service.js';
import { setIo, socketRoom } from './emitter.js';
import { addPresence, listParticipants, removePresence } from './presence.js';
import { actionSchema, chatSchema, joinSchema, settingsSchema } from './schemas.js';

const CHAT_BURST = 5; // messages
const CHAT_WINDOW_MS = 5000;
const HISTORY_ON_JOIN = 30;

function toAckError(err) {
  if (err instanceof ZodError) {
    return { code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? 'Invalid payload' };
  }
  if (err instanceof AppError) return { code: err.code, message: err.message };
  logger.error({ err }, 'socket handler failed');
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong' };
}

/**
 * Wraps an event handler: validates that the client passed an ack callback, catches
 * errors, and replies { ok: true, ...data } or { ok: false, error }.
 */
function handler(fn) {
  return async (payload, ack) => {
    if (typeof payload === 'function') [payload, ack] = [undefined, payload];
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ ok: true, ...((await fn(payload ?? {})) ?? {}) });
    } catch (err) {
      reply({ ok: false, error: toAckError(err) });
    }
  };
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigins, credentials: true },
    // Socket.IO buffers and replays nothing on its own; on reconnect the client
    // re-joins and receives a full fresh room state instead.
    pingInterval: 20_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 16 * 1024,
  });
  setIo(io);

  // Handshake authentication with the same httpOnly cookie used by the REST API.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const bearer = socket.handshake.auth?.token;
      const payload = await verifyToken(cookies[AUTH_COOKIE] ?? bearer);
      if (!payload) return next(new Error('UNAUTHORIZED'));
      const user = await User.findById(payload.sub).lean();
      if (!user) return next(new Error('UNAUTHORIZED'));
      socket.data.user = { id: String(user._id), username: user.username };
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.data.roomCode = null;
    socket.data.chatTimes = [];

    const broadcastParticipants = (code) =>
      io.to(socketRoom(code)).emit('room:participants', { participants: listParticipants(code) });

    const requireRoom = () => {
      if (!socket.data.roomCode) throw new AppError(400, 'NOT_IN_ROOM', 'Join a room first');
      return socket.data.roomCode;
    };

    const leaveCurrent = () => {
      const code = socket.data.roomCode;
      if (!code) return;
      socket.leave(socketRoom(code));
      socket.data.roomCode = null;
      if (removePresence(code, user.id, socket.id)) broadcastParticipants(code);
    };

    socket.on(
      'room:join',
      handler(async (payload) => {
        const { code } = joinSchema.parse(payload);
        const room = await findRoom(code);
        if (socket.data.roomCode !== code) leaveCurrent();
        await socket.join(socketRoom(code));
        socket.data.roomCode = code;
        if (addPresence(code, user, socket.id)) broadcastParticipants(code);
        const history = await ChatMessage.find({ room: room._id })
          .sort({ createdAt: -1, _id: -1 })
          .limit(HISTORY_ON_JOIN)
          .lean();
        return {
          state: await toRoomState(room),
          participants: listParticipants(code),
          messages: history.reverse().map(toMessageDto),
        };
      }),
    );

    socket.on(
      'room:leave',
      handler(async () => {
        leaveCurrent();
      }),
    );

    socket.on(
      'chat:send',
      handler(async (payload) => {
        const code = requireRoom();
        const { text } = chatSchema.parse(payload);
        // Sliding-window rate limit per socket to stop chat flooding.
        const now = Date.now();
        socket.data.chatTimes = socket.data.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
        if (socket.data.chatTimes.length >= CHAT_BURST) {
          throw new AppError(429, 'RATE_LIMITED', 'You are sending messages too quickly');
        }
        socket.data.chatTimes.push(now);
        const room = await findRoom(code);
        const msg = await ChatMessage.create({
          room: room._id,
          user: user.id,
          username: user.username,
          text,
        });
        const dto = toMessageDto(msg);
        io.to(socketRoom(code)).emit('chat:message', dto);
        return { message: dto };
      }),
    );

    socket.on(
      'playback:action',
      handler(async (payload) => {
        const code = requireRoom();
        const action = actionSchema.parse(payload);
        const room = await applyRoomAction(code, user.id, action);
        if (!room) return { applied: false };
        const state = await toRoomState(room);
        io.to(socketRoom(code)).emit('room:state', state);
        return { applied: true, state };
      }),
    );

    socket.on(
      'room:settings',
      handler(async (payload) => {
        const code = requireRoom();
        const changes = settingsSchema.parse(payload);
        const room = await updateRoomSettings(code, { _id: user.id }, changes);
        const state = await toRoomState(room);
        io.to(socketRoom(code)).emit('room:state', state);
        return { state };
      }),
    );

    // Clock sync: clients estimate their offset to server time (NTP-style) so that
    // extrapolated playback positions line up across devices.
    socket.on(
      'time:sync',
      handler(async () => ({ serverTime: Date.now() })),
    );

    socket.on('disconnect', () => leaveCurrent());
  });

  return io;
}
