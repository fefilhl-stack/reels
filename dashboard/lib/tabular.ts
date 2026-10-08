// Tabular text parsing shared by the browser (clipboard, files) and the server (sheet links).

export type Grid = string[][];

/** RFC 4180-style parser: quoted cells may contain the delimiter, newlines and "" escapes. */
export function parseDelimited(text: string, delimiter: string): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return trimGrid(rows);
}

/** Pasted text: tabs → TSV (what Google Sheets puts on the clipboard), otherwise CSV with , or ;. */
export function parsePastedText(text: string): Grid {
  if (text.includes('\t')) return parseDelimited(text, '\t');
  const firstLine = text.split('\n', 1)[0];
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return parseDelimited(text, semis > commas ? ';' : ',');
}

/** Clipboard HTML from Google Sheets / Excel: the first <table>, cells as text (line breaks kept). Browser only. */
export function parseHtmlTable(html: string): Grid | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const grid: Grid = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const row: string[] = [];
    for (const td of Array.from(tr.querySelectorAll('td, th'))) {
      td.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      const text = (td.textContent ?? '').replace(/ /g, ' ').trim();
      row.push(text);
      const span = Number(td.getAttribute('colspan') || 1);
      for (let k = 1; k < span; k++) row.push('');
    }
    grid.push(row);
  }
  return trimGrid(grid);
}

/** Drops fully empty rows and trailing empty columns. */
export function trimGrid(grid: Grid): Grid {
  const rows = grid.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
  const width = Math.max(0, ...rows.map((r) => r.reduce((w, c, i) => (c ? i + 1 : w), 0)));
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

export function normHeader(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"'.:]/g, '').replace(/\s+/g, ' ').trim();
}

/** Script fields recognised in a content-plan sheet (header text → field). */
export type PlanField =
  | 'number'
  | 'plan_date'
  | 'plan_time'
  | 'rubric'
  | 'title'
  | 'hook'
  | 'cover_text'
  | 'shot'
  | 'script'
  | 'words'
  | 'cta'
  | 'caption'
  | 'hashtags'
  | 'status'
  | 'notes';

const PLAN_HEADERS: [PlanField, string[]][] = [
  ['number', ['№', 'n', '#', 'номер', 'no']],
  ['plan_date', ['дата', 'дата публикации', 'день']],
  ['plan_time', ['время', 'время публикации']],
  ['rubric', ['рубрика', 'рубрики', 'категория']],
  ['title', ['тема', 'название', 'идея', 'заголовок']],
  ['hook', ['хук', 'зацепка', 'первая фраза']],
  ['cover_text', ['обложка', 'текст на обложке', 'текст обложки']],
  ['shot', ['кадр', 'кадры', 'визуал', 'видеоряд', 'что в кадре']],
  ['script', ['текст озвучки', 'озвучка', 'сценарий', 'текст', 'скрипт']],
  ['words', ['слов', 'слова', 'кол-во слов', 'количество слов']],
  ['cta', ['призыв', 'призыв к действию', 'cta']],
  ['caption', ['подпись', 'описание', 'подпись к посту']],
  ['hashtags', ['хэштеги', 'хештеги', 'теги', 'хэштег', 'хештег']],
  ['status', ['статус', 'стадия']],
  ['notes', ['заметки', 'примечание', 'примечания', 'комментарий', 'комментарии']],
];

export const PLAN_FIELD_LABEL: Record<PlanField, string> = {
  number: '№',
  plan_date: 'Дата',
  plan_time: 'Время',
  rubric: 'Рубрика',
  title: 'Тема',
  hook: 'Хук',
  cover_text: 'Обложка',
  shot: 'Кадр',
  script: 'Текст озвучки',
  words: 'Слов',
  cta: 'Призыв',
  caption: 'Подпись',
  hashtags: 'Хэштеги',
  status: 'Статус',
  notes: 'Заметки',
};

export function planFieldFor(header: string): PlanField | null {
  const h = normHeader(header);
  for (const [field, names] of PLAN_HEADERS) if (names.includes(h)) return field;
  return null;
}

/** Passport parameters of the «Проекты» sheet (parameter text → project column). */
export type PassportField =
  | 'description'
  | 'promise'
  | 'goal_text'
  | 'audience'
  | 'format'
  | 'video_length'
  | 'words_norm'
  | 'frequency'
  | 'start_date'
  | 'publish_time'
  | 'address_form'
  | 'rubrics_text'
  | 'ctas'
  | 'facts'
  | 'exclusions'
  | 'specialist'
  | 'open_questions'
  | 'checks';

const PASSPORT_PARAMS: [PassportField, string[]][] = [
  ['description', ['тема аккаунта', 'тема', 'о проекте']],
  ['promise', ['обещание зрителю', 'обещание']],
  ['goal_text', ['цель', 'цели']],
  ['audience', ['аудитория', 'целевая аудитория', 'ца']],
  ['format', ['формат']],
  ['video_length', ['длина ролика', 'длительность', 'хронометраж']],
  ['words_norm', ['норма слов', 'слов в ролике']],
  ['frequency', ['частота', 'частота публикаций']],
  ['start_date', ['дата старта', 'старт']],
  ['publish_time', ['время публикации', 'время']],
  ['address_form', ['обращение']],
  ['rubrics_text', ['рубрики']],
  ['ctas', ['призывы', 'призыв']],
  ['facts', ['на чем основаны факты', 'источники', 'факты']],
  ['exclusions', ['чего в роликах нет', 'ограничения', 'табу']],
  ['specialist', ['где нужна фраза о специалисте', 'фраза о специалисте']],
  ['open_questions', ['открытые вопросы']],
  ['checks', ['что проверить перед публикацией', 'проверить перед публикацией']],
];

export function passportFieldFor(param: string): PassportField | null {
  const h = normHeader(param);
  for (const [field, names] of PASSPORT_PARAMS) if (names.includes(h)) return field;
  return null;
}

export type GridKind =
  | { kind: 'plan'; headerRow: number; columns: (PlanField | null)[] }
  | { kind: 'passport'; headerRow: number; projects: string[] };

/** Finds what the pasted block is: a content plan (headers in a row) or the passport (parameters in the first column). */
export function detectGrid(grid: Grid): GridKind | null {
  for (let r = 0; r < Math.min(grid.length, 6); r++) {
    const row = grid[r];
    if (normHeader(row[0] ?? '') === 'параметр') {
      return { kind: 'passport', headerRow: r, projects: row.slice(1).filter(Boolean) };
    }
    const columns = row.map(planFieldFor);
    const known = columns.filter(Boolean);
    if (known.length >= 3 && (columns.includes('title') || columns.includes('script') || columns.includes('hook'))) {
      return { kind: 'plan', headerRow: r, columns };
    }
  }
  // Passport without the «Параметр» header: several known parameters in column A.
  const params = grid.map((r) => passportFieldFor(r[0] ?? '')).filter(Boolean).length;
  if (params >= 4) {
    const width = Math.max(...grid.map((r) => r.length));
    return { kind: 'passport', headerRow: -1, projects: Array.from({ length: width - 1 }, (_, i) => `Проект ${i + 1}`) };
  }
  return null;
}

/** Google Sheets link → CSV export URL for the linked tab. */
export function sheetCsvUrl(link: string): string | null {
  const s = link.trim();
  if (/output=csv|format=csv/.test(s)) return s;
  const id = /\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/.exec(s)?.[1];
  if (!id) return null;
  const gid = /[#&?]gid=(\d+)/.exec(s)?.[1] ?? '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/** Grid → TSV for pasting back into Google Sheets. */
export function toDelimited(grid: Grid, delimiter = '\t'): string {
  const special = delimiter === '\t' ? /[\t\n\r"]/ : /[,;\n\r"]/;
  const esc = (c: string) => (special.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return grid.map((r) => r.map(esc).join(delimiter)).join('\n');
}
