import mongoose from 'mongoose';

const { Schema } = mongoose;

const UserSchema = new Schema({
  username: { type: String, required: true, index: true },
  email: { type: String, required: true, index: true, unique: true },
  passwordHash: { type: String },
  provider: { type: String, default: 'local' },
  profileDescription: { type: String },
  settings: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

UserSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
