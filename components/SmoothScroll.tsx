'use client';

import { useEffect } from 'react';
import { INTRO_DONE_EVENT } from '@/lib/motion';

type LenisLike = {
  raf: (t: number) => void;
  stop: () => void;
  start: () => void;
  destroy: () => void;
  scrollTo: (target: number | HTMLElement, opts?: { offset?: number; duration?: number }) => void;
};

/** Inertial wheel scrolling (Lenis) on mouse devices, plus smooth in-page anchor links everywhere. */
export default function SmoothScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    let lenis: LenisLike | null = null;
    let raf = 0;
    let alive = true;

    const onIntroDone = () => lenis?.start();

    if (!reduce && !coarse) {
      import('lenis').then(({ default: Lenis }) => {
        if (!alive) return;
        lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95 }) as unknown as LenisLike;
        if (!root.classList.contains('intro-done')) {
          lenis.stop();
          window.addEventListener(INTRO_DONE_EVENT, onIntroDone, { once: true });
        }
        const loop = (t: number) => {
          lenis?.raf(t);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      });
    }

    const headerOffset = () => -((document.querySelector('header')?.getBoundingClientRect().height ?? 80) + 8);

    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const hash = a.getAttribute('href') ?? '';
      if (hash.length < 2) return;
      const target = hash === '#top' ? 0 : document.querySelector<HTMLElement>(hash);
      if (target === null) return;
      e.preventDefault();
      if (lenis) {
        lenis.scrollTo(target, { offset: target === 0 ? 0 : headerOffset(), duration: 1.4 });
      } else if (target === 0) {
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      } else {
        const y = target.getBoundingClientRect().top + window.scrollY + headerOffset();
        window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
      }
      history.replaceState(null, '', hash);
      if (target !== 0) target.focus?.({ preventScroll: true });
    };

    document.addEventListener('click', onClick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('click', onClick);
      window.removeEventListener(INTRO_DONE_EVENT, onIntroDone);
      lenis?.destroy();
    };
  }, []);

  return null;
}
