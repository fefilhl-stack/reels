'use client';

import { useEffect, useRef, useState } from 'react';
import RollingNumber from '../ui/RollingNumber';
import { IconCheck, IconClock } from '../ui/Icons';
import { useInView } from '@/lib/hooks';
import { prefersReducedMotion } from '@/lib/motion';
import styles from './RunTimeline.module.css';

type Step = { name: string; start: number; ms: number; play: number; wait?: string };

// start / ms are in run milliseconds (axis 0..200); play is real seconds the step takes on screen
const STEPS: Step[] = [
  { name: 'read refund', start: 0, ms: 115, play: 1.5 },
  { name: 'check amount', start: 118, ms: 3, play: 0.45 },
  { name: 'branch, over 5000', start: 123, ms: 0, play: 0.35 },
  { name: 'ask finance', start: 130, ms: 26, play: 0.6, wait: 'on Dana' },
];
const TOTAL = STEPS.reduce((s, x) => s + x.play, 0);
const HOLD = 2.8;
const AXIS = [0, 50, 100, 150, 200];

/** A run replaying step by step: bars grow while their timers count up. */
export default function RunTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, threshold: 0.3 });
  const [clock, setClock] = useState(TOTAL); // seconds into the replay; SSR shows the finished run
  const [run, setRun] = useState(41982);
  const clockRef = useRef(TOTAL);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    clockRef.current = 0;
    setClock(0);
  }, []);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      let next = clockRef.current + dt;
      if (next > TOTAL + HOLD) {
        next = 0;
        const inc = 1 + Math.floor(Math.random() * 3);
        setRun((r) => r + inc);
      }
      clockRef.current = next;
      setClock(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView]);

  let t0 = 0;
  const rows = STEPS.map((s) => {
    const p = Math.min(1, Math.max(0, (clock - t0) / s.play));
    const started = clock >= t0;
    t0 += s.play;
    return { ...s, p, started, done: p >= 1 };
  });

  return (
    <div ref={ref} className={`card ${styles.card}`}>
      <div className={styles.head}>
        run <RollingNumber value={String(run)} />
      </div>
      <ul className={styles.rows}>
        {rows.map((r) => {
          const eased = 1 - Math.pow(1 - r.p, 2);
          const ms = Math.round(r.ms * eased);
          const width = r.wait ? (r.ms / 200) * 100 : Math.max((r.ms * eased) / 200 * 100, r.started ? 0.9 : 0);
          return (
            <li key={r.name} className={r.started ? styles.on : undefined}>
              <span className={styles.icon}>
                {r.wait ? r.started && <IconClock /> : r.done && <IconCheck className={styles.check} />}
              </span>
              <span className={styles.name}>{r.name}</span>
              <span className={styles.track}>
                <i
                  className={r.wait ? styles.waitBar : r.ms < 10 ? styles.tick : styles.bar}
                  style={{
                    left: `${(r.start / 200) * 100}%`,
                    width: `${width}%`,
                    opacity: r.started ? (r.wait ? r.p : 1) : 0,
                  }}
                />
              </span>
              <span className={styles.value}>{r.wait ? (r.p > 0.3 ? r.wait : '') : `${ms} ms`}</span>
            </li>
          );
        })}
      </ul>
      <div className={styles.axis} aria-hidden="true">
        <span />
        <span className={styles.ticks}>
          {AXIS.map((a) => (
            <span key={a} style={{ left: `${(a / 200) * 100}%` }}>
              {a === 200 ? '200 ms' : a}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
