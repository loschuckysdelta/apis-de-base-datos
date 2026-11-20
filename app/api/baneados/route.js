import { adminAuthorized, unauthorized } from '../../../lib/admin-auth';
import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CORS_HEADERS = {
  // Restricted: private routes require same-origin session or server-side X-API-Key.
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
    const telegramIdParam = (searchParams.get('telegramId') || '').trim().slice(0, 100);
    const page = Math.max(Number.parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') || '10', 10) || 10, 1), 100);

    await connectDB();

    if (telegramIdParam) {
      const telegramId = Number(telegramIdParam);
      if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
        return json({ success: false, error: 'telegramId inválido' }, 400);
      }
      const usuario = await User.findOne({ telegramId })
        .select('telegramId nombre username botBloqueado fechaBloqueo motivoBloqueo baneadoPor -_id')
        .lean();
      return json({
        success: true,
        baneado: Boolean(usuario?.botBloqueado),
        usuario: usuario || null
      });
    }

    const filter = { botBloqueado: true };
    if (buscar) {
      const clean = safeRegex(buscar.replace(/^@/, ''));
      const asNumber = Number(buscar);
      filter.$or = [
        { nombre: { $regex: clean, $options: 'i' } },
        { username: { $regex: clean, $options: 'i' } },
        { motivoBloqueo: { $regex: clean, $options: 'i' } }
      ];
      if (Number.isSafeInteger(asNumber) && asNumber > 0) filter.$or.push({ telegramId: asNumber });
    }

    const projection = 'telegramId nombre username botBloqueado fechaBloqueo motivoBloqueo baneadoPor fechaRegistro ultimaActividad ultimaActualizacion -_id';
    const [baneados, total] = await Promise.all([
      User.find(filter)
        .select(projection)
        .sort({ fechaBloqueo: -1, telegramId: -1 })
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
      baneados
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
    const motivo = String(body.motivo || body.motivoBloqueo || '').trim().slice(0, 180);
    const baneadoPor = String(body.baneadoPor || 'Panel CHUCKY').trim().slice(0, 80);

    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return json({ success: false, error: 'telegramId inválido' }, 400);
    }

    await connectDB();
    const now = new Date();
    const usuario = await User.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          botBloqueado: true,
          fechaBloqueo: now,
          motivoBloqueo: motivo,
          baneadoPor,
          ultimaActualizacion: now
        }
      },
      { new: true, runValidators: true }
    ).select('telegramId nombre username botBloqueado fechaBloqueo motivoBloqueo baneadoPor -_id').lean();

    if (!usuario) {
      return json({ success: false, error: 'El usuario no existe en la API de usuarios' }, 404);
    }

    return json({ success: true, message: 'Usuario baneado correctamente', usuario });
  } catch (error) {
    return json({ success: false, error: 'Error interno del servidor' }, 500);
  }
}

export async function DELETE(request) {
  if (!(adminAuthorized(request))) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const telegramId = Number(searchParams.get('telegramId'));
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return json({ success: false, error: 'telegramId inválido' }, 400);
    }

    await connectDB();
    const now = new Date();
    const usuario = await User.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          botBloqueado: false,
          fechaBloqueo: null,
          motivoBloqueo: '',
          baneadoPor: '',
          ultimaActualizacion: now
        }
      },
      { new: true, runValidators: true }
    ).select('telegramId nombre username botBloqueado fechaBloqueo motivoBloqueo baneadoPor -_id').lean();

    if (!usuario) {
      return json({ success: false, error: 'El usuario no existe en la API de usuarios' }, 404);
    }

    return json({ success: true, message: 'Usuario desbaneado correctamente', usuario });
  } catch (error) {
    return json({ success: false, error: 'Error interno del servidor' }, 500);
  }
}
