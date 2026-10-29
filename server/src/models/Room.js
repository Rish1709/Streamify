import mongoose from 'mongoose';

export const ROOM_QUEUE_MAX = 100;

const playbackSchema = new mongoose.Schema(
  {
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', default: null },
    isPlaying: { type: Boolean, default: false },
    // Position (seconds) at the moment `updatedAt` was recorded. Clients extrapolate
    // the live position as positionSec + (now - updatedAt) while playing.
    positionSec: { type: Number, default: 0, min: 0 },
    updatedAt: { type: Date, default: Date.now },
    // Incremented on every change so stale client events (e.g. a late "track ended")
    // can be detected and ignored.
    version: { type: Number, default: 0 },
  },
  { _id: false },
);

const roomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isPublic: { type: Boolean, default: true },
    // 'host': only the host controls playback; 'everyone': any participant can.
    controlMode: { type: String, enum: ['host', 'everyone'], default: 'host' },
    queue: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }], default: [] },
    playback: { type: playbackSchema, default: () => ({}) },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

roomSchema.index({ code: 1 }, { unique: true });
roomSchema.index({ isPublic: 1, lastActiveAt: -1 });
roomSchema.index({ host: 1, createdAt: -1 });

export const Room = mongoose.model('Room', roomSchema);
