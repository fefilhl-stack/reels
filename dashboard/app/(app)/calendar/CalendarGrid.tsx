'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { moveScript } from '@/app/actions';
import type { Platform, ScriptStatus } from '@/lib/types';
import { PlatformIcon } from '@/components/Icons';

export interface CalItem {
  id: number;
  number: number;
  title: string;
  day: string;
  time: string;
  status: ScriptStatus;
  state: 'empty' | 'ready' | 'scheduled' | 'published' | 'failed';
  platforms: Platform[];
  color: number;
  project: string;
}

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const STATE_LABEL: Record<CalItem['state'], string> = {
  empty: 'нет ролика',
  ready: 'ролик загружен',
  scheduled: 'запланирован',
  published: 'опубликован',
  failed: 'ошибка публикации',
};

export function CalendarGrid({ days, month, today, items, multi }: { days: string[]; month: string; today: string; items: CalItem[]; multi: boolean }) {
  const [list, move] = useOptimistic(items, (state, { id, day }: { id: number; day: string }) => state.map((i) => (i.id === id ? { ...i, day } : i)));
  const [, start] = useTransition();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);

  return (
    <div className="cal">
      {WD.map((w) => (
        <div key={w} className="cal-h">
          {w}
        </div>
      ))}
      {days.map((d) => {
        const dayItems = list.filter((i) => i.day === d);
        return (
          <div
            key={d}
            className="cal-d"
            data-out={!d.startsWith(month)}
            data-today={d === today}
            data-over={over === d}
            onDragOver={(e) => {
              if (drag != null) {
                e.preventDefault();
                setOver(d);
              }
            }}
            onDragLeave={() => setOver((o) => (o === d ? null : o))}
            onDrop={() => {
              setOver(null);
              const id = drag;
              setDrag(null);
              if (id == null) return;
              start(async () => {
                move({ id, day: d });
                await moveScript(id, d);
              });
            }}
          >
            <span className="cal-num">{Number(d.slice(8))}</span>
            {dayItems.map((i) => (
              <Link
                key={i.id}
                href={`/content/${i.id}`}
                className="cal-post"
                data-status={i.state}
                draggable={i.state !== 'published'}
                onDragStart={() => setDrag(i.id)}
                onDragEnd={() => setDrag(null)}
                title={`№${i.number} · ${i.time} · ${i.title} · ${i.status}, ${STATE_LABEL[i.state]}${multi ? ` · ${i.project}` : ''}`}
              >
                <span className="cal-state" data-state={i.state} />
                <span className="num" style={{ fontWeight: 600 }}>
                  {i.time}
                </span>
                <span className="row cal-icons" style={{ gap: 2, flexWrap: 'nowrap' }}>
                  {multi && <span className="dot" style={{ background: `var(--s${(i.color % 8) + 1})`, width: 6, height: 6 }} />}
                  {i.platforms.map((p) => (
                    <span key={p} style={{ color: `var(--${p})`, display: 'inline-flex' }}>
                      <PlatformIcon platform={p} size={11} />
                    </span>
                  ))}
                </span>
                <span className="ellipsis cal-title">
                  №{i.number} {i.title}
                </span>
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
