import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bumpNamespaceVersion,
  closeCache,
  getOrSet,
  initCache,
  isCacheReady,
} from '../src/lib/cache.js';
import { Track } from '../src/models/index.js';
import { invalidateCatalog } from '../src/modules/tracks/tracks.service.js';
import { app, makeTracks, useTestDb } from './helpers.js';

useTestDb();

const waitFor = async (fn, ms = 2000) => {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
  return true;
};

afterEach(() => closeCache());

describe('cache fallback (no Redis)', () => {
  it('bypasses the cache when Redis is not configured', async () => {
    let calls = 0;
    const r1 = await getOrSet('k', 10, async () => ++calls);
    const r2 = await getOrSet('k', 10, async () => ++calls);
    expect([r1.status, r2.status]).toEqual(['BYPASS', 'BYPASS']);
    expect(calls).toBe(2);
  });

  it('keeps the API working when Redis is unreachable', async () => {
    initCache('redis://127.0.0.1:1'); // nothing listens on port 1
    await makeTracks(2);
    const res = await request(app).get('/api/v1/tracks');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('BYPASS');
    expect(res.body.items).toHaveLength(2);
    const health = await request(app).get('/api/v1/health');
    expect(health.body).toMatchObject({ status: 'degraded', redis: 'unavailable' });
  });
});

// Runs only when a Redis server is provided, e.g. TEST_REDIS_URL=redis://127.0.0.1:6379/15
describe.skipIf(!process.env.TEST_REDIS_URL)('cache with Redis', () => {
  const connect = async () => {
    const c = initCache(process.env.TEST_REDIS_URL);
    expect(await waitFor(isCacheReady)).toBe(true);
    await c.flushdb();
  };

  it('serves a MISS then a HIT, and invalidates via namespace version', async () => {
    await connect();
    await makeTracks(3);
    const first = await request(app).get('/api/v1/tracks?limit=2');
    const second = await request(app).get('/api/v1/tracks?limit=2');
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);

    // A catalogue write + invalidation must be visible on the next read.
    await Track.updateOne({ title: 'Track 02' }, { title: 'Renamed' });
    expect((await request(app).get('/api/v1/tracks?limit=2')).body.items[0].title).toBe('Track 02');
    await invalidateCatalog();
    const fresh = await request(app).get('/api/v1/tracks?limit=2');
    expect(fresh.headers['x-cache']).toBe('MISS');
    expect(fresh.body.items[0].title).toBe('Renamed');
  });

  it('caches different queries under different keys', async () => {
    await connect();
    await makeTracks(6);
    await request(app).get('/api/v1/tracks?genre=ambient');
    const other = await request(app).get('/api/v1/tracks?genre=house');
    expect(other.headers['x-cache']).toBe('MISS');
    expect(other.body.items.every((t) => t.genre === 'house')).toBe(true);
  });

  it('bumpNamespaceVersion makes old keys unreachable', async () => {
    await connect();
    let n = 0;
    const key = async () => `demo:v${await bumpNamespaceVersion('demo')}`;
    const k1 = await key();
    await getOrSet(k1, 10, async () => ++n);
    expect((await getOrSet(k1, 10, async () => ++n)).status).toBe('HIT');
    const k2 = await key();
    expect((await getOrSet(k2, 10, async () => ++n)).status).toBe('MISS');
  });
});
