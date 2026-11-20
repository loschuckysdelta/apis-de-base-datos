import { adminAuthorized, unauthorized } from '../../../../lib/admin-auth';
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/mongodb';
import Contacto from '../../../../models/Contacto';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  // Restricted: private routes require same-origin session or server-side X-API-Key.
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function soloNumeros(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

// Regla pedida para esta base:
// - ID Telegram = número corto (5 a 10 dígitos)
// - Teléfono internacional = número largo (11 a 15 dígitos)
function esIdCorto(valor) {
  const n = soloNumeros(valor);
  return /^\d{5,10}$/.test(n) && Number.isSafeInteger(Number(n)) && Number(n) > 0;
}

function esTelefonoLargo(valor) {
  const n = soloNumeros(valor);
  return /^\d{11,15}$/.test(n);
}

function telefonoConMas(valor) {
  const n = soloNumeros(valor);
  if (!n) return String(valor ?? '').trim();
  if (esTelefonoLargo(n)) return `+${n}`;
  return String(valor ?? '').trim().replace(/[\s-]/g, '');
}

function analizar(contactos) {
  const idsActuales = new Set(contactos.map(c => soloNumeros(c.telegramId)));
  const idsDestino = new Set();

  const corregibles = [];
  const conflictos = [];
  const ambiguos = [];

  for (const contacto of contactos) {
    const id = soloNumeros(contacto.telegramId);
    const tel = soloNumeros(contacto.telefono);

    // CASO 1: están invertidos.
    // ID largo = teléfono; teléfono corto = ID Telegram.
    if (esTelefonoLargo(id) && esIdCorto(tel)) {
      const nuevoId = tel;
      const nuevoTelefono = `+${id}`;

      // Si ya existe ese ID en otro contacto, no tocamos el registro.
      if ((idsActuales.has(nuevoId) && nuevoId !== id) || idsDestino.has(nuevoId)) {
        conflictos.push({
          _id: String(contacto._id),
          telegramId: contacto.telegramId,
          telefono: contacto.telefono,
          nuevoTelegramId: Number(nuevoId),
          nuevoTelefono,
          motivo: 'El ID Telegram corto de destino ya existe en otro contacto.'
        });
        continue;
      }

      idsDestino.add(nuevoId);
      corregibles.push({
        _id: contacto._id,
        tipo: 'intercambio',
        antes: {
          telegramId: contacto.telegramId,
          telefono: contacto.telefono,
          username: contacto.username
        },
        despues: {
          telegramId: Number(nuevoId),
          telefono: nuevoTelefono
        },
        motivo: 'ID largo detectado como teléfono y teléfono corto detectado como ID Telegram.'
      });
      continue;
    }

    // CASO 2: ya está en su lugar, pero al teléfono largo le falta +.
    if (esIdCorto(id) && esTelefonoLargo(tel)) {
      const telefonoNuevo = `+${tel}`;
      if (String(contacto.telefono ?? '').trim() !== telefonoNuevo) {
        corregibles.push({
          _id: contacto._id,
          tipo: 'formato_telefono',
          antes: {
            telegramId: contacto.telegramId,
            telefono: contacto.telefono,
            username: contacto.username
          },
          despues: {
            telegramId: contacto.telegramId,
            telefono: telefonoNuevo
          },
          motivo: 'El ID ya es corto; se agregó + al teléfono largo.'
        });
      }
      continue;
    }

    // Si ambos son cortos o ambos son largos, no adivinamos.
    if ((esIdCorto(id) && esIdCorto(tel)) || (esTelefonoLargo(id) && esTelefonoLargo(tel))) {
      ambiguos.push({
        _id: String(contacto._id),
        telegramId: contacto.telegramId,
        telefono: contacto.telefono,
        username: contacto.username,
        motivo: 'Ambos valores tienen una longitud parecida; no se modificó automáticamente.'
      });
    }
  }

  return { corregibles, conflictos, ambiguos };
}

export async function POST(request) {
  if (!(adminAuthorized(request))) return unauthorized();
  try {
    const body = await request.json().catch(() => ({}));
    const aplicar = body.aplicar === true;

    await connectDB();

    const contactos = await Contacto.find({})
      .select('_id telegramId telefono username nombre fechaRegistro')
      .limit(20001)
      .lean();
    if (contactos.length > 20000) return json({ success: false, error: 'La reparación masiva permite máximo 20 000 contactos por operación.' }, 413);

    const { corregibles, conflictos, ambiguos } = analizar(contactos);
    const intercambios = corregibles.filter(x => x.tipo === 'intercambio').length;
    const telefonosFormateados = corregibles.filter(x => x.tipo === 'formato_telefono').length;

    if (!aplicar) {
      return json({
        success: true,
        modo: 'vista_previa',
        regla: 'ID corto (5-10) / teléfono largo (11-15)',
        revisados: contactos.length,
        corregibles: corregibles.length,
        intercambios,
        telefonosFormateados,
        conflictos: conflictos.length,
        ambiguos: ambiguos.length,
        ejemplos: corregibles.slice(0, 30).map(item => ({
          tipo: item.tipo,
          antes: item.antes,
          despues: item.despues,
          motivo: item.motivo
        })),
        ejemplosConflictos: conflictos.slice(0, 10),
        ejemplosAmbiguos: ambiguos.slice(0, 10)
      });
    }

    // Los conflictos normalmente son duplicados: el ID corto ya existe como otro contacto.
    // En modo aplicar los fusionamos con respaldo para no perder información.
    if (!corregibles.length && !conflictos.length) {
      return json({
        success: true,
        modo: 'aplicado',
        revisados: contactos.length,
        corregidos: 0,
        intercambios: 0,
        telefonosFormateados: 0,
        conflictos: conflictos.length,
        ambiguos: ambiguos.length,
        message: 'No se encontraron registros para corregir con la regla de longitud.'
      });
    }

    const ahora = new Date();
    let corregidos = 0;

    if (corregibles.length) {
      const operaciones = corregibles.map(item => ({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: {
              telegramId: item.despues.telegramId,
              telefono: item.despues.telefono,
              ultimaActualizacion: ahora
            }
          }
        }
      }));
      const resultado = await Contacto.bulkWrite(operaciones, { ordered: false });
      corregidos += Number(resultado.modifiedCount || 0);
    }

    // Resolver conflictos por ID duplicado sin perder datos: respaldar el registro
    // invertido, completar el contacto que ya tiene el ID correcto y quitar solo
    // el duplicado de la colección activa (queda guardado en el backup).
    let fusionados = 0;
    const db = Contacto.db;
    const backup = db.collection('contactos_reparacion_backup');

    for (const item of conflictos) {
      const origen = await Contacto.findById(item._id).lean();
      if (!origen) continue;
      const destino = await Contacto.findOne({ telegramId: Number(item.nuevoTelegramId) });
      if (!destino || String(destino._id) === String(origen._id)) continue;

      await backup.updateOne(
        { originalId: String(origen._id) },
        { $setOnInsert: { ...origen, originalId: String(origen._id), respaldadoEn: ahora, motivo: 'duplicado_fusionado' } },
        { upsert: true }
      );

      const telDestino = String(destino.telefono || '').trim();
      const telOrigenCorregido = item.nuevoTelefono;
      const update = { ultimaActualizacion: ahora };
      if (!esTelefonoLargo(telDestino) || esIdCorto(telDestino)) update.telefono = telOrigenCorregido;
      if ((!destino.username || destino.username === '—') && origen.username) update.username = origen.username;
      if ((!destino.nombre || destino.nombre === 'Sin username') && origen.nombre) update.nombre = origen.nombre;
      if (origen.fechaRegistro && (!destino.fechaRegistro || new Date(origen.fechaRegistro) < new Date(destino.fechaRegistro))) {
        update.fechaRegistro = origen.fechaRegistro;
      }

      await Contacto.updateOne({ _id: destino._id }, { $set: update });
      await Contacto.deleteOne({ _id: origen._id });
      fusionados++;
    }

    return json({
      success: true,
      modo: 'aplicado',
      revisados: contactos.length,
      detectados: corregibles.length + conflictos.length,
      corregidos,
      fusionados,
      intercambios,
      telefonosFormateados,
      conflictos: Math.max(0, conflictos.length - fusionados),
      ambiguos: ambiguos.length,
      message: `${corregidos} corregido(s) y ${fusionados} duplicado(s) fusionado(s) con respaldo.`
    });
  } catch (error) {
    console.error('Error corrigiendo contactos:', error);
    const mensaje = error?.code === 11000
      ? 'Se detectó un ID Telegram duplicado. Ese registro no se modificó.'
      : error.message;
    return json({ success: false, error: 'Error interno al corregir contactos' }, 500);
  }
}
