import http from 'node:http';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectDb, disconnectDb } from './lib/db.js';
import { closeCache, initCache } from './lib/cache.js';
import { createApp } from './app.js';
import { createSocketServer } from './realtime/index.js';

async function main() {
  initCache();
  await connectDb();

  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);

  server.listen(config.PORT, () => logger.info(`API listening on http://localhost:${config.PORT}`));

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    io.close();
    server.close();
    await Promise.allSettled([disconnectDb(), closeCache()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
