import { adminAuthorized, unauthorized } from '../../../lib/admin-auth';
import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/mongodb';
import Contacto from '../../../models/Contacto';

export const dynamic = 'force-dynamic';

const MAX_REGISTROS_IMPORTACION = 1000;
const CORS_HEADERS = {
  // Restricted: private routes require same-origin session or server-side X-API-Key.
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Cache-Control': 'no-store'
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

function soloNumeros(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function esIdCorto(valor) {
  const numero = soloNumeros(valor);
  return /^\d{5,10}$/.test(numero) && Number.isSafeInteger(Number(numero)) && Number(numero) > 0;
}

function esTelefonoLargo(valor) {
  const numero = soloNumeros(valor);
  return /^\d{11,15}$/.test(numero);
}

function formatearTelefono(valor) {
  const original = String(valor ?? '').trim();
  const numero = soloNumeros(original);
  if (!numero) return original;
  if (esTelefonoLargo(numero)) return `+${numero}`;
  return original.replace(/[\s-]/g, '');
}

function normalizarRegistro(registro) {
  let telegramRaw = String(registro.telegramId ?? registro.idTelegram ?? registro.id ?? '').trim();
  let telefonoRaw = String(registro.telefono ?? registro.phone ?? '').trim().replace(/[\s-]/g, '');

  const idNumeros = soloNumeros(telegramRaw);
  const telefonoNumeros = soloNumeros(telefonoRaw);

  // Regla simple de esta base: número corto = ID Telegram; número largo = teléfono.
  if (esTelefonoLargo(idNumeros) && esIdCorto(telefonoNumeros)) {
    telegramRaw = telefonoNumeros;
    telefonoRaw = `+${idNumeros}`;
  } else if (esTelefonoLargo(telefonoNumeros)) {
    telefonoRaw = `+${telefonoNumeros}`;
  }

  const telegramId = Number(telegramRaw);
  const username = String(registro.username || '').trim().replace(/^@/, '').slice(0, 64);
  const nombre = String(registro.nombre || registro.name || '').trim().slice(0, 200);
  const telefono = String(telefonoRaw).trim().replace(/[\s-]/g, '');

  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw new Error('ID de Telegram inválido');
  }
  if (!/^\+?\d{5,20}$/.test(telefono)) throw new Error('El teléfono es inválido');

  return { telegramId, username, nombre: nombre || 'Sin nombre', telefono };
}
function parsearLinea(linea) {
  const partes = String(linea || '').split('|').map(valor => valor.trim());
  if (partes.length < 4) {
    throw new Error(`Formato inválido: ${linea}`);
  }

  return normalizarRegistro({
    telegramId: partes[0],
    username: partes[1],
    nombre: partes.slice(2, -1).join(' | '),
    telefono: partes.at(-1)
  });
}

export async function GET(request) {
  if (!(adminAuthorized(request))) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const buscar = (searchParams.get('buscar') || searchParams.get('q') || '').trim().slice(0, 100);
    const page = Math.min(10000, Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1));
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);

    await connectDB();

    const filter = {};
    if (buscar) {
      const clean = safeRegex(buscar.replace(/^@/, ''));
      const asNumber = Number(buscar);
      filter.$or = [
        { username: { $regex: clean, $options: 'i' } },
        { nombre: { $regex: clean, $options: 'i' } },
        { telefono: { $regex: clean, $options: 'i' } }
      ];
      if (Number.isSafeInteger(asNumber)) filter.$or.push({ telegramId: asNumber });
    }

    const projection = 'telegramId username nombre telefono fechaRegistro ultimaActualizacion -_id';
    const [contactos, total] = await Promise.all([
      Contacto.find(filter)
        .select(projection)
        .sort({ fechaRegistro: -1, telegramId: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Contacto.countDocuments(filter)
    ]);

    return json({
      success: true,
      endpoint: '/api/contactos',
      total,
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      contactos
    });
  } catch (error) {
    return json({ success: false, error: 'Error interno del servidor' }, 500);
  }
}

export async function POST(request) {
  if (!(adminAuthorized(request))) return unauthorized();
  try {
    const body = await request.json();
    let registros = [];

    if (typeof body.lineas === 'string') {
      const lineas = body.lineas
        .split(/\r?\n/)
        .map(linea => linea.trim())
        .filter(Boolean);

      if (lineas.length > MAX_REGISTROS_IMPORTACION) {
        return json({
          success: false,
          error: `El máximo permitido es ${MAX_REGISTROS_IMPORTACION} registros por solicitud`
        }, 400);
      }

      registros = lineas.map((linea, indice) => {
        try {
          return parsearLinea(linea);
        } catch (error) {
          throw new Error(`Línea ${indice + 1}: ${error.message}`);
        }
      });
    } else if (Array.isArray(body.registros)) {
      if (body.registros.length > MAX_REGISTROS_IMPORTACION) {
        return json({
          success: false,
          error: `El máximo permitido es ${MAX_REGISTROS_IMPORTACION} registros por solicitud`
        }, 400);
      }
      registros = body.registros.map(normalizarRegistro);
    } else {
      registros = [normalizarRegistro(body)];
    }

    if (!registros.length) {
      return json({ success: false, error: 'No se recibieron registros' }, 400);
    }

    await connectDB();
    const ahora = new Date();
    const registrosUnicos = [...new Map(registros.map(registro => [registro.telegramId, registro])).values()];
    const operaciones = registrosUnicos.map(registro => ({
      updateOne: {
        filter: { telegramId: registro.telegramId },
        update: {
          $set: { ...registro, ultimaActualizacion: ahora },
          $setOnInsert: { fechaRegistro: ahora }
        },
        upsert: true
      }
    }));

    const resultado = await Contacto.bulkWrite(operaciones, { ordered: false });
    const insertados = Number(resultado.upsertedCount || 0);
    const actualizados = Math.max(registrosUnicos.length - insertados, 0);

    return json({
      success: true,
      endpoint: '/api/contactos',
      method: 'POST',
      message: `${registrosUnicos.length} contacto(s) guardado(s)`,
      cantidad: registrosUnicos.length,
      recibidos: registros.length,
      duplicadosEnArchivo: registros.length - registrosUnicos.length,
      insertados,
      actualizados
    });
  } catch (error) {
    const status = /inválido|obligatorio|Formato|No se recibieron|Línea|máximo permitido/.test(error.message) ? 400 : 500;
    return json({ success: false, error: error.message }, status);
  }
}

export async function DELETE(request) {
  if (!(adminAuthorized(request))) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const telegramId = Number(searchParams.get('telegramId') || searchParams.get('id'));
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return json({ success: false, error: 'telegramId inválido' }, 400);
    }

    await connectDB();
    const eliminado = await Contacto.findOneAndDelete({ telegramId }).lean();
    if (!eliminado) {
      return json({ success: false, error: 'Contacto no encontrado' }, 404);
    }

    return json({ success: true, message: 'Contacto eliminado' });
  } catch (error) {
    return json({ success: false, error: 'Error interno del servidor' }, 500);
  }
}
