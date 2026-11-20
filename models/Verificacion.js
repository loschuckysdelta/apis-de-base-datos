import mongoose from 'mongoose';

// Una verificación activa por Telegram ID. MongoDB elimina documentos vencidos
// de forma asíncrona; la API compara siempre expiraEn con la hora actual.
const VerificacionSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  verificadoEn: { type: Date, required: true },
  expiraEn: { type: Date, required: true },
  vecesVerificado: { type: Number, default: 1, min: 1 }
}, { collection: 'verificaciones', versionKey: false });

VerificacionSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.Verificacion || mongoose.model('Verificacion', VerificacionSchema);
