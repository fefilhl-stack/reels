import type { NextRequest } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { serveFile } from '@/lib/serve';

// Uploaded videos and covers for the dashboard UI (session required).
export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (!(await isAuthed())) return new Response('unauthorized', { status: 401 });
  return serveFile(request, (await params).name);
}
