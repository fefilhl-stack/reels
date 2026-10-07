'use client';

import { useEffect, useRef, useState } from 'react';
import { MARKS, type MarkName } from './ui/Icons';
import { INTRO_DONE_EVENT, RIBBONS_EVENT, RIBBONS_READY_EVENT, clamp, easeInOut, easeOut, lerp, markReady, progress } from '@/lib/motion';
import styles from './Intro.module.css';

type Box = { l: number; t: number; r: number; b: number; rad: number };

const TILE = 76; // dark logo tile, px
const RING = 13; // lime border left around the tile at the end

/**
 * Lime screen with the logo tile in the middle. When the page is ready the
 * lime shrinks into a squircle, flies to the first node of the hero workflow
 * (or the header logo when that node is off screen) and becomes a thin lime
 * ring around the tile, then fades into the node.
 */
export default function Intro({ mark = 'relay' }: { mark?: MarkName }) {
  const BrandMark = MARKS[mark];
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const el = rootRef.current;
    const panel = panelRef.current;
    const tile = tileRef.current;
    if (!el || !panel || !tile) return;

    const finish = () => {
      markReady();
      html.classList.add('intro-landed', 'intro-done');
      html.classList.remove('is-locked');
      window.dispatchEvent(new Event(RIBBONS_EVENT));
      window.dispatchEvent(new Event(INTRO_DONE_EVENT));
      setGone(true);
    };

    const skip = !html.classList.contains('js') || html.classList.contains('intro-done');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || skip) {
      finish();
      return;
    }

    html.classList.add('is-locked');
    const W = window.innerWidth;
    const H = window.innerHeight;
    const inset = W < 700 ? 6 : 10;
    const full: Box = { l: inset, t: inset, r: W - inset, b: H - inset, rad: W < 700 ? 18 : 24 };

    const setPanel = (q: Box) => {
      panel.style.clipPath = `inset(${q.t.toFixed(1)}px ${(W - q.r).toFixed(1)}px ${(H - q.b).toFixed(1)}px ${q.l.toFixed(1)}px round ${q.rad.toFixed(1)}px)`;
    };
    const setTile = (x: number, y: number, s: number) => {
      tile.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    };

    // where the lime lands: the hero's first node, or the header logo
    const landing = () => {
      const candidates = [
        document.querySelector<HTMLElement>('[data-intro-target]'),
        document.querySelector<HTMLElement>('[data-brand-mark]'),
      ];
      for (const c of candidates) {
        if (!c) continue;
        const b = c.getBoundingClientRect();
        if (b.width && b.top > 30 && b.bottom < H - 20 && b.left > -b.width * 0.4 && b.right < W + b.width * 0.4) {
          return c;
        }
      }
      return null;
    };

    let fontsReady = false;
    (document.fonts?.ready ?? Promise.resolve()).then(
      () => (fontsReady = true),
      () => (fontsReady = true),
    );
    // shader compilation can stall slow devices; let it happen behind the still lime screen
    let backgroundReady = false;
    const onBackground = () => (backgroundReady = true);
    window.addEventListener(RIBBONS_READY_EVENT, onBackground, { once: true });

    setPanel(full);
    setTile(W / 2, H / 2, 0.9);

    const HOLD = 520;
    const SHRINK = 780;
    const FADE = 380;
    let t0 = 0;
    let tB = 0;
    let target: HTMLElement | null = null;
    let landed = false;
    let raf = 0;

    const frame = (now: number) => {
      if (!t0) t0 = now; // starts on the first painted frame (background tabs)
      const t = now - t0;

      // A — hold the lime screen until fonts and the background are ready (max ~2.6 s)
      const pop = easeOut(progress(t, 0, 320));
      if (!tB) {
        setTile(W / 2, H / 2, 0.9 + 0.1 * pop);
        if (t >= HOLD && ((fontsReady && backgroundReady) || t > 2600)) {
          tB = t;
          target = landing();
          markReady();
        }
        raf = requestAnimationFrame(frame);
        return;
      }

      // B — shrink into a squircle and fly to the landing spot
      let tx = W / 2;
      let ty = H / 2;
      if (target) {
        const b = target.getBoundingClientRect();
        tx = b.left + b.width / 2;
        ty = b.top + b.height / 2;
      }
      const p = easeInOut(progress(t, tB, tB + SHRINK));
      const size = TILE + RING * 2;
      const end: Box = { l: tx - size / 2, t: ty - size / 2, r: tx + size / 2, b: ty + size / 2, rad: 26 };
      const q: Box = {
        l: lerp(full.l, end.l, p),
        t: lerp(full.t, end.t, p),
        r: lerp(full.r, end.r, p),
        b: lerp(full.b, end.b, p),
        rad: 0,
      };
      const minSide = Math.min(q.r - q.l, q.b - q.t);
      // big soft corners while it shrinks, settling on the tile radius
      q.rad = lerp(Math.max(full.rad, minSide * 0.28), end.rad, clamp((p - 0.6) / 0.4, 0, 1));
      setPanel(q);
      setTile(lerp(W / 2, tx, p), lerp(H / 2, ty, p), 1);

      if (p > 0.55 && !html.classList.contains('intro-ribbons')) {
        html.classList.add('intro-ribbons');
        window.dispatchEvent(new Event(RIBBONS_EVENT));
      }

      // C — the ring fades into the node underneath
      const c = progress(t, tB + SHRINK, tB + SHRINK + FADE);
      if (c > 0) {
        if (!landed) {
          landed = true;
          html.classList.add('intro-landed');
        }
        el.style.opacity = String(1 - c);
      }
      if (c < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        finish();
      }
    };
    raf = requestAnimationFrame(frame);

    // never leave the page locked behind the intro
    const safety = window.setTimeout(finish, 12000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(safety);
      window.removeEventListener(RIBBONS_READY_EVENT, onBackground);
    };
  }, []);

  if (gone) return null;

  return (
    <div ref={rootRef} className={styles.intro} aria-hidden="true">
      <div className={styles.backdrop} />
      <div ref={panelRef} className={styles.panel} />
      <div ref={tileRef} className={styles.tile}>
        <BrandMark tone="onDark" />
      </div>
    </div>
  );
}
