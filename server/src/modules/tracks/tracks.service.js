import path from 'node:path';
import { Track, toTrackDto } from '../../models/index.js';
import { bumpNamespaceVersion, getNamespaceVersion, getOrSet } from '../../lib/cache.js';
import { pageMeta } from '../../lib/pagination.js';

export const CATALOG_NS = 'tracks';
const LIST_TTL_SEC = 60;
const TRACK_TTL_SEC = 300;
const GENRES_TTL_SEC = 600;

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  popular: { playCount: -1, _id: -1 },
  title: { title: 1, _id: 1 },
};
export const SORT_KEYS = Object.keys(SORTS);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function queryTracks({ q, genre, sort, page, limit }) {
  const base = genre ? { genre } : {};
  const skip = (page - 1) * limit;

  const run = async (filter, sortSpec, projection) => {
    const [items, total] = await Promise.all([
      Track.find(filter, projection).sort(sortSpec).skip(skip).limit(limit).lean(),
      Track.countDocuments(filter),
    ]);
    return { items, total };
  };

  let result;
  if (q) {
    // 1) Indexed full-text search, ranked by relevance unless a sort was requested.
    const textFilter = { ...base, $text: { $search: q } };
    const textSort = sort ? SORTS[sort] : { score: { $meta: 'textScore' }, _id: 1 };
    result = await run(textFilter, textSort, sort ? undefined : { score: { $meta: 'textScore' } });
    // 2) Text search matches whole words only. For partial input ("midn") fall back to
    //    a case-insensitive word-prefix match. This is a collection scan, acceptable for
    //    a demo-sized catalogue; a production system would use Atlas Search/Elastic.
    if (result.total === 0) {
      const rx = new RegExp(`\\b${escapeRegex(q)}`, 'i');
      result = await run(
        { ...base, $or: [{ title: rx }, { artist: rx }, { album: rx }, { tags: rx }] },
        SORTS[sort ?? 'title'],
      );
    }
  } else {
    result = await run(base, SORTS[sort ?? 'newest']);
  }

  return {
    items: result.items.map(toTrackDto),
    pagination: pageMeta({ page, limit, total: result.total }),
  };
}

export async function listTracks(params) {
  const version = await getNamespaceVersion(CATALOG_NS);
  const key = `tracks:list:v${version}:${JSON.stringify([
    params.q ?? '',
    params.genre ?? '',
    params.sort ?? '',
    params.page,
    params.limit,
  ])}`;
  return getOrSet(key, LIST_TTL_SEC, () => queryTracks(params));
}

export async function getTrack(id) {
  const version = await getNamespaceVersion(CATALOG_NS);
  return getOrSet(`tracks:id:v${version}:${id}`, TRACK_TTL_SEC, async () => {
    const track = await Track.findById(id).lean();
    return track ? toTrackDto(track) : null;
  });
}

export async function listGenres() {
  const version = await getNamespaceVersion(CATALOG_NS);
  return getOrSet(`tracks:genres:v${version}`, GENRES_TTL_SEC, async () => {
    const rows = await Track.aggregate([
      { $group: { _id: '$genre', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({ genre: r._id, count: r.count }));
  });
}

/** Call after any catalogue write (seed, admin import) to invalidate cached reads. */
export const invalidateCatalog = () => bumpNamespaceVersion(CATALOG_NS);

export function resolveAudioPath(audioDir, audioFile) {
  const root = path.resolve(audioDir);
  const full = path.resolve(root, audioFile);
  // Guard against path traversal even though audioFile comes from our own database.
  if (!full.startsWith(root + path.sep)) return null;
  return full;
}
