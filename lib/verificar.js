import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

// Esta API registra confirmaciones de visita; el ID de Telegram NO acredita identidad.
export function parseTelegramId(value) {
  if (!/^[1-9]\d{0,15}$/.test(String(value ?? ''))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function durationMilliseconds() {
  const rawHours = Number(process.env.VERIFICAR_DURATION_HOURS || 24);
  const hours = Number.isFinite(rawHours) ? Math.min(168, Math.max(1, Math.trunc(rawHours))) : 24;
  return hours * 60 * 60 * 1000;
}

// Sin login ni restricción de origen. No se usan cookies ni credenciales de sesión.
export function corsHeaders(req) {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
  };
}

export function originAllowed(req) { return true; }

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
