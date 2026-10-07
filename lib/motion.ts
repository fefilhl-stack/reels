// Small shared helpers for timing, readiness and easing.

export const READY_EVENT = 'relay:ready';
export const RIBBONS_EVENT = 'relay:ribbons';
export const RIBBONS_READY_EVENT = 'relay:ribbons-ready';
export const INTRO_DONE_EVENT = 'relay:intro-done';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True once the intro has started handing the page over (reveals may run). */
export function isReady(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('is-ready');
}

export function markReady() {
  const root = document.documentElement;
  if (root.classList.contains('is-ready')) return;
  root.classList.add('is-ready');
  window.dispatchEvent(new Event(READY_EVENT));
}

/** Calls `cb` when the page is ready (immediately if it already is). Returns an unsubscribe. */
export function onReady(cb: () => void): () => void {
  if (isReady()) {
    cb();
    return () => {};
  }
  const handler = () => cb();
  window.addEventListener(READY_EVENT, handler, { once: true });
  return () => window.removeEventListener(READY_EVENT, handler);
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const progress = (v: number, a: number, b: number) => clamp((v - a) / (b - a), 0, 1);

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Deterministic PRNG so generated visuals look the same on server and client. */
export function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
