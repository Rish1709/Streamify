import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(uri = config.MONGO_URI) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Build indexes declared on the schemas (idempotent).
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  logger.info('MongoDB connected');
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export const isDbReady = () => mongoose.connection.readyState === 1;
