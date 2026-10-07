import { MARKS, type MarkName } from '../ui/Icons';
import styles from './Hub.module.css';

// positions in a 640 × 300 box; the core sits at (320, 170)
const CORE = { x: 320, y: 170 };
const SPOTS = [
  { x: 200, y: 92, curve: true },
  { x: 440, y: 92, curve: true },
  { x: 120, y: 170, curve: false },
  { x: 520, y: 170, curve: false },
];
const RELAY: [string, string][] = [
  ['ST', 'stripe'],
  ['PG', 'postgres'],
  ['SL', 'slack'],
  ['HS', 'hubspot'],
];

const path = (n: (typeof SPOTS)[number]) =>
  n.curve
    ? `M${n.x} ${n.y} Q${(n.x + CORE.x) / 2} ${n.y + 52} ${CORE.x} ${CORE.y}`
    : `M${n.x} ${n.y} L${CORE.x} ${CORE.y}`;

/** One runtime in the middle, apps around it; lime packets travel the lines. */
export default function Hub({ apps = RELAY, mark = 'relay' }: { apps?: [code: string, name: string][]; mark?: MarkName }) {
  const NODES = SPOTS.map((spot, i) => ({ ...spot, code: apps[i][0], name: apps[i][1] }));
  const Core = MARKS[mark];
  return (
    <div className={styles.hub}>
      <svg className={styles.svg} viewBox="0 0 640 300" aria-hidden="true">
        <defs>
          <radialGradient id="hubGlow">
            <stop offset="0" stopColor="rgba(192,243,73,0.28)" />
            <stop offset="1" stopColor="rgba(192,243,73,0)" />
          </radialGradient>
        </defs>
        <circle cx={CORE.x} cy={CORE.y} r="150" fill="url(#hubGlow)" />
        <circle className={styles.ring} cx={CORE.x} cy={CORE.y} r="78" />
        <circle className={styles.ring} cx={CORE.x} cy={CORE.y} r="122" />
        {NODES.map((n, i) => (
          <g key={n.code}>
            <path id={`hub-${i}`} className={n.curve ? styles.dotted : styles.line} d={path(n)} />
            <circle r="3.6" className={styles.packet}>
              <animateMotion dur="2.4s" begin={`${i * 0.6}s`} repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear">
                <mpath href={`#hub-${i}`} />
              </animateMotion>
            </circle>
          </g>
        ))}
      </svg>

      {NODES.map((n, i) => (
        <span
          key={n.code}
          className={styles.node}
          style={{ left: `${(n.x / 640) * 100}%`, top: `${(n.y / 300) * 100}%`, animationDelay: `${i * 0.6}s` }}
        >
          <b>{n.code}</b>
          <small>{n.name}</small>
        </span>
      ))}

      <span className={styles.core} style={{ left: `${(CORE.x / 640) * 100}%`, top: `${(CORE.y / 300) * 100}%` }} aria-hidden="true">
        <Core tone="onLime" />
      </span>
    </div>
  );
}
