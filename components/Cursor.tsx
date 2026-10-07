'use client';

import { useEffect, useRef } from 'react';
import styles from './Cursor.module.css';

/** A thin lime ring that trails the (still visible) system cursor on mouse devices. */
export default function Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;

    let x = -100;
    let y = -100;
    let rx = -100;
    let ry = -100;
    let scale = 1;
    let hover = false;
    let seen = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (!seen) {
        seen = true;
        rx = x;
        ry = y;
        el.classList.add(styles.on);
      }
    };
    const onOver = (e: PointerEvent) => {
      const t = e.target as Element | null;
      hover = !!t?.closest?.('a, button, input, label, [role="button"], [data-cursor]');
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) el.classList.remove(styles.on);
    };
    const onEnter = () => seen && el.classList.add(styles.on);

    const loop = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      scale += ((hover ? 1.6 : 1) - scale) * 0.18;
      el.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver);
    document.addEventListener('mouseout', onLeave);
    document.addEventListener('mouseenter', onEnter);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('mouseout', onLeave);
      document.removeEventListener('mouseenter', onEnter);
    };
  }, []);

  return <div ref={ref} className={styles.ring} aria-hidden="true" />;
}
