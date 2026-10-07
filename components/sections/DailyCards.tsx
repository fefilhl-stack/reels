'use client';

import { useRef, type CSSProperties } from 'react';
import Typewriter from '../ui/Typewriter';
import Avatar from '../ui/Avatar';
import { IconClock } from '../ui/Icons';
import { useCountUp, useInView } from '@/lib/hooks';
import { seeded } from '@/lib/motion';
import styles from './Daily.module.css';

const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

/* ---------- this week, run by run ---------- */

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ROWS = 8;

export type DailyContent = {
  week: { label: string; chip: string; days: string[] };
  ring: { label: string; value: number; caption: string };
  people: { label: string; unit: string; caption: string };
  waves: { label: string; recovered: string; failed: string };
};

export const RELAY_DAILY: DailyContent = {
  week: { label: 'this week, run by run', chip: 'next run in 12 min', days: DAYS },
  ring: { label: 'hands off', value: 81, caption: 'of steps finish without a person in the loop' },
  people: { label: 'waiting on people', unit: 'approvals', caption: 'Longest wait: 26 minutes, in #finance' },
  waves: { label: 'failures and recoveries', recovered: 'recovered', failed: 'failed' },
};
const TODAY = 1;
const HOT_ROW = 4;
const rnd = seeded(41);
const WEEK = DAYS.map((_, c) =>
  Array.from({ length: ROWS }, () => (c >= 5 ? 0.035 + rnd() * 0.03 : 0.13 + rnd() * 0.2)),
);

export function WeekCard({ c = RELAY_DAILY.week }: { c?: DailyContent['week'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.25 });
  return (
    <article ref={ref} className={`card ${styles.card} ${styles.week}`} data-reveal>
      <div className={styles.cardTop}>
        <p className="card-label">
          <Typewriter text={c.label} />
        </p>
        <span className={styles.chip}>
          <IconClock />
          <Typewriter text={c.chip} delay={0.4} />
        </span>
      </div>
      <div className={`${styles.heat} ${inView ? styles.on : ''}`}>
        <div className={styles.hours} aria-hidden="true">
          <span>09</span>
          <span>11</span>
          <span>13</span>
          <span>15</span>
        </div>
        {c.days.map((day, col) => (
          <div key={day} className={`${styles.day} ${col === TODAY ? styles.today : ''}`} style={{ '--c': col } as CSSProperties}>
            <div className={styles.cells}>
              {WEEK[col].map((a, r) => (
                <i
                  key={r}
                  className={col === TODAY && r === HOT_ROW ? styles.hotCell : undefined}
                  style={{ '--a': a, '--r': r } as CSSProperties}
                />
              ))}
            </div>
            <span>{day}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

/* ---------- hands off ring ---------- */

export function RingCard({ c = RELAY_DAILY.ring }: { c?: DailyContent['ring'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const v = useCountUp(c.value, inView, 2.4);
  return (
    <article ref={ref} className={`card ${styles.card} ${styles.ringCard}`} data-reveal style={d(0.08)}>
      <p className="card-label">{c.label}</p>
      <div className={styles.ring}>
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <circle className={styles.ringTrack} cx="70" cy="70" r="58" />
          <circle className={styles.ringBar} cx="70" cy="70" r="58" pathLength={100} style={{ strokeDashoffset: 100 - v }} />
        </svg>
        <b>{Math.round(v)}%</b>
      </div>
      <p className={styles.caption}>{c.caption}</p>
    </article>
  );
}

/* ---------- waiting on people ---------- */

export function PeopleCard({ c = RELAY_DAILY.people }: { c?: DailyContent['people'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const v = useCountUp(3, inView, 1.6);
  return (
    <article ref={ref} className={`card ${styles.card}`} data-reveal>
      <p className="card-label">
        <Typewriter text={c.label} />
      </p>
      <div className={`${styles.faces} ${inView ? styles.on : ''}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ '--i': i } as CSSProperties} className={i === 4 ? styles.idle : undefined}>
            <Avatar look={i} size={52} />
          </span>
        ))}
      </div>
      <p className={styles.count}>
        <b>{Math.round(v)}</b>
        <span>{c.unit}</span>
      </p>
      <p className={styles.caption}>{c.caption}</p>
    </article>
  );
}

/* ---------- failures and recoveries ---------- */

function wave(width: number, height: number, amp: number, phase: number) {
  const pts: string[] = [];
  const period = width / 2.4;
  for (let x = 0; x <= width * 2 + 0.5; x += 6) {
    const y = height / 2 + Math.sin((x / period) * Math.PI * 2 + phase) * amp;
    pts.push(`${x === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

export function WavesCard({ c = RELAY_DAILY.waves }: { c?: DailyContent['waves'] }) {
  return (
    <article className={`card ${styles.card}`} data-reveal style={d(0.08)}>
      <p className="card-label">
        <Typewriter text={c.label} />
      </p>
      <div className={styles.waves} aria-hidden="true">
        <svg viewBox="0 0 960 120" preserveAspectRatio="none">
          <path className={styles.failed} d={wave(480, 120, 34, Math.PI)} />
          <path className={styles.recovered} d={wave(480, 120, 34, 0)} />
        </svg>
      </div>
      <p className={styles.legend}>
        <span>
          <i className={styles.limeDot} />
          {c.recovered}
        </span>
        <span>
          <i />
          {c.failed}
        </span>
      </p>
    </article>
  );
}
