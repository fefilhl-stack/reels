'use client';

import { useEffect, useRef, useState } from 'react';
import { RIBBONS_READY_EVENT } from '@/lib/motion';
import styles from './Ribbons.module.css';

/** Fixed full-screen three.js background. Falls back to a soft gradient without WebGL. */
export default function Ribbons() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onLost = () => setFallback(true);
    canvas.addEventListener('ribbons:lost', onLost);

    // the intro waits for this before it leaves the lime screen
    const announce = () => window.dispatchEvent(new Event(RIBBONS_READY_EVENT));

    Promise.all([import('three'), import('@/lib/ribbons')])
      .then(([THREE, { createRibbons }]) => {
        if (disposed) return;
        try {
          const ribbons = createRibbons(THREE, canvas);
          cleanup = ribbons.dispose;
          ribbons.ready.then(announce);
        } catch (err) {
          console.warn('[ribbons] WebGL unavailable, using the static background.', err);
          setFallback(true);
          announce();
        }
      })
      .catch(() => {
        setFallback(true);
        announce();
      });

    return () => {
      disposed = true;
      canvas.removeEventListener('ribbons:lost', onLost);
      cleanup?.();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className={styles.canvas} hidden={fallback} aria-hidden="true" />
      {fallback && <div className={styles.fallback} aria-hidden="true" />}
    </>
  );
}
