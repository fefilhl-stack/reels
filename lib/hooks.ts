'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { onReady, isReady, prefersReducedMotion } from './motion';

type InViewOptions = {
  /** Stay true after the first time the element is seen. */
  once?: boolean;
  rootMargin?: string;
  threshold?: number;
  /** Wait for the intro to hand the page over before reporting visibility. */
  waitReady?: boolean;
};

export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { once = true, rootMargin = '0px 0px -10% 0px', threshold = 0.15, waitReady = true }: InViewOptions = {},
) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ready = !waitReady || isReady();
    let visible = false;
    let done = false;

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      },
      { rootMargin, threshold },
    );

    function sync() {
      if (done) return;
      const v = ready && visible;
      setInView(v);
      if (v && once) {
        done = true;
        io.disconnect();
      }
    }

    io.observe(el);
    const off = ready
      ? undefined
      : onReady(() => {
          ready = true;
          sync();
        });
    return () => {
      io.disconnect();
      off?.();
    };
  }, [ref, once, rootMargin, threshold, waitReady]);

  return inView;
}

/** Counts from 0 to `target` once `active` turns true. Starts at the final value for SSR / reduced motion. */
export function useCountUp(target: number, active: boolean, duration = 2.2) {
  const [value, setValue] = useState(target);
  const armed = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    armed.current = true;
    setValue(0);
  }, []);

  useEffect(() => {
    if (!active || !armed.current) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / (duration * 1000));
      const e = 1 - Math.pow(1 - p, 3.2);
      setValue(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);

  return value;
}

/** True when the user asked for less motion. Safe on the server (false). */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}
