'use client';

import { useRef, type CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import { useCountUp, useInView } from '@/lib/hooks';
import { formatNumber, seeded } from '@/lib/motion';
import styles from './Cases.module.css';

const VOLUME = 62418;
const HOURS = 11;
const FIRST = 96;
const BARS = 14;

// a gently rising, slightly noisy line
const rnd = seeded(23);
const SPARK = Array.from({ length: 22 }, (_, i) => {
  const f = i / 21;
  return 0.18 + Math.pow(f, 1.25) * 0.66 + (rnd() - 0.5) * 0.07;
});

const QUOTES = [
  { text: 'We killed four scripts nobody wanted to own and a spreadsheet that had been lying to us.', name: 'Marta Silvani', role: 'head of operations, Fielder' },
  { text: 'Finance stopped asking me for the weekly export. It just lands in the channel now.', name: 'Owen Brandt', role: 'data lead, Cassette' },
  { text: 'What sold my team was the log. When something breaks we see the exact payload.', name: 'Tom Ekelund', role: 'cto, Bright Coast' },
];

function Sparkline({ p }: { p: number }) {
  const W = 300;
  const H = 80;
  const pts = SPARK.map((v, i) => [(i / (SPARK.length - 1)) * W, H - v * H] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const reach = Math.max(0.001, p);
  const end = pts[Math.min(pts.length - 1, Math.round(reach * (pts.length - 1)))];
  return (
    <svg className={styles.spark} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(192,243,73,0.22)" />
          <stop offset="1" stopColor="rgba(192,243,73,0)" />
        </linearGradient>
        <clipPath id="sparkClip">
          <rect width={W * reach} height={H + 10} y={-5} />
        </clipPath>
      </defs>
      <g clipPath="url(#sparkClip)">
        <path d={area} fill="url(#sparkFill)" />
        <path d={line} className={styles.sparkLine} />
      </g>
      <line x1={end[0]} x2={end[0]} y1={end[1]} y2={H} className={styles.sparkDrop} />
      <circle cx={end[0]} cy={end[1]} r={3.2} className={styles.sparkDot} />
    </svg>
  );
}

export default function Cases() {
  const statsRef = useRef<HTMLDivElement>(null);
  const inView = useInView(statsRef, { threshold: 0.3 });
  const volume = useCountUp(VOLUME, inView, 2.8);
  const hours = useCountUp(HOURS, inView, 2.8);
  const first = useCountUp(FIRST, inView, 2.8);
  const lit = Math.round((hours / HOURS) * HOURS);

  return (
    <section id="customers" className={`section ${styles.cases}`} data-scene="loop">
      <div className="container">
        <SectionHead
          eyebrow="case studies"
          title={
            <>
              Numbers we did <em>not</em> have to explain away.
            </>
          }
          aside="Counted across every account, including the ones that churned. An honest average, not a best case."
        />

        <div ref={statsRef} className={styles.stats}>
          <div className={styles.stat} data-reveal>
            <span className="card-label">volume</span>
            <b>{formatNumber(volume)}</b>
            <span className={styles.sub}>runs handled on an average weekday</span>
            <Sparkline p={volume / VOLUME} />
          </div>
          <div className={styles.stat} data-reveal style={{ '--d': '0.08s' } as CSSProperties}>
            <span className="card-label">time back</span>
            <b>{Math.round(hours)}</b>
            <span className={styles.sub}>hours a week given back per person</span>
            <div className={styles.bars} aria-hidden="true">
              {Array.from({ length: BARS }, (_, i) => (
                <i key={i} className={i < lit ? styles.barOn : undefined} style={{ '--i': i } as CSSProperties} />
              ))}
            </div>
          </div>
          <div className={styles.stat} data-reveal style={{ '--d': '0.16s' } as CSSProperties}>
            <span className="card-label">first attempt</span>
            <b>{Math.round(first)}%</b>
            <span className={styles.sub}>of runs finish on the first attempt</span>
            <div className={styles.progress} aria-hidden="true">
              <i style={{ width: `${first}%` }} />
            </div>
          </div>
        </div>

        <div className={styles.quotes}>
          {QUOTES.map((q, i) => (
            <figure key={q.name} className={styles.quote} data-reveal style={{ '--d': `${i * 0.1}s` } as CSSProperties}>
              <blockquote>{q.text}</blockquote>
              <figcaption>
                <b>{q.name}</b>
                <span>{q.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
