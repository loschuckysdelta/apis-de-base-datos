import { NextResponse } from 'next/server';
import { panelCookieName } from '../../../../../lib/keys-panel-auth';

export const dynamic = 'force-dynamic';
export async function POST(req) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ success: false, error: 'Origen no autorizado' }, { status: 403 });
  const res = NextResponse.json({ success: true });
  res.cookies.set(panelCookieName(), '', { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 0, secure: process.env.NODE_ENV === 'production' });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
