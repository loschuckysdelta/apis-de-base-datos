import { adminAuthorized, unauthorized } from '../../../lib/admin-auth';
import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CORS_HEADERS = {
  // Restricted: private routes require same-origin session or server-side X-API-Key.
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
};

function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function safeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(request) {
  if (!(adminAuthorized(request))) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const buscar = (searchParams.get('buscar') || searchParams.get('q') || '').trim().slice(0, 100);
    const estado = (searchParams.get('estado') || 'todos').toLowerCase();
    const page = Math.max(Number.parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') || '10', 10) || 10, 1), 100);

    await connectDB();

    const filter = {};
    if (estado === 'activos') filter.botBloqueado = { $ne: true };
    if (estado === 'bloqueados') filter.botBloqueado = true;

    if (buscar) {
      const clean = safeRegex(buscar.replace(/^@/, ''));
      const asNumber = Number(buscar);
      filter.$or = [
        { nombre: { $regex: clean, $options: 'i' } },
        { username: { $regex: clean, $options: 'i' } }
      ];
      if (Number.isSafeInteger(asNumber) && asNumber > 0) filter.$or.push({ telegramId: asNumber });
    }

    const projection = 'telegramId nombre username botBloqueado fechaRegistro fechaBloqueo motivoBloqueo baneadoPor ultimaActividad ultimaActualizacion -_id';
    const [usuarios, total] = await Promise.all([
      User.find(filter)
        .select(projection)
        .sort({ fechaRegistro: -1, telegramId: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    return json({
      success: true,
      total,
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      usuarios
    });
  } catch (error) {
    return json({ success: false, error: 'Error interno del servidor' }, 500);
  }
}

export async function POST(request) {
  if (!(adminAuthorized(request))) return unauthorized();
  try {
    const body = await request.json();
    const telegramId = Number(body.telegramId);
    const nombre = String(body.nombre || body.name || '').trim().slice(0, 200);
    const username = String(body.username || '').trim().replace(/^@/, '').slice(0, 64);

    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return json({ success: false, error: 'telegramId inválido' }, 400);
    }
    if (!nombre) {
      return json({ success: false, error: 'nombre es obligatorio' }, 400);
    }

    await connectDB();
    const now = new Date();
    const set = { nombre, username, ultimaActividad: now, ultimaActualizacion: now };

    if (typeof body.botBloqueado === 'boolean') {
      set.botBloqueado = body.botBloqueado;
      set.fechaBloqueo = body.botBloqueado ? now : null;
      if (!body.botBloqueado) { set.motivoBloqueo = ''; set.baneadoPor = ''; }
    }

    const usuario = await User.findOneAndUpdate(
      { telegramId },
      { $set: set, $setOnInsert: { fechaRegistro: now, botBloqueado: false } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).select('telegramId nombre username botBloqueado fechaRegistro fechaBloqueo motivoBloqueo baneadoPor ultimaActividad ultimaActualizacion -_id').lean();

    return json({ success: true, message: 'Usuario registrado o actualizado', usuario });
  } catch (error) {
    return json({ success: false, error: 'Error interno del servidor' }, 500);
  }
}
