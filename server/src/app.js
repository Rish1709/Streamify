import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { requireCsrfHeader } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { tracksRouter } from './modules/tracks/tracks.routes.js';
import { playlistsRouter } from './modules/playlists/playlists.routes.js';
import { roomsRouter } from './modules/rooms/rooms.routes.js';
import { healthRouter } from './modules/health/health.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind nginx / a load balancer in Docker and production, so trust one proxy hop
  // (needed for correct client IPs in rate limiting and secure cookies).
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      // Keep logs small and free of personal data: method, url, status, timing.
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: config.clientOrigins,
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization'],
      exposedHeaders: ['X-Cache'],
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  const v1 = express.Router();
  v1.use(requireCsrfHeader);
  v1.use('/health', healthRouter);
  v1.use('/auth', authRouter);
  v1.use('/tracks', tracksRouter);
  v1.use('/playlists', playlistsRouter);
  v1.use('/rooms', roomsRouter);
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
