import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  nombre: { type: String, required: true, trim: true },
  username: { type: String, default: '', trim: true },
  botBloqueado: { type: Boolean, default: false, index: true },
  fechaRegistro: { type: Date, default: Date.now },
  fechaBloqueo: { type: Date, default: null },
  motivoBloqueo: { type: String, default: '', trim: true },
  baneadoPor: { type: String, default: '', trim: true },
  ultimaActividad: { type: Date, default: Date.now },
  ultimaActualizacion: { type: Date, default: Date.now }
}, { versionKey: false, collection: 'users' });

export default mongoose.models.User || mongoose.model('User', UserSchema);
