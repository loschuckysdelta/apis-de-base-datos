import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

// Session is signed on the server; neither password nor API key is sent to browser JS.
const COOKIE = 'chucky_admin_session';
const TTL = 8 * 60 * 60;
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PANEL_PASSWORD?.length >= 16 && process.env.ADMIN_SESSION_SECRET?.length >= 32);
}

function signature(payload) {
  return createHmac('sha256', `${process.env.ADMIN_SESSION_SECRET}:${process.env.ADMIN_PANEL_PASSWORD}`)
    .update(`admin-session-v1:${payload}`).digest('hex');
}

export function correctAdminPassword(value) {
  return adminConfigured() && constantTimeEqual(value, process.env.ADMIN_PANEL_PASSWORD);
}

export function makeAdminToken(now = Date.now()) {
  if (!adminConfigured()) throw new Error('Panel de administración sin configurar');
  const payload = `${Math.floor(now / 1000) + TTL}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${signature(payload)}`;
}

export function validateAdminToken(token, now = Date.now()) {
  if (!adminConfigured() || typeof token !== 'string' || !/^\d{10}\.[0-9a-f]{32}\.[0-9a-f]{64}$/.test(token)) return false;
  const parts = token.split('.');
  const exp = Number(parts[0]);
  const nowSeconds = Math.floor(now / 1000);
  return exp > nowSeconds && exp <= nowSeconds + TTL && constantTimeEqual(parts[2], signature(`${parts[0]}.${parts[1]}`));
}

export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (origin) {
    try { if (new URL(origin).origin !== new URL(req.url).origin) return false; }
    catch { return false; }
  }
  return req.headers.get('sec-fetch-site') !== 'cross-site';
}

export function adminAuthorized(req) {
  const apiKey = process.env.API_ACCESS_KEY;
  if (apiKey?.length >= 24 && constantTimeEqual(req.headers.get('x-api-key'), apiKey)) return true;
  const token = req.cookies?.get(COOKIE)?.value ??
    (req.headers.get('cookie') || '').split(';').map(x => x.trim())
      .find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!validateAdminToken(token)) return false;
  const method = req.method.toUpperCase();
  return ['GET', 'HEAD', 'OPTIONS'].includes(method) || sameOrigin(req);
}

export function unauthorized() {
  return NextResponse.json({ success: false, error: 'No autorizado. Inicia sesión en /login.html o usa X-API-Key desde tu servidor.' }, { status: 401, headers: noStore });
}

export function sessionCookie(res, token, clear = false) {
  res.cookies.set(COOKIE, token, {
    path: '/', httpOnly: true, sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: clear ? 0 : TTL
  });
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  return res;
}
