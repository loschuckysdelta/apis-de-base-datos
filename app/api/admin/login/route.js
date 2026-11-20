import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/mongodb';
import KeyAttempt from '../../../../models/KeyAttempt';
import { adminConfigured, correctAdminPassword, makeAdminToken, sameOrigin, sessionCookie } from '../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(req) {
  if (!sameOrigin(req)) return reply({ success: false, error: 'Origen no autorizado' }, 403);
  if (!adminConfigured()) return reply({ success: false, error: 'Configura ADMIN_PANEL_PASSWORD y ADMIN_SESSION_SECRET en las variables de entorno.' }, 503);
  let body;
  try { body = await req.json(); } catch { return reply({ success: false, error: 'JSON inválido' }, 400); }
  if (typeof body?.password !== 'string' || body.password.length > 256) return reply({ success: false, error: 'Contraseña inválida' }, 400);
  try {
    await connectDB();
    await KeyAttempt.init();
    const now = Date.now();
    const start = Math.floor(now / 900000) * 900000;
    const ip = (req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').split(',')[0].trim().slice(0, 100);
    const identityHash = createHash('sha256').update(`admin-login:${process.env.ADMIN_SESSION_SECRET}:${ip}`).digest('hex');
    const attempt = await KeyAttempt.findOneAndUpdate(
      { identityHash, windowStart: new Date(start) },
      { $inc: { attempts: 1 }, $setOnInsert: { deleteAt: new Date(start + 1800000) } },
      { upsert: true, new: true }
    );
    if (attempt.attempts > 10) return reply({ success: false, error: 'Demasiados intentos. Reintenta más tarde.' }, 429);
    if (!correctAdminPassword(body.password)) return reply({ success: false, error: 'Contraseña incorrecta' }, 401);
    return sessionCookie(reply({ success: true }), makeAdminToken(now));
  } catch (error) {
    console.error('Login administrador:', error.name);
    return reply({ success: false, error: 'No se pudo iniciar sesión. Revisa MongoDB.' }, 500);
  }
}
