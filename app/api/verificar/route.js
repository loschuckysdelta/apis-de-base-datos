import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';
import Verificacion from '../../../models/Verificacion';
import VerificacionIntento from '../../../models/VerificacionIntento';
import {
  checkCaptcha, durationMilliseconds, getVerificationStatus,
  ipRateLimitIdentity, json, options, originAllowed, parseTelegramId
} from '../../../lib/verificar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_INTENTOS_ID = 8;
const MAX_INTENTOS_IP = 40;

export function OPTIONS(req) { return options(req); }

async function userRegistered(telegramId) {
  const user = await User.findOne({ telegramId }).select('telegramId botBloqueado -_id').lean();
  if (!user) return { success: false, verificado: false, error: 'Usuario no registrado en /api/users', status: 404 };
  if (user.botBloqueado) return { success: false, verificado: false, error: 'Usuario bloqueado', status: 403 };
  return null;
}

async function countAttempts(identidad, ventana, now, max) {
  if (!identidad) return null;
  let intento;
  try {
    intento = await VerificacionIntento.findOneAndUpdate(
      { identidad, ventana },
      { $inc: { intentos: 1 }, $setOnInsert: { eliminarEn: new Date(ventana.getTime() + 2 * WINDOW_MS) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // Dos peticiones simultáneas pueden competir por la misma clave única.
    if (error.code !== 11000) throw error;
    intento = await VerificacionIntento.findOneAndUpdate(
      { identidad, ventana }, { $inc: { intentos: 1 } }, { new: true }
    );
  }
  if ((intento?.intentos || 0) <= max) return null;
  return Math.max(1, Math.ceil((ventana.getTime() + WINDOW_MS - now.getTime()) / 1000));
}

// GET /api/verificar?telegramId=123456789
// No requiere token: solo consulta estado registrado, NO acredita identidad.
export async function GET(req) {
  if (!originAllowed(req)) return json(req, { success: false, error: 'Origen no autorizado' }, 403);
  const telegramId = parseTelegramId(new URL(req.url).searchParams.get('telegramId'));
  if (!telegramId) return json(req, { success: false, error: 'telegramId inválido' }, 400);
  try {
    await connectDB();
    const invalidUser = await userRegistered(telegramId);
    if (invalidUser) return json(req, invalidUser, invalidUser.status);
    const doc = await Verificacion.findOne({ telegramId }).lean();
    return json(req, getVerificationStatus(doc, telegramId));
  } catch (err) {
    console.error('Verificar GET:', err);
    return json(req, { success: false, error: 'No se pudo consultar la verificación' }, 500);
  }
}

// POST /api/verificar body: {"telegramId":"123456789"}
// Guarda la confirmación de visita. No exige bot, firma ni token de Telegram.
export async function POST(req) {
  if (!originAllowed(req)) return json(req, { success: false, error: 'Origen no autorizado' }, 403);
  let body;
  try { body = await req.json(); } catch { return json(req, { success: false, error: 'JSON inválido' }, 400); }
  const telegramId = parseTelegramId(body?.telegramId);
  if (!telegramId) return json(req, { success: false, verificado: false, error: 'telegramId inválido' }, 400);
  try {
    await connectDB();
    const invalidUser = await userRegistered(telegramId);
    if (invalidUser) return json(req, invalidUser, invalidUser.status);

    await VerificacionIntento.init();
    const now = new Date();
    const ventana = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
    const idLimit = await countAttempts(`telegram:${telegramId}`, ventana, now, MAX_INTENTOS_ID);
    const ipIdentity = ipRateLimitIdentity(req);
    const ipLimit = await countAttempts(ipIdentity, ventana, now, MAX_INTENTOS_IP);
    if (idLimit || ipLimit) {
      return json(req,
        { success: false, verificado: false, error: 'Demasiados intentos de verificación. Inténtalo más tarde.' },
        429, { 'Retry-After': String(Math.max(idLimit || 0, ipLimit || 0)) }
      );
    }

    // No renueva el vencimiento si ya estaba confirmado.
    const actual = await Verificacion.findOne({ telegramId }).lean();
    if (actual && new Date(actual.expiraEn).getTime() > now.getTime()) {
      return json(req, { ...getVerificationStatus(actual, telegramId), mensaje: 'La confirmación ya estaba activa' });
    }

    // Si Turnstile está configurado, comprobamos el reto antes de guardar.
    let captchaOK = false;
    try { captchaOK = await checkCaptcha(body?.turnstileToken); }
    catch (error) { console.error('Turnstile:', error.message); }
    if (!captchaOK) return json(req, { success: false, verificado: false, error: 'Completa la comprobación antirobot' }, 403);

    const fecha = new Date();
    const expiraEn = new Date(fecha.getTime() + durationMilliseconds());
    let registrado = await Verificacion.findOneAndUpdate(
      { telegramId, expiraEn: { $lte: fecha } },
      { $set: { verificadoEn: fecha, expiraEn }, $inc: { vecesVerificado: 1 } },
      { new: true }
    ).lean();
    if (!registrado) {
      try {
        registrado = (await Verificacion.create({ telegramId, verificadoEn: fecha, expiraEn })).toObject();
      } catch (error) {
        if (error.code !== 11000) throw error;
        registrado = await Verificacion.findOne({ telegramId }).lean();
        if (!registrado || new Date(registrado.expiraEn).getTime() <= fecha.getTime()) {
          return json(req, { success: false, verificado: false, error: 'Intenta de nuevo en unos segundos' }, 409);
        }
      }
    }
    return json(req, { ...getVerificationStatus(registrado, telegramId), mensaje: 'Confirmación registrada correctamente' });
  } catch (err) {
    console.error('Verificar POST:', err);
    return json(req, { success: false, verificado: false, error: 'No se pudo registrar la confirmación' }, 500);
  }
}
