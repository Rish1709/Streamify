import { Router } from 'express';
import { isDbReady } from '../../lib/db.js';
import { isCacheReady } from '../../lib/cache.js';

export const healthRouter = Router();

// Liveness/readiness probe. Redis is optional, so its absence reports "degraded"
// but still 200; MongoDB is required.
healthRouter.get('/', (_req, res) => {
  const db = isDbReady();
  const cache = isCacheReady();
  res.status(db ? 200 : 503).json({
    status: db ? (cache ? 'ok' : 'degraded') : 'down',
    mongo: db ? 'up' : 'down',
    redis: cache ? 'up' : 'unavailable',
    uptimeSec: Math.round(process.uptime()),
  });
});
