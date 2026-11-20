import mongoose from 'mongoose';
import { connectDB } from '../../../../lib/mongodb';
import GeneratedKey from '../../../../models/GeneratedKey';
import { apiJson, keyState } from '../../../../lib/keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function OPTIONS(req) { return new Response(null, { status: 204 }); }

// Historial público, sin contraseñas ni sesiones.
export async function GET(req) {
  const url = new URL(req.url);
  const estado = url.searchParams.get('estado') || 'generadas';
  if (!['generadas', 'canjeadas'].includes(estado)) {
    return apiJson(req, { success: false, error: 'estado debe ser generadas o canjeadas' }, 400);
  }
  const pageInput = url.searchParams.get('page') || '1';
  const limitInput = url.searchParams.get('limit') || '20';
  if (!/^\d{1,5}$/.test(pageInput) || !/^\d{1,3}$/.test(limitInput)) {
    return apiJson(req, { success: false, error: 'Parámetros page o limit inválidos' }, 400);
  }
  const page = Number(pageInput);
  const limit = Number(limitInput);
  if (page < 1 || page > 10000 || limit < 1 || limit > 100) {
    return apiJson(req, { success: false, error: 'page: 1-10000, limit: 1-100' }, 400);
  }
  const buscar = (url.searchParams.get('buscar') || '').trim();
  if (buscar.length > 100) {
    return apiJson(req, { success: false, error: 'Buscar admite máximo 100 caracteres' }, 400);
  }
  const query = { redeemedAt: estado === 'generadas' ? null : { $ne: null } };
  if (buscar) {
    const expr = buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { code: { $regex: expr, $options: 'i' } },
      ...(/^[a-f0-9]{24}$/i.test(buscar) ? [{ _id: new mongoose.Types.ObjectId(buscar) }] : [])
    ];
  }
  try {
    await connectDB();
    const [total, generadas, canjeadas, docs] = await Promise.all([
      GeneratedKey.countDocuments(query),
      GeneratedKey.countDocuments({ redeemedAt: null }),
      GeneratedKey.countDocuments({ redeemedAt: { $ne: null } }),
      GeneratedKey.find(query)
        .sort(estado === 'canjeadas' ? { redeemedAt: -1, _id: -1 } : { createdAt: -1, _id: -1 })
        .skip((page - 1) * limit).limit(limit)
        .select('_id code createdAt redeemedAt expiresAt').lean()
    ]);
    const items = docs.map(doc => ({
      referencia: String(doc._id),
      key: doc.code,
      estado: keyState(doc),
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt || null,
      redeemedAt: doc.redeemedAt || null
    }));
    return apiJson(req, { success: true, estado, items, total, page,
      pages: Math.max(1, Math.ceil(total / limit)), limit,
      conteos: { generadas, canjeadas, total: generadas + canjeadas } });
  } catch (error) {
    console.error('Keys listar:', error);
    return apiJson(req, { success: false, error: 'Error al consultar las keys. Revisa MongoDB.' }, 500);
  }
}
