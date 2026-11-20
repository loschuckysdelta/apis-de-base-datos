import { NextResponse } from 'next/server';
import { adminAuthorized } from '../../../../lib/admin-auth';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  return NextResponse.json({ authenticated: adminAuthorized(req) }, { headers: { 'Cache-Control': 'no-store' } });
}
