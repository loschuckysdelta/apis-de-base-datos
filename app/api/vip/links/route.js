import { connectDB } from '../../../../lib/mongodb';
import Vip from '../../../../models/VipMembership';
import { response, validDays } from '../../../../lib/vip';

export const dynamic = 'force-dynamic';
const PLANS = { '7': 7, '30': 30, '60': 60, 'permanent': null };

export async function POST(req) {
  try {
    const b = await req.json();
    const link = String(b.invite_link || '').trim();
    const plan = String(b.plan || '');
    if (!/^https:\/\/t\.me\/\+[^\s]+$/.test(link) || !(plan in PLANS)) {
      return response({ success: false, error: 'Enlace o plan inválido' }, 400);
    }
    await connectDB();
    const doc = await Vip.create({
      chatId: String(b.chat_id || ''), inviteLink: link,
      days: PLANS[plan], permanent: plan === 'permanent',
      status: 'pending', telegramUserId: null
    });
    return response({ success: true, link: { plan, used: false, id: doc._id } }, 201);
  } catch (e) {
    if (e.code === 11000) return response({ success: false, error: 'Enlace duplicado' }, 409);
    console.error('VIP links POST:', e);
    return response({ success: false, error: 'No se pudo guardar el enlace' }, 500);
  }
}
