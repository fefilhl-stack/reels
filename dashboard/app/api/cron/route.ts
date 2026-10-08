import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from '@/lib/crypto';
import { env } from '@/lib/env';
import { tick } from '@/lib/worker';

// For hosts without a long-running process: call GET /api/cron?secret=CRON_SECRET every minute.
export async function GET(request: NextRequest) {
  const secret = env.cronSecret();
  const given = request.nextUrl.searchParams.get('secret') || request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!secret || !safeEqual(given, secret)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await tick({ sync: request.nextUrl.searchParams.get('sync') !== '0' });
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
