import { Router } from 'express';
import { z } from 'zod';
import { ChatMessage, Room, toMessageDto } from '../../models/index.js';
import { forbidden } from '../../lib/errors.js';
import { pageMeta, pageQuerySchema } from '../../lib/pagination.js';
import { objectId, validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { closeSocketRoom, emitToRoom } from '../../realtime/emitter.js';
import { clearRoomPresence, participantCount } from '../../realtime/presence.js';
import { createRoom, findRoom, isHost, toRoomState, updateRoomSettings } from './rooms.service.js';

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

const codeParams = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, 'Invalid room code'),
};
const settings = {
  name: z.string().trim().min(1, 'Name is required').max(60),
  isPublic: z.boolean(),
  controlMode: z.enum(['host', 'everyone']),
};

function roomSummary(r) {
  return {
    code: r.code,
    name: r.name,
    hostId: String(r.host?._id ?? r.host),
    hostName: r.host?.username,
    isPublic: r.isPublic,
    controlMode: r.controlMode,
    listeners: participantCount(r.code),
    lastActiveAt: r.lastActiveAt,
  };
}

async function listRooms(filter, { page, limit }) {
  const [items, total] = await Promise.all([
    Room.find(filter)
      .sort({ lastActiveAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('host', 'username')
      .lean(),
    Room.countDocuments(filter),
  ]);
  return { items: items.map(roomSummary), pagination: pageMeta({ page, limit, total }) };
}

roomsRouter.get('/', validate({ query: pageQuerySchema }), async (req, res) => {
  res.json(await listRooms({ isPublic: true }, req.valid.query));
});

roomsRouter.get('/mine', validate({ query: pageQuerySchema }), async (req, res) => {
  res.json(await listRooms({ host: req.user._id }, req.valid.query));
});

roomsRouter.post(
  '/',
  validate({
    body: z.object({
      name: settings.name,
      isPublic: settings.isPublic.default(true),
      controlMode: settings.controlMode.default('host'),
    }),
  }),
  async (req, res) => {
    const room = await createRoom(req.valid.body, req.user);
    res.status(201).json({ room: await toRoomState(room) });
  },
);

// Anyone signed in who knows the code may view/join a room (private rooms are simply
// unlisted). Playback control is enforced separately by the host/controlMode rules.
roomsRouter.get('/:code', validate({ params: codeParams }), async (req, res) => {
  const room = await findRoom(req.valid.params.code);
  res.json({ room: await toRoomState(room) });
});

roomsRouter.patch(
  '/:code',
  validate({
    params: codeParams,
    body: z
      .object(settings)
      .partial()
      .strict()
      .refine((b) => Object.keys(b).length > 0, 'Provide at least one field to update'),
  }),
  async (req, res) => {
    const room = await updateRoomSettings(req.valid.params.code, req.user, req.valid.body);
    const state = await toRoomState(room);
    emitToRoom(room.code, 'room:state', state);
    res.json({ room: state });
  },
);

roomsRouter.delete('/:code', validate({ params: codeParams }), async (req, res) => {
  const room = await findRoom(req.valid.params.code);
  if (!isHost(room, req.user._id)) throw forbidden('Only the host can close this room');
  await Promise.all([room.deleteOne(), ChatMessage.deleteMany({ room: room._id })]);
  emitToRoom(room.code, 'room:closed', { code: room.code, reason: 'The host closed the room' });
  closeSocketRoom(room.code);
  clearRoomPresence(room.code);
  res.status(204).end();
});

// Chat history with cursor pagination (newest first). `before` is a message id;
// cursors stay stable while new messages arrive, unlike page numbers.
roomsRouter.get(
  '/:code/messages',
  validate({
    params: codeParams,
    query: { before: objectId.optional(), limit: pageQuerySchema.limit.default(30) },
  }),
  async (req, res) => {
    const room = await findRoom(req.valid.params.code);
    const { before, limit } = req.valid.query;
    const filter = { room: room._id };
    if (before) {
      const cursor = await ChatMessage.findOne(
        { _id: before, room: room._id },
        { createdAt: 1 },
      ).lean();
      if (cursor) {
        filter.$or = [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
        ];
      }
    }
    const docs = await ChatMessage.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore = docs.length > limit;
    const page = docs.slice(0, limit).reverse(); // oldest -> newest for display
    res.json({
      items: page.map(toMessageDto),
      // The oldest message on this page is the cursor for the next (older) page.
      nextCursor: hasMore ? String(page[0]._id) : null,
    });
  },
);
