import mongoose from 'mongoose';

const GeneratedKeySchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, match: /^\d{6}$/ },
  // Identificador opcional de una página o cliente: conserva una sola key.
  clientId: { type: String, trim: true, maxlength: 100 },
  expiresAt: { type: Date, default: null },
  redeemedAt: { type: Date, default: null },
  redeemedBy: { type: String, default: null, maxlength: 100 }
}, { timestamps: true, versionKey: false, collection: 'generated_keys' });

GeneratedKeySchema.index({ clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });
GeneratedKeySchema.index({ redeemedAt: 1, expiresAt: 1 });

export default mongoose.models.GeneratedKey || mongoose.model('GeneratedKey', GeneratedKeySchema);
