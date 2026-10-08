import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { sealState } from '@/lib/crypto';
import { get } from '@/lib/db';
import { appUrl } from '@/lib/env';
import { adapters } from '@/lib/platforms';
import { PLATFORMS, type Platform } from '@/lib/types';

// GET /api/oauth/{platform}/start?project=ID → redirects to the platform's consent screen.
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  if (!(await isAuthed())) return NextResponse.redirect(new URL('/login', request.url));
  const { platform } = await params;
  if (!PLATFORMS.includes(platform as Platform)) return new Response('unknown platform', { status: 404 });
  const adapter = adapters[platform as Platform];
  const projectId = Number(request.nextUrl.searchParams.get('project'));
  if (!get('SELECT id FROM projects WHERE id = ?', projectId)) return new Response('project not found', { status: 404 });
  if (!adapter.configured()) {
    return NextResponse.redirect(new URL(`/accounts?error=${encodeURIComponent(`Не заданы ключи: ${adapter.requiredEnv.join(', ')}`)}`, appUrl()));
  }
  const verifier = randomBytes(32).toString('base64url');
  const state = sealState({ p: platform, project: projectId, v: verifier });
  const redirectUri = `${appUrl()}/api/oauth/${platform}/callback`;
  return NextResponse.redirect(adapter.authorizeUrl(state, redirectUri, verifier));
}
