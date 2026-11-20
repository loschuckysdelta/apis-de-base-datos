import { adminAuthorized, unauthorized } from '../../../../../lib/admin-auth';
import { connectDB } from '../../../../../lib/mongodb';
import Vip from '../../../../../models/VipMembership';
import { response } from '../../../../../lib/vip';
export const dynamic = 'force-dynamic';

function decodeToken(value) { try { return decodeURIComponent(value); } catch { return ''; } }
function toLink(m) { return { plan: m.permanent ? 'permanent' : String(m.days), used: m.status !== 'pending', telegram_user_id: m.telegramUserId }; }

export async function GET(req, { params }) {
  if (!adminAuthorized(req)) return unauthorized();
  try {
    const { token } = await params;
    await connectDB();
    const m = await Vip.findOne({ inviteLink: decodeToken(token) }).lean();
    return m ? response({ success: true, link: toLink(m) }) : response({ success: false, error: 'Enlace no encontrado' }, 404);
  } catch (e) { console.error('VIP link GET:', e); return response({ success: false, error: 'Error de consulta' }, 500); }
}

// Compatibilidad con bots que marcan el enlace como utilizado tras registrar al usuario.
export async function PATCH(req, { params }) {
  if (!adminAuthorized(req)) return unauthorized();
  try {
    const { token } = await params;
    const b = await req.json();
    const userId = String(b.telegram_user_id || '');
    if (b.used !== true || !/^\d{1,20}$/.test(userId)) return response({ success: false, error: 'Datos inválidos' }, 400);
    await connectDB();
    const now = new Date();
    const m = await Vip.findOneAndUpdate(
      { inviteLink: decodeToken(token), status: 'pending' },
      [{ $set: {
        telegramUserId: userId, activatedAt: now,
        expiresAt: { $cond: ['$permanent', null, { $add: [now, { $multiply: ['$days', 86400000] }] }] },
        status: { $cond: ['$permanent', 'permanent', 'active'] }
      }}], { new: true }
    );
    if (!m) {
      const existing = await Vip.findOne({ inviteLink: decodeToken(token) });
      if (existing && existing.telegramUserId === userId) return response({ success: true, link: toLink(existing) });
      return response({ success: false, error: 'Enlace ya utilizado o no encontrado' }, 409);
    }
    return response({ success: true, link: toLink(m) });
  } catch (e) { console.error('VIP link PATCH:', e); return response({ success: false, error: 'No se pudo activar el enlace' }, 500); }
}
