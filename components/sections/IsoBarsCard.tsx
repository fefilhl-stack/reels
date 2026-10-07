'use client';

import { useEffect, useRef } from 'react';
import { isReady, onReady } from '@/lib/motion';
import type { IsoBars } from '@/lib/isoBars';
import styles from './IsoBarsCard.module.css';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const VALUES = [1.6, 2.0, 2.5, 3.0, 3.8, 4.4];
const HIGHLIGHT = 5;

/** "Runs per weekday" as isometric three.js columns, animated while on screen. */
export default function IsoBarsCard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let bars: IsoBars | null = null;
    let disposed = false;
    let visible = false;
    let ready = isReady();
    const sync = () => {
      if (!bars) return;
      if (visible && ready) bars.start();
      else bars.stop();
    };

    // build the scene only when the card gets close to the viewport
    const create = () => {
      Promise.all([import('three'), import('@/lib/isoBars')])
        .then(([THREE, { createIsoBars }]) => {
          if (disposed) return;
          try {
            bars = createIsoBars(THREE, canvas, { values: VALUES, highlight: HIGHLIGHT });
            sync();
          } catch {
            canvas.dataset.failed = 'true';
          }
        })
        .catch(() => (canvas.dataset.failed = 'true'));
    };
    const near = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        near.disconnect();
        create();
      },
      { rootMargin: '900px 0px' },
    );
    near.observe(canvas);

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        sync();
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(canvas);
    const offReady = onReady(() => {
      ready = true;
      sync();
    });
    const ro = new ResizeObserver(() => bars?.resize());
    ro.observe(canvas);

    return () => {
      disposed = true;
      near.disconnect();
      io.disconnect();
      ro.disconnect();
      offReady();
      bars?.dispose();
    };
  }, []);

  return (
    <div className={`card ${styles.card}`}>
      <p className={styles.head}>
        <span>runs per weekday</span>
        <b>62,000 average</b>
      </p>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label="Runs per weekday, growing from Monday to Saturday" />
      <ul className={styles.days}>
        {DAYS.map((d, i) => (
          <li key={d} className={i === HIGHLIGHT ? styles.hot : undefined}>
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}
