import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const position = z
  .number()
  .finite()
  .min(0)
  .max(24 * 60 * 60);

export const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, 'Invalid room code'),
});

export const chatSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Message is empty')
    .max(500, 'Message is too long (max 500 characters)'),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), positionSec: position.optional() }),
  z.object({ type: z.literal('pause'), positionSec: position.optional() }),
  z.object({ type: z.literal('seek'), positionSec: position }),
  z.object({ type: z.literal('setTrack'), trackId: objectId }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('prev') }),
  z.object({ type: z.literal('queueAdd'), trackId: objectId }),
  z.object({ type: z.literal('queueRemove'), trackId: objectId }),
  z.object({ type: z.literal('ended'), trackId: objectId, version: z.number().int().min(0) }),
]);

export const settingsSchema = z.object({ controlMode: z.enum(['host', 'everyone']) });
