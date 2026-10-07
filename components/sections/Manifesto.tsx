'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { Chevrons } from '../ui/Icons';
import { clamp, easeInOut, lerp, progress } from '@/lib/motion';
import styles from './Manifesto.module.css';

const LABEL = '[ what we are actually selling ]';
const LINE_1 = ['The', 'best', 'workflow', 'is', 'the', 'one'];
const LINE_2_EM = ['nobody', 'mentions'];
const LINE_2 = ['in', 'standup.'];
const WORDS = LINE_1.length + LINE_2_EM.length + LINE_2.length;

type Box = { l: number; t: number; r: number; b: number; rad: number; tileY: number };

/**
 * Sticky scroll scene: a lime tile rises, opens into a full-width band while
 * the sentence writes itself, then folds back into a lime ring around the logo.
 */
export default function Manifesto() {
  const secRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sec = secRef.current;
    const panel = panelRef.current;
    const copy = copyRef.current;
    const label = labelRef.current;
    const tile = tileRef.current;
    if (!sec || !panel || !copy || !label || !tile) return;
    const words = Array.from(copy.querySelectorAll<HTMLElement>('[data-w]'));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lit = -1;
    let typed = -1;
    let raf = 0;

    const keyframes = (W: number, H: number): [number, Box][] => {
      const narrow = W < 760;
      const s0 = clamp(W * 0.11, 120, 180);
      const sq = Math.min(W * 0.225, H * 0.42, 440);
      const ring = 76 + 26;
      const band: Box = { l: narrow ? 8 : 0, r: narrow ? W - 8 : W, t: H * 0.2, b: H * 0.8, rad: narrow ? 28 : 40, tileY: H * 0.57 };
      return [
        [0, { l: W / 2 - s0 / 2, r: W / 2 + s0 / 2, t: H / 2 - s0 / 2, b: H / 2 + s0 / 2, rad: s0 * 0.3, tileY: H / 2 }],
        [0.06, { l: W / 2 - s0 / 2, r: W / 2 + s0 / 2, t: H / 2 - s0 / 2, b: H / 2 + s0 / 2, rad: s0 * 0.3, tileY: H / 2 }],
        [0.2, band],
        [0.6, band],
        [0.67, { l: W * 0.08, r: W * 0.92, t: H * 0.19, b: H * 0.72, rad: 64, tileY: H * 0.5 }],
        [0.73, { l: W * 0.26, r: W * 0.74, t: H * 0.18, b: H * 0.64, rad: 120, tileY: H * 0.43 }],
        [0.8, { l: W / 2 - sq / 2, r: W / 2 + sq / 2, t: H * 0.37 - sq / 2, b: H * 0.37 + sq / 2, rad: sq * 0.3, tileY: H * 0.37 }],
        [0.92, { l: W / 2 - ring / 2, r: W / 2 + ring / 2, t: H * 0.34 - ring / 2, b: H * 0.34 + ring / 2, rad: 30, tileY: H * 0.34 }],
        [1, { l: W / 2 - ring / 2, r: W / 2 + ring / 2, t: H * 0.34 - ring / 2, b: H * 0.34 + ring / 2, rad: 30, tileY: H * 0.34 }],
      ];
    };

    const at = (frames: [number, Box][], p: number): Box => {
      for (let i = 0; i < frames.length - 1; i++) {
        const [pa, a] = frames[i];
        const [pb, b] = frames[i + 1];
        if (p <= pb) {
          const f = easeInOut(progress(p, pa, pb));
          return {
            l: lerp(a.l, b.l, f),
            t: lerp(a.t, b.t, f),
            r: lerp(a.r, b.r, f),
            b: lerp(a.b, b.b, f),
            rad: lerp(a.rad, b.rad, f),
            tileY: lerp(a.tileY, b.tileY, f),
          };
        }
      }
      return frames[frames.length - 1][1];
    };

    const update = () => {
      raf = 0;
      const W = sec.clientWidth;
      const H = window.innerHeight;
      const box = sec.getBoundingClientRect();
      const p = reduce ? 0.58 : clamp(-box.top / Math.max(1, box.height - H), 0, 1);
      const q = at(keyframes(W, H), p);

      panel.style.clipPath = `inset(${q.t.toFixed(1)}px ${(W - q.r).toFixed(1)}px ${(H - q.b).toFixed(1)}px ${q.l.toFixed(1)}px round ${q.rad.toFixed(1)}px)`;
      tile.style.transform = `translate3d(-50%, ${(q.tileY - 38).toFixed(1)}px, 0)`;
      const rise = easeInOut(progress(p, 0.6, 0.76));
      copy.style.transform = `translate3d(-50%, ${(q.t + H * lerp(0.075, -0.035, rise)).toFixed(1)}px, 0)`;
      copy.style.opacity = String(1 - progress(p, 0.78, 0.86));

      const nextTyped = Math.round(progress(p, 0.12, 0.26) * LABEL.length);
      if (nextTyped !== typed) {
        typed = nextTyped;
        label.textContent = LABEL.slice(0, typed);
      }
      const nextLit = Math.round(progress(p, 0.18, 0.54) * WORDS);
      if (nextLit !== lit) {
        lit = nextLit;
        words.forEach((w, i) => w.toggleAttribute('data-lit', i < lit));
      }
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
    };
  }, []);

  let w = 0;
  const word = (text: string) => (
    <span key={w} data-w style={{ '--i': w++ } as CSSProperties}>
      {text}
    </span>
  );

  return (
    <section ref={secRef} className={styles.manifesto} data-scene="low" aria-label="What we believe">
      <div className={styles.stage}>
        <div ref={panelRef} className={styles.panel}>
          <div ref={copyRef} className={styles.copy}>
            <p className={styles.label} aria-hidden="true">
              <span ref={labelRef}>{LABEL}</span>
            </p>
            <p className={styles.text}>
              <span className="sr-only">The best workflow is the one nobody mentions in standup.</span>
              <span aria-hidden="true" className={styles.line}>
                {LINE_1.map((t) => word(t))}
              </span>
              <span aria-hidden="true" className={styles.line}>
                <em>{LINE_2_EM.map((t) => word(t))}</em> {LINE_2.map((t) => word(t))}
              </span>
            </p>
          </div>
          <div ref={tileRef} className={styles.tile} aria-hidden="true">
            <Chevrons tone="onDark" />
          </div>
        </div>
      </div>
    </section>
  );
}
