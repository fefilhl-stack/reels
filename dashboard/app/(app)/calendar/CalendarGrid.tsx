'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { movePostToDay } from '@/app/actions';
import type { Platform, PostStatus } from '@/lib/types';
import { PlatformIcon } from '@/components/Icons';

export interface CalItem {
  postId: number;
  videoId: number;
  title: string;
  day: string;
  time: string;
  platforms: Platform[];
  status: PostStatus;
  color: number;
}

export interface SlotMark {
  day: string;
  time: string;
}

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function CalendarGrid({ days, month, today, items, slots }: { days: string[]; month: string; today: string; items: CalItem[]; slots: SlotMark[] }) {
  const [list, move] = useOptimistic(items, (state, { postId, day }: { postId: number; day: string }) => state.map((i) => (i.postId === postId ? { ...i, day } : i)));
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
        const daySlots = slots.filter((s) => s.day === d);
        return (
          <div
            key={d}
            className="cal-d"
            data-out={!d.startsWith(month)}
            data-today={d === today}
            data-over={over === d}
            onDragOver={(e) => {
              if (drag != null && d >= today) {
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
                move({ postId: id, day: d });
                await movePostToDay(id, d);
              });
            }}
          >
            <span className="cal-num">{Number(d.slice(8))}</span>
            {dayItems.map((i) => (
              <Link
                key={`${i.postId}`}
                href={`/content/${i.videoId}`}
                className="cal-post"
                data-status={i.status}
                draggable={i.status === 'scheduled'}
                onDragStart={() => setDrag(i.postId)}
                onDragEnd={() => setDrag(null)}
                title={`${i.time} · ${i.title}`}
              >
                <span className="dot" style={{ background: `var(--s${(i.color % 8) + 1})` }} />
                <span className="num" style={{ fontWeight: 600 }}>
                  {i.time}
                </span>
                <span className="row cal-icons" style={{ gap: 2, flexWrap: 'nowrap' }}>
                  {i.platforms.map((p) => (
                    <span key={p} style={{ color: `var(--${p})`, display: 'inline-flex' }}>
                      <PlatformIcon platform={p} size={11} />
                    </span>
                  ))}
                </span>
                <span className="ellipsis cal-title">{i.title}</span>
              </Link>
            ))}
            {daySlots.map((s) => (
              <span key={s.time} className="cal-slot">
                слот {s.time}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
