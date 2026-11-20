import mongoose from 'mongoose';

// Límite compartido entre instancias de Vercel: no depende de memoria local.
const KeyAttemptSchema = new mongoose.Schema({
  identityHash: { type: String, required: true },
  windowStart: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  deleteAt: { type: Date, required: true }
}, { versionKey: false, collection: 'key_redeem_attempts' });

KeyAttemptSchema.index({ identityHash: 1, windowStart: 1 }, { unique: true });
KeyAttemptSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.KeyAttempt || mongoose.model('KeyAttempt', KeyAttemptSchema);
