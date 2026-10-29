import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.js'],
    env: {
      NODE_ENV: 'test',
      // Redis is opt-in for tests (see test/cache.test.js); the rest run without it.
      REDIS_URL: '',
      AUDIO_DIR: path.join(os.tmpdir(), 'streamify-test-audio'),
      AUTH_RATE_LIMIT_MAX: '1000',
    },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
