import pino from 'pino';
import { config } from '../config/env.js';

// Structured JSON logs in production, pretty logs in development.
// Sensitive fields are redacted so tokens and passwords never reach log storage.
export const logger = pino({
  level: config.isTest ? 'silent' : config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[redacted]',
  },
  ...(config.isProd || config.isTest
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
});
