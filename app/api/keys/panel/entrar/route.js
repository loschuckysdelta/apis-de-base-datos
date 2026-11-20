import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../../lib/mongodb';
import KeyAttempt from '../../../../../models/KeyAttempt';
import { panelPasswordConfigured, validPanelPassword, makePanelToken, panelCookieName, panelMaxAge } from '../../../../../lib/keys-panel-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  if (!panelPasswordConfigured()) return NextResponse.json({ success: false, error: 'Configura KEYS_PANEL_PASSWORD (mínimo 16) y KEYS_ADMIN_SECRET (mínimo 24) en Vercel.' }, { status: 503 });
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ success: false, error: 'Origen no autorizado' }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 }); }
  if (typeof body?.clave !== 'string' || body.clave.length > 256) return NextResponse.json({ success: false, error: 'Clave de acceso inválida' }, { status: 400 });
  try {
    await connectDB();
    await KeyAttempt.init();
    const now = Date.now();
    const start = Math.floor(now / 900000) * 900000;
    const ip = (req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 100);
    const identityHash = createHash('sha256').update(`panel-login:${process.env.KEYS_ADMIN_SECRET}:${ip}`).digest('hex');
    const attempt = await KeyAttempt.findOneAndUpdate(
      { identityHash, windowStart: new Date(start) },
      { $inc: { attempts: 1 }, $setOnInsert: { deleteAt: new Date(start + 1800000) } },
      { upsert: true, new: true }
    );
    if (attempt.attempts > 10) return NextResponse.json({ success: false, error: 'Demasiados intentos. Intenta nuevamente en 15 minutos.' }, { status: 429 });
    if (!validPanelPassword(body.clave)) return NextResponse.json({ success: false, error: 'Clave incorrecta' }, { status: 401 });
    const res = NextResponse.json({ success: true, message: 'Acceso autorizado al historial de keys' });
    res.cookies.set(panelCookieName(), makePanelToken(now), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: panelMaxAge()
    });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (error) {
    if (error.code === 11000) return NextResponse.json({ success: false, error: 'Reintenta el acceso' }, { status: 429 });
    console.error('Login historial keys:', error);
    return NextResponse.json({ success: false, error: 'Error al validar el acceso. Revisa MongoDB' }, { status: 500 });
  }
}
