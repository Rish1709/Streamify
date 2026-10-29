import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    // Never selected by default, so it cannot leak through a normal query.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

// Login looks users up by email; registration checks both fields for uniqueness.
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), username: this.username, email: this.email };
};

export const User = mongoose.model('User', userSchema);
