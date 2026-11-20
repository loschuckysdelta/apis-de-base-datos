import { timingSafeEqual, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

// Esta API registra confirmaciones de visita; el ID de Telegram NO acredita identidad.
export function parseTelegramId(value) {
  if (!/^[1-9]\d{0,15}$/.test(String(value ?? ''))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

// Protege SOLO la lista administrativa. No hace falta para POST/GET /api/verificar.
export function isAdminAuthorized(req) {
  const expected = process.env.VERIFICAR_ADMIN_SECRET;
  if (!expected || expected.length < 32) return false;
  const actual = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')?.[1];
  return safeCompare(actual, expected);
}

export function durationMilliseconds() {
  const rawHours = Number(process.env.VERIFICAR_DURATION_HOURS || 24);
  const hours = Number.isFinite(rawHours) ? Math.min(168, Math.max(1, Math.trunc(rawHours))) : 24;
  return hours * 60 * 60 * 1000;
}

function allowedOrigins() {
  const configured = (process.env.VERIFICAR_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (configured.length) return configured;
  return [
    'https://loschuckys.com', 'https://www.loschuckys.com',
    'http://localhost:3002', 'http://127.0.0.1:3002',
    'http://localhost:3000', 'http://127.0.0.1:3000'
  ];
}

export function corsHeaders(req) {
  const origin = req.headers.get('origin');
  const isAllowed = origin && allowedOrigins().includes(origin);
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Vary': 'Origin',
    ...(isAllowed ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
      'Access-Control-Max-Age': '600'
    } : {})
  };
}

// CORS restringe navegadores, pero NO sustituye una identificación real.
export function originAllowed(req) {
  const origin = req.headers.get('origin');
  return !origin || allowedOrigins().includes(origin);
}

export function json(req, data, status = 200, moreHeaders = {}) {
  return NextResponse.json(data, { status, headers: { ...corsHeaders(req), ...moreHeaders } });
}

export function options(req) {
  if (!originAllowed(req)) return json(req, { success: false, error: 'Origen no autorizado' }, 403);
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// Agrupación de solicitudes por IP (pseudónimo). Útil para limitar accesos masivos.
// La IP la facilita el proxy de despliegue; este límite es complementario.
export function ipRateLimitIdentity(req) {
  const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '')
    .split(',')[0].trim().slice(0, 100);
  if (!ip) return null;
  return 'ip:' + createHash('sha256').update(ip).digest('hex');
}

// CAPTCHA opcional. NO necesita token de Telegram.
export async function checkCaptcha(token) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== 'string' || token.length < 1 || token.length > 2048) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: controller.signal
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } finally { clearTimeout(timeout); }
}

export function getVerificationStatus(doc, telegramId, now = new Date()) {
  const verified = Boolean(doc && new Date(doc.expiraEn).getTime() > now.getTime());
  return {
    success: true,
    telegramId: String(telegramId),
    verificado: verified,
    estado: verified ? 'activo' : 'no_verificado',
    verificadoEn: verified ? doc.verificadoEn : null,
    expiraEn: verified ? doc.expiraEn : null
  };
}
