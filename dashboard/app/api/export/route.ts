import type { NextRequest } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { get } from '@/lib/db';
import { planGrid } from '@/lib/queries';
import { toDelimited } from '@/lib/tabular';

// GET /api/export?project=ID&format=csv|tsv — the content plan in the Google Sheets template's columns.
export async function GET(request: NextRequest) {
  if (!(await isAuthed())) return new Response('unauthorized', { status: 401 });
  const id = Number(request.nextUrl.searchParams.get('project'));
  const project = get<{ name: string }>('SELECT name FROM projects WHERE id = ?', id);
  if (!project) return new Response('not found', { status: 404 });
  const tsv = request.nextUrl.searchParams.get('format') === 'tsv';
  const body = toDelimited(planGrid(id), tsv ? '\t' : ',');
  if (tsv) return new Response(body, { headers: { 'Content-Type': 'text/tab-separated-values; charset=utf-8' } });
  const file = encodeURIComponent(`Контент-план — ${project.name}.csv`);
  return new Response(`﻿${body}`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${file}` },
  });
}
