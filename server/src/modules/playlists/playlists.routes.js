import { Router } from 'express';
import { z } from 'zod';
import { Playlist, PLAYLIST_MAX_TRACKS, Track, toTrackDto } from '../../models/index.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { pageMeta, pageQuerySchema } from '../../lib/pagination.js';
import { objectId, validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';

export const playlistsRouter = Router();
playlistsRouter.use(requireAuth);

const fields = {
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: z.string().trim().max(300),
  isPublic: z.boolean(),
};
const createBody = z.object({
  name: fields.name,
  description: fields.description.default(''),
  isPublic: fields.isPublic.default(false),
});
const updateBody = z
  .object(fields)
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Provide at least one field to update');
const idParams = { id: objectId };

function summary(p) {
  return {
    id: String(p._id),
    name: p.name,
    description: p.description,
    isPublic: p.isPublic,
    ownerId: String(p.owner?._id ?? p.owner),
    trackCount: p.tracks.length,
    // First track ids let the client draw a mosaic cover without loading every track.
    coverTrackIds: p.tracks.slice(0, 4).map(String),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * Ownership check used by every mutation. A playlist owned by someone else is a 403,
 * except a private one, which reads as 404 so its existence is not revealed.
 */
async function loadOwned(id, user) {
  const playlist = await Playlist.findById(id);
  if (!playlist) throw notFound('Playlist not found');
  if (!playlist.owner.equals(user._id)) {
    if (!playlist.isPublic) throw notFound('Playlist not found');
    throw forbidden('Only the owner can modify this playlist');
  }
  return playlist;
}

async function detail(playlistId, userId) {
  const p = await Playlist.findById(playlistId).populate('owner', 'username').lean();
  const tracks = await Track.find({ _id: { $in: p.tracks } }).lean();
  const byId = new Map(tracks.map((t) => [String(t._id), t]));
  return {
    ...summary(p),
    ownerName: p.owner?.username ?? 'unknown',
    isOwner: String(p.owner?._id) === String(userId),
    // Keep the playlist's order; skip tracks removed from the catalogue.
    tracks: p.tracks.map((id) => byId.get(String(id))).filter(Boolean).map(toTrackDto),
  };
}

playlistsRouter.get('/', validate({ query: pageQuerySchema }), async (req, res) => {
  const { page, limit } = req.valid.query;
  const filter = { owner: req.user._id };
  const [items, total] = await Promise.all([
    Playlist.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Playlist.countDocuments(filter),
  ]);
  res.json({ items: items.map(summary), pagination: pageMeta({ page, limit, total }) });
});

playlistsRouter.post('/', validate({ body: createBody }), async (req, res) => {
  const playlist = await Playlist.create({ ...req.valid.body, owner: req.user._id, tracks: [] });
  res.status(201).json({ playlist: await detail(playlist._id, req.user._id) });
});

playlistsRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const p = await Playlist.findById(req.valid.params.id, { owner: 1, isPublic: 1 }).lean();
  if (!p || (!p.isPublic && !p.owner.equals(req.user._id))) throw notFound('Playlist not found');
  res.json({ playlist: await detail(p._id, req.user._id) });
});

playlistsRouter.patch('/:id', validate({ params: idParams, body: updateBody }), async (req, res) => {
  const playlist = await loadOwned(req.valid.params.id, req.user);
  playlist.set(req.valid.body);
  await playlist.save();
  res.json({ playlist: await detail(playlist._id, req.user._id) });
});

playlistsRouter.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const playlist = await loadOwned(req.valid.params.id, req.user);
  await playlist.deleteOne();
  res.status(204).end();
});

playlistsRouter.post(
  '/:id/tracks',
  validate({ params: idParams, body: { trackId: objectId } }),
  async (req, res) => {
    const playlist = await loadOwned(req.valid.params.id, req.user);
    const { trackId } = req.valid.body;
    if (!(await Track.exists({ _id: trackId }))) throw notFound('Track not found');
    if (playlist.tracks.some((t) => t.equals(trackId))) {
      return res.json({ added: false, playlist: await detail(playlist._id, req.user._id) });
    }
    // Atomic guard: only push if the playlist is still below the size limit.
    const result = await Playlist.updateOne(
      { _id: playlist._id, [`tracks.${PLAYLIST_MAX_TRACKS - 1}`]: { $exists: false } },
      { $addToSet: { tracks: trackId } },
    );
    if (result.matchedCount === 0) throw badRequest(`Playlists hold at most ${PLAYLIST_MAX_TRACKS} tracks`);
    res.status(201).json({ added: true, playlist: await detail(playlist._id, req.user._id) });
  },
);

playlistsRouter.delete(
  '/:id/tracks/:trackId',
  validate({ params: { id: objectId, trackId: objectId } }),
  async (req, res) => {
    const playlist = await loadOwned(req.valid.params.id, req.user);
    await Playlist.updateOne({ _id: playlist._id }, { $pull: { tracks: req.valid.params.trackId } });
    res.json({ playlist: await detail(playlist._id, req.user._id) });
  },
);

// Reorder: the body must be a permutation of the playlist's current tracks.
playlistsRouter.put(
  '/:id/tracks',
  validate({ params: idParams, body: { trackIds: z.array(objectId).max(PLAYLIST_MAX_TRACKS) } }),
  async (req, res) => {
    const playlist = await loadOwned(req.valid.params.id, req.user);
    const next = req.valid.body.trackIds;
    const current = playlist.tracks.map(String).sort();
    const proposed = [...next].sort();
    if (current.length !== proposed.length || current.some((id, i) => id !== proposed[i])) {
      throw badRequest('trackIds must contain exactly the tracks already in the playlist');
    }
    playlist.tracks = next;
    await playlist.save();
    res.json({ playlist: await detail(playlist._id, req.user._id) });
  },
);
