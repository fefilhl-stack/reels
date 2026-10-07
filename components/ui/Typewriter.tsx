'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from '@/lib/hooks';
import { prefersReducedMotion } from '@/lib/motion';

type Props = {
  text: string;
  /** Seconds to wait after the text scrolls into view. */
  delay?: number;
  /** Milliseconds per character. */
  speed?: number;
  className?: string;
};

/**
 * Types its text out once it scrolls into view. The untyped rest stays in the
 * layout (invisible), so boxes keep their final size while the text appears.
 */
export default function Typewriter({ text, delay = 0, speed = 24, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { threshold: 0 });
  const [count, setCount] = useState(text.length);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    setCount(0);
    setArmed(true);
  }, [text]);

  useEffect(() => {
    if (!armed || !inView) return;
    let i = 0;
    let timer = 0;
    const step = () => {
      i += 1;
      setCount(i);
      if (i < text.length) timer = window.setTimeout(step, speed);
    };
    timer = window.setTimeout(step, delay * 1000);
    return () => window.clearTimeout(timer);
  }, [armed, inView, text, delay, speed]);

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      <span aria-hidden="true" style={{ opacity: 0 }}>
        {text.slice(count)}
      </span>
    </span>
  );
}
