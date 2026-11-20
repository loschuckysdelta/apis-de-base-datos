import { connectDB } from '../../../../lib/mongodb';
import GeneratedKey from '../../../../models/GeneratedKey';
import KeyAttempt from '../../../../models/KeyAttempt';
import { apiJson, corsOptions, redemptionIdentity } from '../../../../lib/keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function OPTIONS(req) { return corsOptions(req); }

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return apiJson(req, { success: false, error: 'El cuerpo debe ser JSON válido' }, 400); }
  const key = body?.key;
  const usuarioId = body?.usuarioId === undefined ? null : body.usuarioId;
  if (typeof key !== 'string' || !/^\d{6}$/.test(key)) {
    return apiJson(req, { success: false, error: 'La key debe contener exactamente 6 dígitos (como texto)' }, 400);
  }
  if (usuarioId !== null && (typeof usuarioId !== 'string' || !/^[a-zA-Z0-9_.:@-]{1,100}$/.test(usuarioId))) {
    return apiJson(req, { success: false, error: 'usuarioId inválido' }, 400);
  }

  try {
    await connectDB();
    await KeyAttempt.init();
    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
    const identityHash = redemptionIdentity(req);
    // Atomicidad del contador: bloqueo compartido en todas las funciones de Vercel.
    const attempts = await KeyAttempt.findOneAndUpdate(
      { identityHash, windowStart },
      { $inc: { attempts: 1 }, $setOnInsert: { deleteAt: new Date(windowStart.getTime() + 2 * WINDOW_MS) } },
      { upsert: true, new: true }
    );
    if (attempts.attempts > MAX_ATTEMPTS) {
      return apiJson(req, { success: false, error: 'Demasiados intentos. Intenta nuevamente en unos minutos' }, 429);
    }

    // Únicamente un canje gana, incluso con dos peticiones simultáneas.
    const redeemed = await GeneratedKey.findOneAndUpdate(
      { code: key, redeemedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      { $set: { redeemedAt: now, redeemedBy: usuarioId } },
      { new: true }
    ).lean();
    if (redeemed) {
      return apiJson(req, { success: true, message: 'Key canjeada correctamente', estado: 'canjeada', redeemedAt: redeemed.redeemedAt, usuarioId });
    }
    // Evitamos diferenciar código inexistente vs usado vs vencido para reducir enumeración.
    return apiJson(req, { success: false, error: 'Key inválida, vencida o ya canjeada' }, 400);
  } catch (error) {
    if (error.code === 11000) {
      return apiJson(req, { success: false, error: 'Intenta nuevamente' }, 429);
    }
    console.error('Keys canjear:', error);
    return apiJson(req, { success: false, error: 'Error al canjear. Revisa la conexión a MongoDB' }, 500);
  }
}
