import { Redis } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from './logger.js';

// Cache-aside helper on top of Redis.
//
// Redis is optional: when REDIS_URL is empty, or the server is unreachable, every
// operation degrades to a no-op/miss so the API keeps working straight from MongoDB.
let client = null;

export function initCache(url = config.REDIS_URL) {
  if (!url) {
    logger.warn('REDIS_URL is empty: caching disabled');
    return null;
  }
  client = new Redis(url, {
    lazyConnect: false,
    // Fail fast instead of queueing commands while Redis is down.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  });
  let warned = false;
  client.on('ready', () => {
    warned = false;
    logger.info('Redis connected');
  });
  client.on('error', (err) => {
    if (!warned) logger.warn({ err: err.message }, 'Redis unavailable: serving without cache');
    warned = true;
  });
  return client;
}

export const isCacheReady = () => client?.status === 'ready';

export async function closeCache() {
  if (client) {
    client.disconnect();
    client = null;
  }
}

async function safe(fn, fallback) {
  if (!isCacheReady()) return fallback;
  try {
    return await fn(client);
  } catch (err) {
    logger.debug({ err: err.message }, 'cache operation failed');
    return fallback;
  }
}

export const cacheGet = async (key) => {
  const raw = await safe((c) => c.get(key), null);
  return raw === null ? null : JSON.parse(raw);
};

export const cacheSet = (key, value, ttlSec) =>
  safe((c) => c.set(key, JSON.stringify(value), 'EX', ttlSec), null);

export const cacheDel = (...keys) => safe((c) => c.del(...keys), 0);

/**
 * Returns { value, status } where status is HIT, MISS or BYPASS (Redis unavailable).
 */
export async function getOrSet(key, ttlSec, compute) {
  if (!isCacheReady()) return { value: await compute(), status: 'BYPASS' };
  const cached = await cacheGet(key);
  if (cached !== null) return { value: cached, status: 'HIT' };
  const value = await compute();
  await cacheSet(key, value, ttlSec);
  return { value, status: 'MISS' };
}

// Namespace versions give cheap bulk invalidation: bumping the version makes every
// key built from the old version unreachable, and those keys then expire via TTL.
export const getNamespaceVersion = (ns) =>
  safe(async (c) => Number((await c.get(`ns:${ns}:v`)) ?? 0), 0);

export const bumpNamespaceVersion = (ns) => safe((c) => c.incr(`ns:${ns}:v`), 0);

// Raw access for features that need more than key/value (e.g. token denylist).
export const withCache = safe;
