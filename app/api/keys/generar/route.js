import { randomInt } from 'node:crypto';
import { connectDB } from '../../../../lib/mongodb';
import GeneratedKey from '../../../../models/GeneratedKey';
import KeyAttempt from '../../../../models/KeyAttempt';
import { apiJson, corsOptions, redemptionIdentity } from '../../../../lib/keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function OPTIONS(req) { return corsOptions(req); }

// POST sin body: una petición genera exactamente UNA key nueva de seis dígitos.
// Los ceros a la izquierda se preservan devolviendo el código como texto.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;

export async function POST(req) {
  const origin = req.headers.get('origin');
  const allowed = (process.env.KEYS_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (origin && origin !== new URL(req.url).origin && !allowed.includes(origin)) return apiJson(req, { success: false, error: 'Origen no autorizado' }, 403);
  try {
    await connectDB();
    await GeneratedKey.init();
    await KeyAttempt.init();
    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
    const identityHash = `generar:${redemptionIdentity(req)}`;
    const attempts = await KeyAttempt.findOneAndUpdate(
      { identityHash, windowStart },
      { $inc: { attempts: 1 }, $setOnInsert: { deleteAt: new Date(windowStart.getTime() + 2 * WINDOW_MS) } },
      { upsert: true, new: true }
    );
    if (attempts.attempts > MAX_REQUESTS) {
      return apiJson(req, { success: false, error: 'Límite de generación alcanzado. Intenta de nuevo en unos minutos.' }, 429);
    }

    for (let i = 0; i < 12; i += 1) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      try {
        await GeneratedKey.create({ code });
        return apiJson(req, { success: true, key: code }, 201);
      } catch (error) {
        if (error.code !== 11000) throw error;
        // Si ya existe, generar otro; no sobrescribir ninguna key anterior.
      }
    }
    return apiJson(req, { success: false, error: 'No se pudo crear una key única. Vuelve a intentar.' }, 503);
  } catch (error) {
    if (error.code === 11000) {
      return apiJson(req, { success: false, error: 'Intenta de nuevo.' }, 429);
    }
    console.error('Keys generar:', error);
    return apiJson(req, { success: false, error: 'No se pudo generar la key. Revisa MongoDB.' }, 500);
  }
}
