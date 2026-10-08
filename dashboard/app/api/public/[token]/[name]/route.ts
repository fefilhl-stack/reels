import type { NextRequest } from 'next/server';
import { checkPublicToken, serveFile } from '@/lib/serve';

// Signed, expiring links for platforms that pull the video themselves (Instagram video_url).
type Ctx = { params: Promise<{ token: string; name: string }> };

async function handle(request: NextRequest, ctx: Ctx, head: boolean) {
  const { token, name } = await ctx.params;
  if (!checkPublicToken(token, name)) return new Response('forbidden', { status: 403 });
  return serveFile(request, name, head);
}

export const GET = (r: NextRequest, c: Ctx) => handle(r, c, false);
export const HEAD = (r: NextRequest, c: Ctx) => handle(r, c, true);
