'use client';

import { useEffect, useRef } from 'react';
import styles from './FrostLayer.module.css';

/**
 * One viewport-sized frosted-glass layer between the ribbons and the page.
 * It is clipped to whatever part of the [data-frost] region is on screen, so
 * the ribbons look out of focus behind those sections and sharp elsewhere —
 * with a single blur instead of one per section.
 */
export default function FrostLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const region = document.querySelector<HTMLElement>('[data-frost]');
    if (!layer || !region) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const r = region.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom <= 0 || r.top >= vh) {
        layer.style.visibility = 'hidden';
        return;
      }
      layer.style.visibility = 'visible';
      layer.style.clipPath = `inset(${Math.max(0, r.top).toFixed(1)}px 0 ${Math.max(0, vh - r.bottom).toFixed(1)}px 0)`;
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    const ro = new ResizeObserver(request);
    ro.observe(region);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      ro.disconnect();
    };
  }, []);

  return <div ref={ref} className={styles.frost} aria-hidden="true" />;
}
