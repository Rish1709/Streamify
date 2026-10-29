// Seeds the demo catalogue, demo users, a playlist and a listening room.
// Usage: npm run seed [-- --reset]   (--reset wipes users/playlists/rooms/likes too)
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { closeCache, initCache } from '../src/lib/cache.js';
import { ChatMessage, Like, Playlist, Room, Track, User } from '../src/models/index.js';
import { invalidateCatalog } from '../src/modules/tracks/tracks.service.js';
import { CATALOG, LICENSE } from './catalog.js';
import { audioFileName, generateAudio } from './generate-audio.js';

// Local development accounts only. Never reuse these credentials anywhere real.
export const DEMO_USERS = [
  { username: 'demo', email: 'demo@streamify.local', password: 'demo1234' },
  { username: 'guest', email: 'guest@streamify.local', password: 'guest1234' },
];

export async function seed({ reset = false, generate = true, log = console.log } = {}) {
  if (generate) {
    log(`Generating demo audio in ${config.AUDIO_DIR} (skips existing files)...`);
    generateAudio({ audioDir: config.AUDIO_DIR, log });
  }

  if (reset) {
    await Promise.all([User, Playlist, Room, Like, ChatMessage].map((m) => m.deleteMany({})));
    log('Reset users, playlists, rooms, likes and chat.');
  }

  // Upsert tracks by (title, artist) so the seed is idempotent and keeps track ids
  // stable across runs (playlists keep working after re-seeding).
  const baseDate = Date.UTC(2025, 0, 1);
  const ops = CATALOG.map((entry, i) => ({
    updateOne: {
      filter: { title: entry.title, artist: entry.artist },
      update: {
        $set: {
          album: entry.album,
          genre: entry.genre,
          mood: entry.mood,
          tags: entry.tags,
          durationSec: entry.synth.durationSec,
          bpm: entry.synth.bpm,
          musicalKey: entry.key,
          releaseYear: entry.year,
          coverHue: entry.hue,
          audioFile: audioFileName(entry),
          license: LICENSE,
        },
        $setOnInsert: {
          createdAt: new Date(baseDate + i * 86_400_000),
          playCount: (i * 37) % 120,
        },
      },
      upsert: true,
    },
  }));
  const res = await Track.bulkWrite(ops, { timestamps: false });
  log(
    `Tracks: ${res.upsertedCount} inserted, ${res.modifiedCount} updated, ${CATALOG.length} total.`,
  );
  await invalidateCatalog();

  const users = [];
  for (const u of DEMO_USERS) {
    let user = await User.findOne({ email: u.email });
    if (!user) {
      user = await User.create({
        username: u.username,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
      });
      log(`Created demo user ${u.email} / ${u.password}`);
    }
    users.push(user);
  }

  const [demo] = users;
  if (!(await Playlist.exists({ owner: demo._id }))) {
    const chill = await Track.find({ genre: { $in: ['lofi', 'ambient'] } })
      .sort({ title: 1 })
      .lean();
    await Playlist.create({
      owner: demo._id,
      name: 'Focus Mix',
      description: 'Lo-fi and ambient for deep work.',
      isPublic: true,
      tracks: chill.map((t) => t._id),
    });
    log('Created playlist "Focus Mix" for demo user.');
  }

  if (!(await Room.exists({ host: demo._id }))) {
    const queue = await Track.find({ genre: 'synthwave' }).sort({ title: 1 }).lean();
    await Room.create({
      code: 'DEMO42',
      name: 'Friday Night Synthwave',
      host: demo._id,
      isPublic: true,
      queue: queue.map((t) => t._id),
      playback: { trackId: queue[0]?._id ?? null, isPlaying: false, positionSec: 0 },
    });
    log('Created public room DEMO42 hosted by demo.');
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  initCache();
  try {
    await connectDb();
    await seed({ reset: process.argv.includes('--reset') });
    console.log('Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
    await closeCache();
    await mongoose.disconnect();
  }
}
