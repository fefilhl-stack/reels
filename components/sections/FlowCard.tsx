'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconPlus, IconPointer, IconRedo, IconBranch } from '../ui/Icons';
import { clamp } from '@/lib/motion';
import styles from './FlowCard.module.css';

const CARD_W = 700;
const CARD_H = 610;

type Run = { id: number; time: string; name: string; took: string };

const FIRST_RUNS: Run[] = [
  { id: 3, time: '09:41:02', name: 'refunds over 5000', took: '129 ms' },
  { id: 2, time: '09:38:57', name: 'weekly export', took: '2.1 s' },
  { id: 1, time: '09:31:14', name: 'invoice reminder', took: '410 ms' },
];
const NAMES = ['refunds over 5000', 'weekly export', 'invoice reminder', 'new signup to crm', 'trial ending nudge', 'payout reconcile'];
const TOOK = ['129 ms', '96 ms', '2.1 s', '410 ms', '188 ms', '1.4 s', '74 ms'];

// edges: [from, to, lit, pulse delay]
const EDGES: [string, string, boolean, number][] = [
  ['start', 'cond', true, 0],
  ['start', 'log', false, 0.5],
  ['cond', 'ask', true, 1.2],
  ['log', 'ask', false, 1.7],
];

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The tilted workflow card in the hero. Edges are measured from the nodes, so they survive any scale. */
export default function FlowCard() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<{ d: string; lit: boolean; delay: number; a: [number, number]; b: [number, number] }[]>([]);
  const [labels, setLabels] = useState<{ x: number; y: number; text: string }[]>([]);
  const [runs, setRuns] = useState<Run[]>(FIRST_RUNS);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodes: Record<string, HTMLElement> = {};
    canvas.querySelectorAll<HTMLElement>('[data-node]').forEach((n) => (nodes[n.dataset.node!] = n));
    const out: typeof edges = [];
    const lab: typeof labels = [];
    EDGES.forEach(([from, to, lit, delay], i) => {
      const a = nodes[from];
      const b = nodes[to];
      if (!a || !b) return;
      const x1 = a.offsetLeft + a.offsetWidth;
      const y1 = a.offsetTop + a.offsetHeight / 2;
      const x2 = b.offsetLeft;
      const y2 = b.offsetTop + b.offsetHeight / 2;
      const dx = Math.max(24, (x2 - x1) * 0.55);
      out.push({
        d: `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`,
        lit,
        delay,
        a: [x1, y1],
        b: [x2, y2],
      });
      if (i < 2) {
        // label sits on the curve a little after the split
        const t = 0.3;
        const it = 1 - t;
        const x = it * it * it * x1 + 3 * it * it * t * (x1 + dx) + 3 * it * t * t * (x2 - dx) + t * t * t * x2;
        const y = it * it * it * y1 + 3 * it * it * t * y1 + 3 * it * t * t * y2 + t * t * t * y2;
        lab.push({ x, y, text: i === 0 ? 'true' : 'else' });
      }
    });
    setEdges(out);
    setLabels(lab);
  }, []);

  // scale + layout mode, then measure edges
  useIsoLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => {
      const desktop = window.innerWidth > 1100;
      const s = desktop ? clamp(Math.min(window.innerWidth, 1640) / 1440, 0.74, 1.14) : Math.min(1, wrap.clientWidth / CARD_W);
      wrap.style.setProperty('--s', s.toFixed(4));
      wrap.dataset.mode = desktop ? 'tilt' : 'flat';
      measure();
    };
    fit();
    window.addEventListener('resize', fit);
    document.fonts?.ready.then(fit);
    return () => window.removeEventListener('resize', fit);
  }, [measure]);

  // gentle tilt towards the mouse
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const loop = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      card.style.setProperty('--mx', x.toFixed(4));
      card.style.setProperty('--my', y.toFixed(4));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(loop) : 0;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // a new run lands every few seconds while the card is on screen
  useEffect(() => {
    const card = cardRef.current;
    if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(card);
    let clock = Date.UTC(2026, 0, 6, 9, 41, 2);
    let n = 0;
    const id = window.setInterval(() => {
      if (!visible || document.hidden) return;
      clock += (40 + Math.round(Math.random() * 120)) * 1000;
      const d = new Date(clock);
      const pad = (v: number) => String(v).padStart(2, '0');
      n += 1;
      setRuns((prev) =>
        [
          {
            id: 10 + n,
            time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
            name: NAMES[n % NAMES.length],
            took: TOOK[n % TOOK.length],
          },
          ...prev,
        ].slice(0, 3),
      );
    }, 3800);
    return () => {
      window.clearInterval(id);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className={styles.wrap} data-mode="tilt">
      <div className={styles.stage}>
        <div ref={cardRef} className={styles.card} role="img" aria-label="Example workflow: refunds over 5000, three steps and one branch, currently running">
          <div className={styles.head}>
            <span className={styles.name}>Refunds over 5000</span>
            <span className={styles.sep} />
            <span className={styles.meta}>3 steps / 1 branch</span>
            <span className={styles.state}>running</span>
          </div>

          <div ref={canvasRef} className={styles.canvas}>
            <div className={styles.tools} aria-hidden="true">
              <span className={styles.toolOn}>
                <IconPointer />
              </span>
              <span>
                <IconPlus />
              </span>
              <span>
                <IconRedo />
              </span>
              <span>
                <IconBranch />
              </span>
            </div>
            <span className={styles.zoom}>100%</span>

            <svg className={styles.edges} aria-hidden="true">
              {edges.map((e, i) => (
                <g key={i}>
                  <path className={e.lit ? styles.edgeLit : styles.edge} d={e.d} />
                  <path className={styles.pulse} d={e.d} pathLength={100} style={{ animationDelay: `${e.delay}s` }} />
                  <circle className={styles.port} cx={e.a[0]} cy={e.a[1]} r={3.2} />
                  <circle className={styles.port} cx={e.b[0]} cy={e.b[1]} r={3.2} />
                </g>
              ))}
            </svg>
            {labels.map((l) => (
              <span key={l.text} className={styles.label} style={{ left: l.x, top: l.y }}>
                {l.text}
              </span>
            ))}

            <div className={`${styles.node} ${styles.start}`} data-node="start" data-intro-target>
              <b>Refund created</b>
              <small>stripe</small>
            </div>
            <div className={`${styles.node} ${styles.cond}`} data-node="cond">
              <b>Amount over 5000</b>
              <small>condition</small>
            </div>
            <div className={`${styles.node} ${styles.log}`} data-node="log">
              <b>Log to warehouse</b>
              <small>postgres</small>
            </div>
            <div className={`${styles.node} ${styles.ask}`} data-node="ask">
              <b>Ask finance</b>
              <small>waiting on a yes</small>
            </div>
            <span className={styles.wait}>
              <i />
              26 min
            </span>
          </div>

          <div className={styles.runs}>
            <span className={styles.runsLabel}>last runs</span>
            <ol>
              {runs.map((r, i) => (
                <li key={r.id} className={i === 0 && r.id > 3 ? styles.fresh : undefined}>
                  <i className={i === 0 ? styles.dotOn : undefined} />
                  <time>{r.time}</time>
                  <span>{r.name}</span>
                  <em>{r.took}</em>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <span className={`${styles.mark} ${styles.markL}`} aria-hidden="true" />
        <span className={`${styles.mark} ${styles.markR}`} aria-hidden="true" />
      </div>
    </div>
  );
}
