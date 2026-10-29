import { describe, expect, it } from 'vitest';
import { client, makeTracks, signUp, useTestDb } from './helpers.js';

useTestDb();

const create = (c, body = {}) => c.post('/api/v1/playlists').send({ name: 'My list', ...body });

describe('playlists', () => {
  it('requires authentication', async () => {
    expect((await client().get('/api/v1/playlists')).status).toBe(401);
    expect((await create(client())).status).toBe(401);
  });

  it('supports create, read, update and delete for the owner', async () => {
    const c = await signUp();
    const created = await create(c, { description: 'desc' });
    expect(created.status).toBe(201);
    const { id } = created.body.playlist;
    expect(created.body.playlist).toMatchObject({
      name: 'My list', description: 'desc', isPublic: false, trackCount: 0, isOwner: true, tracks: [],
    });

    const updated = await c.patch(`/api/v1/playlists/${id}`).send({ name: 'Renamed', isPublic: true });
    expect(updated.status).toBe(200);
    expect(updated.body.playlist).toMatchObject({ name: 'Renamed', isPublic: true });

    expect((await c.get(`/api/v1/playlists/${id}`)).body.playlist.name).toBe('Renamed');
    expect((await c.delete(`/api/v1/playlists/${id}`)).status).toBe(204);
    expect((await c.get(`/api/v1/playlists/${id}`)).status).toBe(404);
  });

  it('validates input', async () => {
    const c = await signUp();
    expect((await create(c, { name: '   ' })).status).toBe(400);
    expect((await create(c, { name: 'x'.repeat(81) })).status).toBe(400);
    const { body } = await create(c);
    const id = body.playlist.id;
    expect((await c.patch(`/api/v1/playlists/${id}`).send({})).status).toBe(400);
    expect((await c.patch(`/api/v1/playlists/${id}`).send({ owner: 'someone' })).status).toBe(400);
    expect((await c.post(`/api/v1/playlists/${id}/tracks`).send({ trackId: 'bad' })).status).toBe(400);
  });

  it('adds, de-duplicates, orders, reorders and removes tracks', async () => {
    const [t1, t2, t3] = await makeTracks(3);
    const c = await signUp();
    const id = (await create(c)).body.playlist.id;

    for (const t of [t1, t2, t3]) {
      const res = await c.post(`/api/v1/playlists/${id}/tracks`).send({ trackId: t.id });
      expect(res.status).toBe(201);
      expect(res.body.added).toBe(true);
    }
    const dup = await c.post(`/api/v1/playlists/${id}/tracks`).send({ trackId: t1.id });
    expect(dup.status).toBe(200);
    expect(dup.body.added).toBe(false);
    expect(dup.body.playlist.tracks.map((t) => t.id)).toEqual([t1.id, t2.id, t3.id]);

    const reordered = await c.put(`/api/v1/playlists/${id}/tracks`).send({ trackIds: [t3.id, t1.id, t2.id] });
    expect(reordered.body.playlist.tracks.map((t) => t.id)).toEqual([t3.id, t1.id, t2.id]);
    const badOrder = await c.put(`/api/v1/playlists/${id}/tracks`).send({ trackIds: [t3.id, t1.id] });
    expect(badOrder.status).toBe(400);

    const removed = await c.delete(`/api/v1/playlists/${id}/tracks/${t1.id}`);
    expect(removed.body.playlist.tracks.map((t) => t.id)).toEqual([t3.id, t2.id]);

    const missing = await c.post(`/api/v1/playlists/${id}/tracks`).send({ trackId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(missing.status).toBe(404);
  });

  it('enforces ownership: others cannot modify, and private playlists are hidden', async () => {
    const [t] = await makeTracks(1);
    const owner = await signUp();
    const other = await signUp();
    const privateId = (await create(owner)).body.playlist.id;
    const publicId = (await create(owner, { name: 'Shared', isPublic: true })).body.playlist.id;

    // Private: invisible to others (404, does not reveal existence).
    expect((await other.get(`/api/v1/playlists/${privateId}`)).status).toBe(404);
    expect((await other.patch(`/api/v1/playlists/${privateId}`).send({ name: 'x' })).status).toBe(404);
    expect((await other.delete(`/api/v1/playlists/${privateId}`)).status).toBe(404);

    // Public: readable, but still not writable.
    const view = await other.get(`/api/v1/playlists/${publicId}`);
    expect(view.status).toBe(200);
    expect(view.body.playlist.isOwner).toBe(false);
    expect((await other.patch(`/api/v1/playlists/${publicId}`).send({ name: 'Hacked' })).status).toBe(403);
    expect((await other.delete(`/api/v1/playlists/${publicId}`)).status).toBe(403);
    expect((await other.post(`/api/v1/playlists/${publicId}/tracks`).send({ trackId: t.id })).status).toBe(403);
    expect((await other.put(`/api/v1/playlists/${publicId}/tracks`).send({ trackIds: [] })).status).toBe(403);

    // Nothing changed.
    const after = await owner.get(`/api/v1/playlists/${publicId}`);
    expect(after.body.playlist).toMatchObject({ name: 'Shared', trackCount: 0 });

    // "My playlists" only lists your own.
    expect((await other.get('/api/v1/playlists')).body.items).toEqual([]);
  });

  it('paginates the owner’s playlists, most recently updated first', async () => {
    const c = await signUp();
    for (let i = 0; i < 5; i++) await create(c, { name: `P${i}` });
    const page1 = await c.get('/api/v1/playlists?limit=2');
    expect(page1.body.pagination).toMatchObject({ total: 5, totalPages: 3, hasNext: true });
    expect(page1.body.items.map((p) => p.name)).toEqual(['P4', 'P3']);
    const page3 = await c.get('/api/v1/playlists?limit=2&page=3');
    expect(page3.body.items.map((p) => p.name)).toEqual(['P0']);
  });
});
