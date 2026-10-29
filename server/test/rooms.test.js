import http from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createSocketServer } from '../src/realtime/index.js';
import { app, client, makeTracks, signUp, useTestDb } from './helpers.js';

useTestDb();

let server;
let io;
let url;
const sockets = [];

beforeAll(async () => {
  server = http.createServer(app);
  io = createSocketServer(server);
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://localhost:${server.address().port}`;
});
afterEach(() => {
  sockets.splice(0).forEach((s) => s.disconnect());
});
afterAll(async () => {
  io.close();
  await new Promise((resolve) => server.close(resolve));
});

function connect(c, opts = {}) {
  const socket = ioClient(url, {
    transports: ['websocket'],
    extraHeaders: c?.cookie ? { Cookie: c.cookie } : {},
    reconnection: false,
    forceNew: true,
    ...opts,
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const emit = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));
const next = (socket, event, predicate = () => true, timeoutMs = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function listener(data) {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(data);
    }
    socket.on(event, listener);
  });
/** Resolves true if the event does NOT arrive within the window. */
const silent = (socket, event, ms = 300) =>
  new Promise((resolve) => {
    const listener = () => resolve(false);
    socket.once(event, listener);
    setTimeout(() => {
      socket.off(event, listener);
      resolve(true);
    }, ms);
  });

async function setupRoom(body = {}) {
  const host = await signUp();
  const guest = await signUp();
  const tracks = await makeTracks(3);
  const res = await host.post('/api/v1/rooms').send({ name: 'Test room', ...body });
  expect(res.status).toBe(201);
  return { host, guest, tracks, code: res.body.room.code };
}

describe('rooms REST', () => {
  it('creates rooms with a 6-character code and lists only public rooms', async () => {
    const c = await signUp();
    const pub = await c.post('/api/v1/rooms').send({ name: 'Public' });
    await c.post('/api/v1/rooms').send({ name: 'Secret', isPublic: false });
    expect(pub.body.room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(pub.body.room).toMatchObject({ name: 'Public', controlMode: 'host', hostId: c.user.id });

    const list = await (await signUp()).get('/api/v1/rooms');
    expect(list.body.items.map((r) => r.name)).toEqual(['Public']);
    expect(list.body.pagination.total).toBe(1);
    // Private rooms are still reachable by code.
    const mine = await c.get('/api/v1/rooms/mine');
    expect(mine.body.items).toHaveLength(2);
  });

  it('lets only the host change settings or close the room', async () => {
    const { host, guest, code } = await setupRoom();
    expect(
      (await guest.patch(`/api/v1/rooms/${code}`).send({ controlMode: 'everyone' })).status,
    ).toBe(403);
    expect((await guest.delete(`/api/v1/rooms/${code}`)).status).toBe(403);
    const ok = await host.patch(`/api/v1/rooms/${code}`).send({ controlMode: 'everyone' });
    expect(ok.body.room.controlMode).toBe('everyone');
    expect((await host.delete(`/api/v1/rooms/${code}`)).status).toBe(204);
    expect((await guest.get(`/api/v1/rooms/${code}`)).status).toBe(404);
  });

  it('validates room codes and requires auth', async () => {
    const c = await signUp();
    expect((await c.get('/api/v1/rooms/abc')).status).toBe(400);
    expect((await client().get('/api/v1/rooms')).status).toBe(401);
  });
});

describe('rooms realtime', () => {
  it('rejects unauthenticated socket connections', async () => {
    await expect(connect(null)).rejects.toThrow('UNAUTHORIZED');
    await expect(connect({ cookie: 'streamify_token=garbage' })).rejects.toThrow('UNAUTHORIZED');
  });

  it('joins a room, returns state, and broadcasts presence', async () => {
    const { host, guest, code } = await setupRoom();
    const hs = await connect(host);
    const joined = await emit(hs, 'room:join', { code: code.toLowerCase() });
    expect(joined.ok).toBe(true);
    expect(joined.state).toMatchObject({ code, hostId: host.user.id, controlMode: 'host' });
    expect(joined.participants.map((p) => p.username)).toEqual([host.user.username]);

    const gs = await connect(guest);
    const presence = next(hs, 'room:participants', (d) => d.participants.length === 2);
    await emit(gs, 'room:join', { code });
    expect((await presence).participants.map((p) => p.id).sort()).toEqual(
      [host.user.id, guest.user.id].sort(),
    );

    // Leaving (or disconnecting) updates everyone else.
    const left = next(hs, 'room:participants', (d) => d.participants.length === 1);
    gs.disconnect();
    expect((await left).participants[0].id).toBe(host.user.id);
  });

  it('counts a user with several tabs once', async () => {
    const { host, code } = await setupRoom();
    const a = await connect(host);
    const b = await connect(host);
    await emit(a, 'room:join', { code });
    const res = await emit(b, 'room:join', { code });
    expect(res.participants).toHaveLength(1);
  });

  it('rejects unknown rooms and invalid payloads', async () => {
    const { host } = await setupRoom();
    const s = await connect(host);
    expect((await emit(s, 'room:join', { code: 'ZZZZZZ' })).error.code).toBe('NOT_FOUND');
    expect((await emit(s, 'room:join', { code: '<script>' })).error.code).toBe('VALIDATION_ERROR');
    expect((await emit(s, 'chat:send', { text: 'hi' })).error.code).toBe('NOT_IN_ROOM');
  });

  it('scopes chat to the room and persists history', async () => {
    const { host, guest, code } = await setupRoom();
    const outsider = await signUp();
    const other = await outsider.post('/api/v1/rooms').send({ name: 'Elsewhere' });

    const hs = await connect(host);
    const gs = await connect(guest);
    const os = await connect(outsider);
    await emit(hs, 'room:join', { code });
    await emit(gs, 'room:join', { code });
    await emit(os, 'room:join', { code: other.body.room.code });

    const received = next(gs, 'chat:message');
    const outsiderSilent = silent(os, 'chat:message');
    const sent = await emit(hs, 'chat:send', { text: '  hello room  ' });
    expect(sent.ok).toBe(true);
    expect(await received).toMatchObject({ text: 'hello room', username: host.user.username });
    expect(await outsiderSilent).toBe(true);

    const history = await guest.get(`/api/v1/rooms/${code}/messages`);
    expect(history.body.items.map((m) => m.text)).toEqual(['hello room']);
  });

  it('validates and rate-limits chat messages', async () => {
    const { host, code } = await setupRoom();
    const s = await connect(host);
    await emit(s, 'room:join', { code });
    expect((await emit(s, 'chat:send', { text: '   ' })).error.code).toBe('VALIDATION_ERROR');
    expect((await emit(s, 'chat:send', { text: 'x'.repeat(501) })).error.code).toBe(
      'VALIDATION_ERROR',
    );
    expect((await emit(s, 'chat:send', { text: 42 })).error.code).toBe('VALIDATION_ERROR');
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await emit(s, 'chat:send', { text: `m${i}` }));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.at(-1).error.code).toBe('RATE_LIMITED');
  });

  it('paginates chat history with a cursor', async () => {
    const { host, code } = await setupRoom();
    const s = await connect(host);
    await emit(s, 'room:join', { code });
    for (let i = 0; i < 5; i++) {
      await emit(s, 'chat:send', { text: `m${i}` });
      if (i === 3) await new Promise((r) => setTimeout(r, 5100)); // stay under the rate limit
    }
    const first = await host.get(`/api/v1/rooms/${code}/messages?limit=2`);
    expect(first.body.items.map((m) => m.text)).toEqual(['m3', 'm4']);
    const second = await host.get(
      `/api/v1/rooms/${code}/messages?limit=2&before=${first.body.nextCursor}`,
    );
    expect(second.body.items.map((m) => m.text)).toEqual(['m1', 'm2']);
    const third = await host.get(
      `/api/v1/rooms/${code}/messages?limit=2&before=${second.body.nextCursor}`,
    );
    expect(third.body.items.map((m) => m.text)).toEqual(['m0']);
    expect(third.body.nextCursor).toBeNull();
  }, 15_000);

  it('lets only the host control playback in host mode and syncs everyone', async () => {
    const { host, guest, tracks, code } = await setupRoom();
    const hs = await connect(host);
    const gs = await connect(guest);
    await emit(hs, 'room:join', { code });
    await emit(gs, 'room:join', { code });

    const denied = await emit(gs, 'playback:action', { type: 'setTrack', trackId: tracks[0].id });
    expect(denied.error.code).toBe('FORBIDDEN');

    const guestSees = next(gs, 'room:state', (s) => s.playback.isPlaying);
    const res = await emit(hs, 'playback:action', { type: 'setTrack', trackId: tracks[0].id });
    expect(res.ok).toBe(true);
    const state = await guestSees;
    expect(state.playback).toMatchObject({
      isPlaying: true,
      positionSec: 0,
      track: { id: tracks[0].id },
    });
    expect(state.queue.map((t) => t.id)).toEqual([tracks[0].id]);

    const paused = next(gs, 'room:state', (s) => !s.playback.isPlaying);
    await emit(hs, 'playback:action', { type: 'pause', positionSec: 12.5 });
    expect((await paused).playback.positionSec).toBe(12.5);

    // Seek is clamped to the track duration (60s in test data).
    const seek = await emit(hs, 'playback:action', { type: 'seek', positionSec: 999 });
    expect(seek.state.playback.positionSec).toBe(60);
    expect((await emit(gs, 'playback:action', { type: 'pause' })).error.code).toBe('FORBIDDEN');
    expect((await emit(hs, 'playback:action', { type: 'explode' })).error.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('allows guests to control playback when the host enables "everyone" mode', async () => {
    const { host, guest, tracks, code } = await setupRoom();
    const hs = await connect(host);
    const gs = await connect(guest);
    await emit(hs, 'room:join', { code });
    await emit(gs, 'room:join', { code });
    expect((await emit(gs, 'room:settings', { controlMode: 'everyone' })).error.code).toBe(
      'FORBIDDEN',
    );
    expect((await emit(hs, 'room:settings', { controlMode: 'everyone' })).ok).toBe(true);
    const res = await emit(gs, 'playback:action', { type: 'queueAdd', trackId: tracks[1].id });
    expect(res.ok).toBe(true);
    expect(res.state.playback.track.id).toBe(tracks[1].id);
  });

  it('advances the queue once on "ended" and ignores stale reports', async () => {
    const { host, guest, tracks, code } = await setupRoom();
    const hs = await connect(host);
    const gs = await connect(guest);
    await emit(hs, 'room:join', { code });
    await emit(gs, 'room:join', { code });
    await emit(hs, 'playback:action', { type: 'queueAdd', trackId: tracks[0].id });
    await emit(hs, 'playback:action', { type: 'queueAdd', trackId: tracks[1].id });
    const playing = await emit(hs, 'playback:action', { type: 'play' });
    const { version } = playing.state.playback;

    // Both clients report the end of the same track; only the first one applies.
    const [a, b] = await Promise.all([
      emit(hs, 'playback:action', { type: 'ended', trackId: tracks[0].id, version }),
      emit(gs, 'playback:action', { type: 'ended', trackId: tracks[0].id, version }),
    ]);
    expect([a.applied, b.applied].sort()).toEqual([false, true]);
    const room = await host.get(`/api/v1/rooms/${code}`);
    expect(room.body.room.playback.track.id).toBe(tracks[1].id);

    // End of queue: stops instead of wrapping around.
    const v2 = room.body.room.playback.version;
    const end = await emit(gs, 'playback:action', {
      type: 'ended',
      trackId: tracks[1].id,
      version: v2,
    });
    expect(end.state.playback).toMatchObject({ isPlaying: false, track: { id: tracks[1].id } });
  });

  it('restores the current state after a reconnect', async () => {
    const { host, guest, tracks, code } = await setupRoom();
    const hs = await connect(host);
    await emit(hs, 'room:join', { code });
    await emit(hs, 'playback:action', { type: 'setTrack', trackId: tracks[2].id });
    await emit(hs, 'playback:action', { type: 'seek', positionSec: 30 });

    let gs = await connect(guest);
    await emit(gs, 'room:join', { code });
    gs.disconnect();
    // Host keeps playing while the guest is offline.
    await emit(hs, 'playback:action', { type: 'seek', positionSec: 40 });

    gs = await connect(guest);
    const rejoin = await emit(gs, 'room:join', { code });
    expect(rejoin.state.playback.track.id).toBe(tracks[2].id);
    expect(rejoin.state.playback.positionSec).toBeGreaterThanOrEqual(40);
    expect(rejoin.state.serverTime).toBeTypeOf('number');
    expect(rejoin.participants).toHaveLength(2);
  });

  it('notifies members when the host closes the room', async () => {
    const { host, guest, code } = await setupRoom();
    const gs = await connect(guest);
    await emit(gs, 'room:join', { code });
    const closed = next(gs, 'room:closed');
    await host.delete(`/api/v1/rooms/${code}`);
    expect((await closed).code).toBe(code);
  });

  it('answers clock sync requests', async () => {
    const c = await signUp();
    const s = await connect(c);
    const before = Date.now();
    const res = await emit(s, 'time:sync');
    expect(res.serverTime).toBeGreaterThanOrEqual(before);
  });
});
