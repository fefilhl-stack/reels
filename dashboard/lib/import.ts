import { all, get, log, nowIso, run, tx } from './db';
import { normalizeStatus, parseDateCell, parsePerWeek, parseRubrics, parseTimeCell, parseTimes, slotTimeFor } from './plan';
import { nextNumber, nextSlot, syncScheduledPosts } from './planner';
import {
  detectGrid,
  parseDelimited,
  passportFieldFor,
  PLAN_FIELD_LABEL,
  sheetCsvUrl,
  type Grid,
  type PassportField,
  type PlanField,
} from './tabular';
import type { Project, Video } from './types';

// Import of the Google Sheets template: the «Проекты» passport sheet and per-project
// content-plan sheets. Rows are matched by №, so importing the same sheet again updates
// the scripts instead of duplicating them; uploaded videos and posts are never touched.

export interface ImportPreview {
  kind: 'plan' | 'passport';
  count: number;
  projects: string[];
  recognized: string[];
  ignored: string[];
  sample: string[];
}

export function previewGrid(grid: Grid): ImportPreview | { error: string } {
  const det = detectGrid(grid);
  if (!det) {
    return {
      error:
        'Не нашёл заголовки. Скопируйте лист целиком вместе с первой строкой (№, Дата, Время, Рубрика, Тема, Хук…) или лист «Проекты» со столбцом «Параметр».',
    };
  }
  if (det.kind === 'passport') {
    const params = grid.slice(det.headerRow + 1).map((r) => r[0] ?? '');
    return {
      kind: 'passport',
      count: det.projects.length,
      projects: det.projects,
      recognized: params.filter((p) => passportFieldFor(p)),
      ignored: params.filter((p) => p && !passportFieldFor(p)),
      sample: [],
    };
  }
  const header = grid[det.headerRow];
  const body = grid.slice(det.headerRow + 1).filter((r) => rowHasContent(r, det.columns));
  const titleCol = det.columns.indexOf('title');
  return {
    kind: 'plan',
    count: body.length,
    projects: [],
    recognized: det.columns.filter((c): c is PlanField => !!c).map((c) => PLAN_FIELD_LABEL[c]),
    ignored: header.filter((h, i) => h && !det.columns[i]),
    sample: body.slice(0, 3).map((r) => r[titleCol] ?? r.find(Boolean) ?? ''),
  };
}

function rowHasContent(row: string[], columns: (PlanField | null)[]): boolean {
  return columns.some((c, i) => (c === 'title' || c === 'script' || c === 'hook') && (row[i] ?? '').trim());
}

function rubricResolver(projectId: number) {
  const cache = new Map(all<{ id: number; name: string }>('SELECT id, name FROM rubrics WHERE project_id = ?', projectId).map((r) => [r.name.toLowerCase(), r.id]));
  return (name: string): number | null => {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    let id = cache.get(key);
    if (!id) {
      id = run('INSERT INTO rubrics (project_id, name) VALUES (?, ?)', projectId, name.trim()).id;
      cache.set(key, id);
    }
    return id;
  };
}

const TEXT_FIELDS = ['title', 'hook', 'cover_text', 'shot', 'script', 'cta', 'caption', 'hashtags'] as const;

export function importPlanGrid(projectId: number, grid: Grid): { created: number; updated: number; skipped: number } {
  const det = detectGrid(grid);
  if (!det || det.kind !== 'plan') throw new Error('Это не контент-план: нет столбцов Тема / Хук / Текст озвучки');
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) throw new Error('Проект не найден');
  const header = grid[det.headerRow];
  const rubricId = rubricResolver(projectId);
  const has = (f: PlanField) => det.columns.includes(f);
  const now = nowIso();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const undated: number[] = [];
  const moved: number[] = [];

  tx(() => {
    for (const row of grid.slice(det.headerRow + 1)) {
      if (!rowHasContent(row, det.columns)) {
        if (row.some(Boolean)) skipped++;
        continue;
      }
      const rec: Partial<Record<PlanField, string>> = {};
      const extras: string[] = [];
      det.columns.forEach((f, i) => {
        const value = (row[i] ?? '').trim();
        if (f) rec[f] = value;
        else if (value && header[i]) extras.push(`${header[i]}: ${value}`);
      });
      const number = Number.parseInt(rec.number ?? '', 10) || null;
      const existing = number
        ? get<Video>('SELECT * FROM videos WHERE project_id = ? AND number = ?', projectId, number)
        : rec.title
          ? get<Video>('SELECT * FROM videos WHERE project_id = ? AND title = ?', projectId, rec.title)
          : undefined;
      const date = rec.plan_date ? parseDateCell(rec.plan_date) : null;
      const time = (rec.plan_time ? parseTimeCell(rec.plan_time) : null) ?? (date ? slotTimeFor(date, project.time_weekday, project.time_weekend) : null);
      const status = normalizeStatus(rec.status ?? '');
      const notes = [rec.notes ?? '', ...extras].filter(Boolean).join('\n');

      if (existing) {
        const sets: string[] = [];
        const params: (string | number | null)[] = [];
        for (const f of TEXT_FIELDS) {
          if (has(f)) {
            sets.push(`${f} = ?`);
            params.push(rec[f] ?? '');
          }
        }
        if (has('rubric')) {
          sets.push('rubric_id = ?');
          params.push(rubricId(rec.rubric ?? ''));
        }
        if (date) {
          sets.push('plan_date = ?');
          params.push(date);
        }
        if (time) {
          sets.push('plan_time = ?');
          params.push(time);
        }
        const published = get<{ n: number }>("SELECT COUNT(*) AS n FROM posts WHERE video_id = ? AND status = 'published'", existing.id)!.n;
        if (status && !published) {
          sets.push('status = ?');
          params.push(status);
        }
        if (notes && notes !== existing.notes) {
          sets.push('notes = ?');
          params.push(notes);
        }
        sets.push('updated_at = ?');
        params.push(now, existing.id);
        run(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`, ...params);
        if ((date && date !== existing.plan_date) || (time && time !== existing.plan_time)) moved.push(existing.id);
        updated++;
      } else {
        const id = run(
          `INSERT INTO videos (project_id, rubric_id, number, plan_date, plan_time, title, hook, cover_text, shot, script, cta, caption, hashtags,
             status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          projectId,
          rubricId(rec.rubric ?? ''),
          number ?? nextNumber(projectId),
          date,
          time,
          rec.title || (rec.hook ?? '').slice(0, 80) || 'Без темы',
          rec.hook ?? '',
          rec.cover_text ?? '',
          rec.shot ?? '',
          rec.script ?? '',
          rec.cta ?? '',
          rec.caption ?? '',
          rec.hashtags ?? '',
          status ?? 'Не начат',
          notes,
          now,
          now,
        ).id;
        if (!date) undated.push(id);
        created++;
      }
    }
  });

  // Rows without a date get the next posting days after the end of the plan.
  for (const id of undated) {
    const slot = nextSlot(get<Project>('SELECT * FROM projects WHERE id = ?', projectId)!);
    run('UPDATE videos SET plan_date = ?, plan_time = COALESCE(plan_time, ?) WHERE id = ?', slot.date, slot.time, id);
  }
  for (const id of moved) syncScheduledPosts(id);
  log('info', `Импорт контент-плана «${project.name}»: новых ${created}, обновлено ${updated}`);
  return { created, updated, skipped };
}

export function importPassportGrid(grid: Grid): { created: string[]; updated: string[] } {
  const det = detectGrid(grid);
  if (!det || det.kind !== 'passport') throw new Error('Это не лист «Проекты»: нет столбца «Параметр»');
  const header = det.headerRow >= 0 ? grid[det.headerRow] : ['', ...det.projects];
  const body = grid.slice(det.headerRow + 1);
  const created: string[] = [];
  const updated: string[] = [];

  tx(() => {
    for (let col = 1; col < header.length; col++) {
      const name = (header[col] ?? '').trim();
      if (!name) continue;
      let project = get<Project>('SELECT * FROM projects WHERE archived = 0 AND lower(name) = lower(?)', name);
      if (!project) {
        const used = all<{ color: number }>('SELECT color FROM projects WHERE archived = 0').map((r) => r.color);
        const color = [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !used.includes(c)) ?? used.length % 8;
        const id = run('INSERT INTO projects (name, color, posts_per_week, created_at) VALUES (?, ?, 7, ?)', name, color, nowIso()).id;
        project = get<Project>('SELECT * FROM projects WHERE id = ?', id)!;
        created.push(name);
      } else updated.push(name);

      const values: Partial<Record<PassportField, string>> = {};
      for (const row of body) {
        const field = passportFieldFor(row[0] ?? '');
        const value = (row[col] ?? '').trim();
        if (field && value) values[field] = value;
      }
      const sets: string[] = [];
      const params: (string | number | null)[] = [];
      const set = (column: string, value: string | number | null) => {
        sets.push(`${column} = ?`);
        params.push(value);
      };
      for (const f of ['description', 'promise', 'goal_text', 'audience', 'format', 'video_length', 'words_norm', 'address_form', 'rubrics_text', 'ctas', 'facts', 'exclusions', 'specialist', 'open_questions', 'checks'] as const) {
        if (values[f] != null) set(f, values[f]!);
      }
      if (values.frequency) {
        set('frequency', values.frequency);
        const perWeek = parsePerWeek(values.frequency);
        if (perWeek) set('posts_per_week', Math.min(7, perWeek));
      }
      if (values.start_date) {
        const d = parseDateCell(values.start_date);
        if (d) set('start_date', d);
      }
      if (values.publish_time) {
        const t = parseTimes(values.publish_time);
        if (t.weekday) set('time_weekday', t.weekday);
        if (t.weekend) set('time_weekend', t.weekend);
      }
      if (sets.length) run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, ...params, project.id);

      // Target shares per rubric, when the passport states them, e.g. "Ошибки с прогрессом (25%)".
      if (values.rubrics_text) {
        const rubrics = parseRubrics(values.rubrics_text).filter((r) => r.share != null);
        const existing = all<{ id: number; name: string }>('SELECT id, name FROM rubrics WHERE project_id = ?', project.id);
        for (const r of rubrics) {
          const lower = r.name.toLowerCase();
          const match = existing.find((e) => e.name.toLowerCase() === lower) ?? existing.find((e) => lower.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(lower));
          if (match) run('UPDATE rubrics SET share = ? WHERE id = ?', r.share, match.id);
          else run('INSERT INTO rubrics (project_id, name, share) VALUES (?, ?, ?)', project.id, r.name, r.share);
        }
      }
    }
  });
  log('info', `Импорт паспортов проектов: новых ${created.length}, обновлено ${updated.length}`);
  return { created, updated };
}

/** Reads one tab of a Google Sheet shared by link (or published as CSV). */
export async function fetchSheet(link: string): Promise<Grid> {
  const url = sheetCsvUrl(link);
  if (!url) throw new Error('Это не похоже на ссылку на Google Таблицу');
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'ReelsHub/1.0' } });
  } catch (e) {
    throw new Error(`Не удалось открыть таблицу: ${(e as Error).message}`);
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || type.includes('text/html')) {
    throw new Error(
      'Таблица закрыта. Включите в Google Таблицах «Настройки доступа → Все, у кого есть ссылка → Читатель» или скопируйте лист и вставьте его во вкладке «Вставить».',
    );
  }
  return parseDelimited(await res.text(), ',');
}
