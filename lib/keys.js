import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

export function apiJson(req, body, status = 200) {
  return NextResponse.json(body, { status, headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    ...corsHeaders(req)
  } });
}

function allowedOrigins() {
  return (process.env.KEYS_ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeaders(req) {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  const allowlist = allowedOrigins();
  if (!allowlist.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Keys-Admin',
    'Vary': 'Origin'
  };
}

export function corsOptions(req) {
  const origin = req.headers.get('origin');
  if (origin && !allowedOrigins().includes(origin)) return apiJson(req, { success: false, error: 'Origen no autorizado' }, 403);
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export function keyState(doc) {
  if (doc.redeemedAt) return 'canjeada';
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) return 'vencida';
  return 'disponible';
}

export function publicKey(doc, existed = false) {
  return {
    key: doc.code,
    estado: keyState(doc),
    clientId: doc.clientId || null,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    redeemedAt: doc.redeemedAt,
    existed
  };
}

export function redemptionIdentity(req) {
  // Vercel suministra este encabezado; para servidores propios configura un proxy confiable.
  const ip = (req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-real-ip') || 'unknown')
    .split(',')[0].trim().slice(0, 100);
  const secret = process.env.KEYS_RATE_LIMIT_SECRET || process.env.ADMIN_SESSION_SECRET || 'fallback-keys-rate-limit';
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex');
}
