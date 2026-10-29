import mongoose from 'mongoose';

export const PLAYLIST_MAX_TRACKS = 500;

const playlistSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    isPublic: { type: Boolean, default: false },
    tracks: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
      validate: [(v) => v.length <= PLAYLIST_MAX_TRACKS, 'Playlist is full'],
    },
  },
  { timestamps: true },
);

// "My playlists" is listed by owner, most recently updated first.
playlistSchema.index({ owner: 1, updatedAt: -1 });

export const Playlist = mongoose.model('Playlist', playlistSchema);
