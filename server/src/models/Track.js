import mongoose from 'mongoose';

const trackSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    album: { type: String, trim: true, default: '' },
    genre: { type: String, required: true, trim: true, lowercase: true },
    mood: { type: String, trim: true, default: '' },
    tags: { type: [String], default: [] },
    durationSec: { type: Number, required: true, min: 1 },
    bpm: { type: Number, min: 1 },
    musicalKey: { type: String, default: '' },
    releaseYear: { type: Number },
    // Hue used by the client to draw generated cover art (no third-party images).
    coverHue: { type: Number, min: 0, max: 360, default: 260 },
    // Either a file inside AUDIO_DIR or an external URL to a legally usable sample.
    audioFile: { type: String },
    audioUrl: { type: String },
    license: { type: String, required: true },
    playCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Full-text search across the fields people actually search by. Weights favour titles.
trackSchema.index(
  { title: 'text', artist: 'text', album: 'text', tags: 'text', genre: 'text' },
  { weights: { title: 10, artist: 6, album: 3, tags: 2, genre: 2 }, name: 'track_text' },
);
// Catalogue listing: optional genre filter + one of the supported sorts.
trackSchema.index({ genre: 1, createdAt: -1 });
trackSchema.index({ genre: 1, playCount: -1 });
trackSchema.index({ genre: 1, title: 1 });
trackSchema.index({ createdAt: -1 });
trackSchema.index({ playCount: -1 });
trackSchema.index({ title: 1 });

trackSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => toTrackDto(ret),
});

/** Shape a track (document or lean object) for the API. */
export function toTrackDto(t) {
  return {
    id: String(t._id ?? t.id),
    title: t.title,
    artist: t.artist,
    album: t.album,
    genre: t.genre,
    mood: t.mood,
    tags: t.tags,
    durationSec: t.durationSec,
    bpm: t.bpm,
    musicalKey: t.musicalKey,
    releaseYear: t.releaseYear,
    coverHue: t.coverHue,
    license: t.license,
    playCount: t.playCount,
    streamUrl: t.audioUrl || `/api/v1/tracks/${String(t._id ?? t.id)}/stream`,
  };
}

export const Track = mongoose.model('Track', trackSchema);
