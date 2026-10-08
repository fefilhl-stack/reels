import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { IMAGE_EXT, newFileName, safePath, VIDEO_EXT } from '@/lib/storage';

const MAX_BYTES = 4 * 1024 ** 3;

// Raw-body upload (PUT /api/upload?kind=video&name=clip.mp4): the request is streamed
// straight to disk, so multi-gigabyte videos never sit in memory. The proxy skips this
// route (it would buffer the body), hence the explicit auth check.
export async function PUT(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const kind = request.nextUrl.searchParams.get('kind') === 'image' ? 'image' : 'video';
  const original = request.nextUrl.searchParams.get('name') || (kind === 'image' ? 'cover.jpg' : 'video.mp4');
  const fileName = newFileName(original, kind === 'image' ? IMAGE_EXT : VIDEO_EXT);
  if (!fileName) {
    return NextResponse.json({ error: `Формат не поддерживается. Видео: ${VIDEO_EXT.join(', ')}` }, { status: 415 });
  }
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: 'Файл больше 4 ГБ' }, { status: 413 });
  if (!request.body) return NextResponse.json({ error: 'Пустой запрос' }, { status: 400 });

  const target = safePath(fileName)!;
  let size = 0;
  const counted = Readable.fromWeb(request.body as unknown as WebReadableStream<Uint8Array>);
  counted.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BYTES) counted.destroy(new Error('Файл больше 4 ГБ'));
  });
  try {
    await pipeline(counted, createWriteStream(target));
  } catch (e) {
    await unlink(target).catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ fileName, size });
}
