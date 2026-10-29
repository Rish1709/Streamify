import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// All configuration is read once, validated, and exported as a frozen object.
// Invalid configuration fails fast at startup instead of surfacing as runtime bugs.
const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/streamify'),
  // Empty string disables Redis entirely (the app falls back to no caching).
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN_SEC: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  // Comma-separated list of allowed browser origins for CORS and Socket.IO.
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: booleanish.optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  AUDIO_DIR: z.string().default('storage/audio'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
});

function load() {
  const raw = { ...process.env };
  if (raw.NODE_ENV === 'test' && !raw.JWT_SECRET) {
    raw.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // Logger depends on config, so use stderr directly here.
    console.error(`Invalid environment configuration:\n${issues.join('\n')}`);
    process.exit(1);
  }
  const env = parsed.data;
  return Object.freeze({
    ...env,
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    clientOrigins: env.CLIENT_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    // Relative paths are resolved against the server package, not the shell's cwd.
    AUDIO_DIR: path.resolve(SERVER_ROOT, env.AUDIO_DIR),
  });
}

export const config = load();
