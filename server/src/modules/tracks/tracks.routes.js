import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config/env.js';
import { Like, Track, toTrackDto } from '../../models/index.js';
import { notFound } from '../../lib/errors.js';
import { pageMeta, pageQuerySchema } from '../../lib/pagination.js';
import { objectId, validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { SORT_KEYS, getTrack, listGenres, listTracks, resolveAudioPath } from './tracks.service.js';

export const tracksRouter = Router();

const listQuery = {
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  genre: z.string().trim().toLowerCase().max(40).optional().transform((v) => v || undefined),
  sort: z.enum(SORT_KEYS).optional(),
  ...pageQuerySchema,
};
const idParams = { id: objectId };

tracksRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const { value, status } = await listTracks(req.valid.query);
  res.set('X-Cache', status).json(value);
});

tracksRouter.get('/genres', async (_req, res) => {
  const { value, status } = await listGenres();
  res.set('X-Cache', status).json({ items: value });
});

// --- Likes ("Liked songs" library) -------------------------------------------------
tracksRouter.get('/liked', requireAuth, validate({ query: pageQuerySchema }), async (req, res) => {
  const { page, limit } = req.valid.query;
  const filter = { user: req.user._id };
  const [likes, total] = await Promise.all([
    Like.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('track')
      .lean(),
    Like.countDocuments(filter),
  ]);
  res.json({
    items: likes.filter((l) => l.track).map((l) => toTrackDto(l.track)),
    pagination: pageMeta({ page, limit, total }),
  });
});

// Compact id list so the client can render heart icons without per-track requests.
tracksRouter.get('/liked/ids', requireAuth, async (req, res) => {
  const likes = await Like.find({ user: req.user._id }, { track: 1 })
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean();
  res.json({ ids: likes.map((l) => String(l.track)) });
});

tracksRouter.put('/:id/like', requireAuth, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params;
  if (!(await Track.exists({ _id: id }))) throw notFound('Track not found');
  await Like.updateOne(
    { user: req.user._id, track: id },
    { $setOnInsert: { user: req.user._id, track: id } },
    { upsert: true },
  );
  res.status(204).end();
});

tracksRouter.delete('/:id/like', requireAuth, validate({ params: idParams }), async (req, res) => {
  await Like.deleteOne({ user: req.user._id, track: req.valid.params.id });
  res.status(204).end();
});

// --- Single track ------------------------------------------------------------------
tracksRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const { value, status } = await getTrack(req.valid.params.id);
  if (!value) throw notFound('Track not found');
  res.set('X-Cache', status).json({ track: value });
});

// Play counts are intentionally not invalidating the catalogue cache: "popular" order
// may lag by up to the list TTL (60s), which is an acceptable tradeoff for fewer misses.
tracksRouter.post('/:id/play', requireAuth, validate({ params: idParams }), async (req, res) => {
  const result = await Track.updateOne({ _id: req.valid.params.id }, { $inc: { playCount: 1 } });
  if (result.matchedCount === 0) throw notFound('Track not found');
  res.status(204).end();
});

// Streaming requires a signed-in user. res.sendFile implements HTTP Range requests,
// so the browser can seek and buffer without downloading the whole file.
tracksRouter.get('/:id/stream', requireAuth, validate({ params: idParams }), async (req, res) => {
  const track = await Track.findById(req.valid.params.id, { audioFile: 1, audioUrl: 1 }).lean();
  if (!track) throw notFound('Track not found');
  if (track.audioUrl) return res.redirect(302, track.audioUrl);
  const file = track.audioFile && resolveAudioPath(config.AUDIO_DIR, track.audioFile);
  if (!file || !fs.existsSync(file)) {
    throw notFound('Audio file missing. Run `npm run seed` to generate the demo audio.');
  }
  res.sendFile(file, {
    acceptRanges: true,
    maxAge: '1d',
    headers: { 'Content-Type': mimeFor(file) },
  });
});

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' }[ext] ?? 'audio/wav';
}
