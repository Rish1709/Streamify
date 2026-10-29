import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/env.js';
import { encodeWav } from '../scripts/synth.js';
import { app, client, makeTracks, signUp, useTestDb } from './helpers.js';

useTestDb();

describe('catalogue', () => {
  it('paginates with correct metadata and page boundaries', async () => {
    await makeTracks(25);
    const p1 = await request(app).get('/api/v1/tracks?limit=10');
    expect(p1.status).toBe(200);
    expect(p1.body.items).toHaveLength(10);
    expect(p1.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
      hasPrev: false,
    });
    // Default sort is newest first.
    expect(p1.body.items[0].title).toBe('Track 24');

    const p3 = await request(app).get('/api/v1/tracks?limit=10&page=3');
    expect(p3.body.items).toHaveLength(5);
    expect(p3.body.pagination.hasNext).toBe(false);

    // Pages don't overlap.
    const p2 = await request(app).get('/api/v1/tracks?limit=10&page=2');
    const ids = new Set([...p1.body.items, ...p2.body.items, ...p3.body.items].map((t) => t.id));
    expect(ids.size).toBe(25);

    const beyond = await request(app).get('/api/v1/tracks?limit=10&page=9');
    expect(beyond.body.items).toEqual([]);
  });

  it('rejects invalid pagination and sort parameters', async () => {
    expect((await request(app).get('/api/v1/tracks?limit=500')).status).toBe(400);
    expect((await request(app).get('/api/v1/tracks?page=0')).status).toBe(400);
    expect((await request(app).get('/api/v1/tracks?sort=random')).status).toBe(400);
  });

  it('filters by genre and sorts by popularity', async () => {
    await makeTracks(9);
    const res = await request(app).get('/api/v1/tracks?genre=ambient&sort=popular');
    expect(res.body.items.map((t) => t.title)).toEqual(['Track 06', 'Track 03', 'Track 00']);
    expect(res.body.items.every((t) => t.genre === 'ambient')).toBe(true);
  });

  it('searches with the text index and falls back to prefix matching', async () => {
    await makeTracks(3, (i) => ({
      title: ['Midnight Static', 'Morning Coffee', 'Static Shock'][i],
      artist: ['Nova Drift', 'Low Tide Club', 'Nova Drift'][i],
    }));
    const word = await request(app).get('/api/v1/tracks?q=static');
    expect(word.body.items.map((t) => t.title).sort()).toEqual(['Midnight Static', 'Static Shock']);

    const prefix = await request(app).get('/api/v1/tracks?q=midn');
    expect(prefix.body.items.map((t) => t.title)).toEqual(['Midnight Static']);

    const artist = await request(app).get('/api/v1/tracks?q=low tide');
    expect(artist.body.items[0].title).toBe('Morning Coffee');

    const none = await request(app).get('/api/v1/tracks?q=zzzz');
    expect(none.body.items).toEqual([]);
    expect(none.body.pagination.total).toBe(0);
  });

  it('treats regex characters in search as literal text', async () => {
    await makeTracks(2);
    const res = await request(app).get(`/api/v1/tracks?q=${encodeURIComponent('.*(')}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('lists genres with counts', async () => {
    await makeTracks(6);
    const res = await request(app).get('/api/v1/tracks/genres');
    expect(res.body.items).toEqual([
      { genre: 'ambient', count: 2 },
      { genre: 'house', count: 4 },
    ]);
  });

  it('returns a single track, 404 for unknown ids and 400 for malformed ids', async () => {
    const [t] = await makeTracks(1);
    const ok = await request(app).get(`/api/v1/tracks/${t.id}`);
    expect(ok.body.track).toMatchObject({
      id: t.id,
      title: 'Track 00',
      streamUrl: `/api/v1/tracks/${t.id}/stream`,
    });
    expect(ok.body.track).not.toHaveProperty('audioFile');
    expect((await request(app).get('/api/v1/tracks/aaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
    expect((await request(app).get('/api/v1/tracks/not-an-id')).status).toBe(400);
  });
});

describe('streaming', () => {
  beforeAll(() => {
    fs.mkdirSync(config.AUDIO_DIR, { recursive: true });
    fs.writeFileSync(path.join(config.AUDIO_DIR, 'test.wav'), encodeWav(new Float32Array(22050)));
  });

  it('requires authentication', async () => {
    const [t] = await makeTracks(1, () => ({ audioFile: 'test.wav' }));
    expect((await request(app).get(`/api/v1/tracks/${t.id}/stream`)).status).toBe(401);
  });

  it('supports HTTP range requests for seeking', async () => {
    const [t] = await makeTracks(1, () => ({ audioFile: 'test.wav' }));
    const c = await signUp();
    const res = await c.get(`/api/v1/tracks/${t.id}/stream`).set('Range', 'bytes=0-99');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toMatch(/^bytes 0-99\/\d+$/);
    expect(res.headers['content-type']).toMatch(/audio\/wav/);
  });

  it('refuses audio paths that escape the audio directory', async () => {
    const [t] = await makeTracks(1, () => ({ audioFile: '../../etc/passwd' }));
    const c = await signUp();
    expect((await c.get(`/api/v1/tracks/${t.id}/stream`)).status).toBe(404);
  });

  it('counts plays for signed-in users only', async () => {
    const [t] = await makeTracks(1);
    expect((await client().post(`/api/v1/tracks/${t.id}/play`)).status).toBe(401);
    const c = await signUp();
    expect((await c.post(`/api/v1/tracks/${t.id}/play`)).status).toBe(204);
    const res = await request(app).get(`/api/v1/tracks/${t.id}`);
    expect(res.body.track.playCount).toBe(1);
  });
});

describe('likes', () => {
  it('likes, lists (paginated, newest first) and unlikes tracks idempotently', async () => {
    const tracks = await makeTracks(3);
    const c = await signUp();
    for (const t of tracks) expect((await c.put(`/api/v1/tracks/${t.id}/like`)).status).toBe(204);
    expect((await c.put(`/api/v1/tracks/${tracks[0].id}/like`)).status).toBe(204); // idempotent

    const page = await c.get('/api/v1/tracks/liked?limit=2');
    expect(page.body.pagination.total).toBe(3);
    expect(page.body.items.map((t) => t.id)).toEqual([tracks[2].id, tracks[1].id]);

    expect((await c.delete(`/api/v1/tracks/${tracks[1].id}/like`)).status).toBe(204);
    const ids = await c.get('/api/v1/tracks/liked/ids');
    expect(ids.body.ids.sort()).toEqual([tracks[0].id, tracks[2].id].sort());
  });

  it('keeps likes private to each user and 404s for unknown tracks', async () => {
    const [t] = await makeTracks(1);
    const a = await signUp();
    const b = await signUp();
    await a.put(`/api/v1/tracks/${t.id}/like`);
    expect((await b.get('/api/v1/tracks/liked')).body.items).toEqual([]);
    expect((await a.put('/api/v1/tracks/aaaaaaaaaaaaaaaaaaaaaaaa/like')).status).toBe(404);
    expect((await request(app).get('/api/v1/tracks/liked')).status).toBe(401);
  });
});
