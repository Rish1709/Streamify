import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { createApp } from '../src/app.js';
import { Track } from '../src/models/index.js';
import { resetPresence } from '../src/realtime/presence.js';

/** Connects to a fresh database for this test file and wipes it between tests. */
export function useTestDb() {
  beforeAll(async () => {
    const base = inject('mongoUri').replace(/\/?(\?.*)?$/, '');
    await connectDb(`${base}/streamify-test-${crypto.randomUUID().slice(0, 8)}`);
  });
  beforeEach(async () => {
    resetPresence();
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });
}

const app = createApp();

/**
 * A cookie-keeping HTTP client that always sends the CSRF header, like the browser
 * client does.
 */
export function client(appInstance = app) {
  const agent = request.agent(appInstance);
  const wrap = (method) => (url) => agent[method](url).set('X-Requested-With', 'streamify');
  return {
    agent,
    get: wrap('get'),
    post: wrap('post'),
    put: wrap('put'),
    patch: wrap('patch'),
    delete: wrap('delete'),
    cookie: null,
  };
}

let counter = 0;
export async function signUp(c = client(), overrides = {}) {
  counter += 1;
  const body = {
    username: `user${counter}${crypto.randomUUID().slice(0, 4)}`,
    email: `user${counter}-${crypto.randomUUID().slice(0, 6)}@test.local`,
    password: 'password123',
    ...overrides,
  };
  const res = await c.post('/api/v1/auth/register').send(body);
  if (res.status !== 201)
    throw new Error(`signUp failed: ${res.status} ${JSON.stringify(res.body)}`);
  c.user = res.body.user;
  c.cookie = res.headers['set-cookie'].find((h) => h.startsWith('streamify_token=')).split(';')[0];
  return c;
}

export async function makeTracks(n, overrides = () => ({})) {
  const docs = Array.from({ length: n }, (_, i) => ({
    title: `Track ${String(i).padStart(2, '0')}`,
    artist: i % 2 ? 'Odd Artist' : 'Even Artist',
    album: 'Test Album',
    genre: i % 3 === 0 ? 'ambient' : 'house',
    durationSec: 60,
    license: 'test',
    playCount: i,
    createdAt: new Date(Date.UTC(2025, 0, 1) + i * 1000),
    ...overrides(i),
  }));
  return Track.insertMany(docs);
}

export { app };
