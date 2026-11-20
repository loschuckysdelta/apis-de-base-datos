import mongoose from 'mongoose';

const ContactoSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  username: { type: String, default: '', trim: true, index: true },
  nombre: { type: String, required: true, trim: true, index: true },
  telefono: { type: String, required: true, trim: true, index: true },
  fechaRegistro: { type: Date, default: Date.now },
  ultimaActualizacion: { type: Date, default: Date.now }
}, { versionKey: false, collection: 'contactos' });

export default mongoose.models.Contacto || mongoose.model('Contacto', ContactoSchema);
