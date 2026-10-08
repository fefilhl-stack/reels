'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createVideosFromUploads, type UploadedVideo } from '@/app/actions';
import { fmtBytes } from '@/lib/format';
import type { Rubric } from '@/lib/types';
import { IconUpload } from '@/components/Icons';
import { uploadVideo } from '@/components/upload';

type Item = { file: File; progress: number; error?: string; done?: UploadedVideo };

export function UploadForm({ projects, rubrics, defaultProject }: { projects: { id: number; name: string }[]; rubrics: Rubric[]; defaultProject: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(defaultProject);
  const [rubricId, setRubricId] = useState<number | ''>('');
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  function add(files: FileList | null) {
    if (!files) return;
    const vids = [...files].filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
    setItems((cur) => [...cur, ...vids.map((file) => ({ file, progress: 0 }))]);
  }

  async function start() {
    setBusy(true);
    const done: UploadedVideo[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].done) {
        done.push(items[i].done!);
        continue;
      }
      try {
        const up = await uploadVideo(items[i].file, (p) => setItems((cur) => cur.map((it, j) => (j === i ? { ...it, progress: p } : it))));
        done.push(up);
        setItems((cur) => cur.map((it, j) => (j === i ? { ...it, progress: 1, done: up } : it)));
      } catch (e) {
        setItems((cur) => cur.map((it, j) => (j === i ? { ...it, error: (e as Error).message } : it)));
      }
    }
    if (done.length) {
      const ids = await createVideosFromUploads(projectId, rubricId || null, done);
      router.push(ids.length === 1 ? `/content/${ids[0]}` : '/content');
    }
    setBusy(false);
  }

  const projectRubrics = rubrics.filter((r) => r.project_id === projectId);

  return (
    <div className="grid-main">
      <div className="stack">
        <div
          className="dropzone"
          data-over={over}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(e.dataTransfer.files);
          }}
        >
          <IconUpload size={28} />
          <div style={{ fontWeight: 600 }}>Перетащите видео сюда или нажмите, чтобы выбрать</div>
          <div className="hint">MP4 или MOV, H.264, вертикально 9:16. Можно сразу несколько файлов.</div>
          <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => add(e.target.files)} />
        </div>
        {items.length > 0 && (
          <div className="card card-pad stack">
            {items.map((it, i) => (
              <div key={i} className="stack-sm">
                <div className="spread small">
                  <span className="ellipsis" style={{ fontWeight: 550 }}>
                    {it.file.name}
                  </span>
                  <span className="muted num">{it.error ? <span className="badge badge-critical">{it.error}</span> : it.done ? 'загружено' : `${fmtBytes(it.file.size)} · ${Math.round(it.progress * 100)} %`}</span>
                </div>
                <div className="progress">
                  <span style={{ width: `${it.progress * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card card-pad stack">
        <label className="field">
          <span>Проект</span>
          <select className="select" value={projectId} onChange={(e) => (setProjectId(Number(e.target.value)), setRubricId(''))}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Рубрика</span>
          <select className="select" value={rubricId} onChange={(e) => setRubricId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Без рубрики</option>
            {projectRubrics.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="hint">Рубрики помогают понять, какие форматы заходят лучше.</span>
        </label>
        <button className="btn btn-primary" disabled={!items.length || busy} onClick={start}>
          {busy ? 'Загружаем…' : `Загрузить ${items.length ? `(${items.length})` : ''}`}
        </button>
      </div>
    </div>
  );
}
