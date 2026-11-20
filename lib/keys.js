import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

export function apiJson(req, body, status = 200) {
  return NextResponse.json(body, { status, headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    ...corsHeaders(req)
  } });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept'
  };
}

export function corsOptions(req) {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
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
  const secret = 'chucky-key-request-limit-v1';
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex');
}
