'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createProjectQuick, fetchSheetGrid, previewImport, runImport } from '@/app/actions';
import { plural } from '@/lib/format';
import type { ImportPreview } from '@/lib/import';
import { parseHtmlTable, parsePastedText, type Grid } from '@/lib/tabular';

type Tab = 'paste' | 'link' | 'file';

/**
 * Brings the Google Sheets template into the dashboard: the «Проекты» sheet (passports)
 * and content-plan sheets. Paste works for private sheets; links need «anyone with the link».
 */
export function ImportDialog({ projects, currentProjectId, primary = false }: { projects: { id: number; name: string }[]; currentProjectId: number | null; primary?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('paste');
  const [grid, setGrid] = useState<Grid | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [projectId, setProjectId] = useState<number | 'new'>(currentProjectId ?? projects[0]?.id ?? 'new');
  const [newName, setNewName] = useState('');
  const [link, setLink] = useState('');
  const [pending, start] = useTransition();

  function reset() {
    setGrid(null);
    setPreview(null);
    setError(null);
    setResult(null);
  }

  function accept(g: Grid | null) {
    reset();
    if (!g || !g.length) {
      setError('Пусто. Выделите лист в Google Таблицах (Ctrl+A), скопируйте (Ctrl+C) и вставьте сюда.');
      return;
    }
    setGrid(g);
    start(async () => {
      const p = await previewImport(g);
      if ('error' in p) setError(p.error);
      else setPreview(p);
    });
  }

  function apply() {
    if (!grid || !preview) return;
    start(async () => {
      let target: number | null = null;
      if (preview.kind === 'plan') {
        target = projectId === 'new' ? await createProjectQuick(newName) : projectId;
        if (!target) {
          setError('Укажите название нового проекта');
          return;
        }
      }
      const r = await runImport(grid, target);
      setResult(r);
      if (r.ok) {
        setGrid(null);
        setPreview(null);
        if (target && target !== currentProjectId) router.push(`/content?p=${target}`);
        else router.refresh();
      }
    });
  }

  return (
    <>
      <button className={`btn ${primary ? 'btn-primary' : ''}`} onClick={() => (setOpen(true), reset())}>
        Импорт из Google Таблиц
      </button>
      {open && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal card" role="dialog" aria-label="Импорт из Google Таблиц">
            <div className="card-head">
              <div>
                <h2>Импорт из Google Таблиц</h2>
                <p>Сначала лист «Проекты» — появятся проекты с паспортами. Затем каждый лист с контент-планом.</p>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
                Закрыть
              </button>
            </div>
            <div className="card-body stack">
              <div className="segmented">
                {(
                  [
                    ['paste', 'Вставить'],
                    ['link', 'По ссылке'],
                    ['file', 'Файл CSV'],
                  ] as [Tab, string][]
                ).map(([t, label]) => (
                  <button key={t} aria-current={tab === t ? 'true' : undefined} onClick={() => (setTab(t), reset())}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'paste' && (
                <div className="stack-sm">
                  <span className="hint">Откройте лист, нажмите Ctrl+A (⌘A) и Ctrl+C (⌘C), затем щёлкните в поле ниже и нажмите Ctrl+V (⌘V). Работает и для закрытых таблиц.</span>
                  <textarea
                    id="import-paste"
                    className="textarea"
                    rows={5}
                    placeholder="Вставьте сюда скопированный лист…"
                    onPaste={(e) => {
                      const html = e.clipboardData.getData('text/html');
                      const text = e.clipboardData.getData('text/plain');
                      const g = (html && parseHtmlTable(html)) || parsePastedText(text);
                      if (g.length) {
                        e.preventDefault();
                        accept(g);
                      }
                    }}
                  />
                  <div>
                    <button
                      className="btn btn-sm"
                      onClick={() => accept(parsePastedText((document.getElementById('import-paste') as HTMLTextAreaElement | null)?.value ?? ''))}
                    >
                      Распознать вставленный текст
                    </button>
                  </div>
                </div>
              )}

              {tab === 'link' && (
                <div className="stack-sm">
                  <span className="hint">
                    Ссылка на нужный лист (в ней есть gid=…). Таблица должна быть открыта: «Настройки доступа → Все, у кого есть ссылка → Читатель».
                  </span>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input className="input" placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…" value={link} onChange={(e) => setLink(e.target.value)} />
                    <button
                      className="btn"
                      disabled={!link || pending}
                      onClick={() =>
                        start(async () => {
                          const r = await fetchSheetGrid(link);
                          if (r.ok) accept(r.grid);
                          else setError(r.error);
                        })
                      }
                    >
                      Загрузить
                    </button>
                  </div>
                </div>
              )}

              {tab === 'file' && (
                <div className="stack-sm">
                  <span className="hint">В Google Таблицах: Файл → Скачать → CSV (текущий лист).</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,text/csv,text/tab-separated-values"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) accept(parsePastedText(await f.text()));
                    }}
                  />
                </div>
              )}

              {pending && !preview && <span className="small muted">Читаю…</span>}
              {error && <div className="notice notice-error">{error}</div>}

              {preview && (
                <div className="stack-sm import-preview">
                  {preview.kind === 'passport' ? (
                    <>
                      <strong>
                        Лист «Проекты»: {preview.count} {plural(preview.count, 'проект', 'проекта', 'проектов')}
                      </strong>
                      <span className="small">{preview.projects.join(', ')}</span>
                      <span className="small muted">Параметры: {preview.recognized.join(', ')}</span>
                      {preview.ignored.length > 0 && <span className="small muted">Не перенесутся: {preview.ignored.join(', ')}</span>}
                      <span className="hint">Проекты с такими названиями обновятся, остальные будут созданы.</span>
                    </>
                  ) : (
                    <>
                      <strong>
                        Контент-план: {preview.count} {plural(preview.count, 'сценарий', 'сценария', 'сценариев')}
                      </strong>
                      <span className="small muted">Столбцы: {preview.recognized.join(', ')}</span>
                      {preview.ignored.length > 0 && <span className="small muted">Попадут в «Заметки»: {preview.ignored.join(', ')}</span>}
                      {preview.sample.length > 0 && <span className="small">Например: {preview.sample.join(' · ')}</span>}
                      <label className="field">
                        <span>В какой проект</span>
                        <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value === 'new' ? 'new' : Number(e.target.value))}>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                          <option value="new">Новый проект…</option>
                        </select>
                      </label>
                      {projectId === 'new' && <input className="input" placeholder="Название проекта (как лист в таблице)" value={newName} onChange={(e) => setNewName(e.target.value)} />}
                      <span className="hint">Сценарии с тем же № обновятся, новые добавятся. Загруженные ролики и публикации не затрагиваются.</span>
                    </>
                  )}
                  <div>
                    <button className="btn btn-primary" disabled={pending} onClick={apply}>
                      {pending ? 'Импортирую…' : 'Импортировать'}
                    </button>
                  </div>
                </div>
              )}

              {result && <div className={`notice ${result.ok ? 'notice-ok' : 'notice-error'}`}>{result.message}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
