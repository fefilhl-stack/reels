import { NextResponse, type NextRequest } from 'next/server';
import { isValidSession, SESSION_COOKIE } from './lib/auth';

// Optimistic gate for pages and API routes; server actions and route handlers
// re-check with requireAuth(). /api/upload is excluded so large video bodies
// are streamed to disk instead of being buffered by the proxy.
export function proxy(request: NextRequest) {
  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api/upload|api/cron|api/public|_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
