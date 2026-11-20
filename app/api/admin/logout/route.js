import { NextResponse } from 'next/server';
import { sameOrigin, sessionCookie } from '../../../../lib/admin-auth';
export async function POST(req) {
  if (!sameOrigin(req)) return NextResponse.json({ success: false, error: 'Origen no autorizado' }, { status: 403 });
  return sessionCookie(NextResponse.json({ success: true }), '', true);
}
