import { connectDB } from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Verificacion from '../../../../models/Verificacion';
import { json, options, originAllowed } from '../../../../lib/verificar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req) { return options(req); }

// Consulta directa, sin sesión de administrador.
export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.get('page'), 10) || 1));
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get('limit'), 10) || 20));
  try {
    await connectDB();
    const filter = { expiraEn: { $gt: new Date() } };
    const [records, total] = await Promise.all([
      Verificacion.find(filter).sort({ verificadoEn: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Verificacion.countDocuments(filter)
    ]);
    const users = await User.find({ telegramId: { $in: records.map(record => record.telegramId) } })
      .select('telegramId nombre username -_id').lean();
    const userById = new Map(users.map(user => [user.telegramId, user]));
    return json(req, {
      success: true, total, page, pages: Math.max(1, Math.ceil(total / limit)),
      verificaciones: records.map(record => ({
        telegramId: String(record.telegramId),
        nombre: userById.get(record.telegramId)?.nombre || '',
        username: userById.get(record.telegramId)?.username || '',
        verificado: true,
        verificadoEn: record.verificadoEn,
        expiraEn: record.expiraEn,
        vecesVerificado: record.vecesVerificado || 1
      }))
    });
  } catch (error) {
    console.error('Verificaciones registros:', error);
    return json(req, { success: false, error: 'No se pudo consultar el registro' }, 500);
  }
}
