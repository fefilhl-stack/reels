'use client';

import { useRef, useState, useTransition } from 'react';
import { attachFile, setCover } from '@/app/actions';
import { grabFrame, putFile, uploadVideo } from '@/components/upload';
import { IconUpload } from '@/components/Icons';

/** Player + "use this frame as the cover" (sent to TikTok/Instagram as the cover timestamp). */
export function CoverPicker({ videoId, src, coverMs }: { videoId: number; src: string; coverMs: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<number>(coverMs);
  return (
    <div className="card card-pad stack">
      <div className="player">
        <video ref={ref} src={src} controls playsInline preload="metadata" />
      </div>
      <div className="spread small">
        <span className="muted">Обложка: кадр на {(saved / 1000).toFixed(1).replace('.', ',')} с</span>
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const v = ref.current!;
              v.pause();
              const ms = Math.round(v.currentTime * 1000);
              let thumb: string | null = null;
              try {
                const blob = await grabFrame(v, v.currentTime);
                if (blob) thumb = (await putFile(blob, 'cover.jpg', 'image')).fileName;
              } catch {
                /* cover image is optional */
              }
              await setCover(videoId, ms, thumb);
              setSaved(ms);
            })
          }
        >
          {pending ? 'Сохраняем…' : 'Этот кадр — обложка'}
        </button>
      </div>
    </div>
  );
}

export function AttachFile({ videoId }: { videoId: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function handle(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const up = await uploadVideo(file, setProgress);
      await attachFile(videoId, up);
    } catch (e) {
      setError((e as Error).message);
    }
    setProgress(null);
  }

  return (
    <div className="stack">
      <div
        className="dropzone"
        data-over={over}
        style={{ padding: '40px 20px' }}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
      >
        <IconUpload size={26} />
        <div style={{ fontWeight: 600 }}>Прикрепите видео</div>
        <div className="hint">Ролик снят? Перетащите файл — карточка перейдёт в «Готово».</div>
        <input ref={input} type="file" accept="video/*" hidden onChange={(e) => handle(e.target.files)} />
      </div>
      {progress != null && (
        <div className="progress">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {error && <div className="notice notice-error">{error}</div>}
    </div>
  );
}
