import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    text: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// History is read newest-first with a cursor on (createdAt, _id).
chatMessageSchema.index({ room: 1, createdAt: -1, _id: -1 });

export function toMessageDto(m) {
  return {
    id: String(m._id),
    userId: String(m.user),
    username: m.username,
    text: m.text,
    createdAt: new Date(m.createdAt).toISOString(),
  };
}

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
