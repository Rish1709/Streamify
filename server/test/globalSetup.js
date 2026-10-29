import { MongoMemoryServer } from 'mongodb-memory-server';

// One in-memory mongod for the whole run; each test file uses its own database.
// Set MONGOMS_SYSTEM_BINARY to use a locally installed mongod instead of downloading.
let mongod;

export async function setup(project) {
  mongod = await MongoMemoryServer.create();
  project.provide('mongoUri', mongod.getUri());
}

export async function teardown() {
  await mongod?.stop();
}
