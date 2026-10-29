import mongoose from 'mongoose';

// A separate collection (instead of an array on User) keeps user documents small
// and lets "liked songs" be paginated by time.
const likeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    track: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

likeSchema.index({ user: 1, track: 1 }, { unique: true });
likeSchema.index({ user: 1, createdAt: -1 });

export const Like = mongoose.model('Like', likeSchema);
