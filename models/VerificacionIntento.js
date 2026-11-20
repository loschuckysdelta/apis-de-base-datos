import mongoose from 'mongoose';

const VerificacionIntentoSchema = new mongoose.Schema({
  identidad: { type: String, required: true },
  ventana: { type: Date, required: true },
  intentos: { type: Number, required: true, default: 0 },
  eliminarEn: { type: Date, required: true }
}, { collection: 'verificacion_intentos', versionKey: false });

VerificacionIntentoSchema.index({ identidad: 1, ventana: 1 }, { unique: true });
VerificacionIntentoSchema.index({ eliminarEn: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.VerificacionIntento || mongoose.model('VerificacionIntento', VerificacionIntentoSchema);
