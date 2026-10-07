import type { CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import { WeekCard, RingCard, PeopleCard, WavesCard } from './DailyCards';
import { landDots, project, MAP } from '@/lib/world';
import styles from './Daily.module.css';

const DOTS = landDots(4);
const PLACES = [
  { name: 'Frankfurt', at: project(8.7, 50.1), hot: true },
  { name: 'Virginia', at: project(-77.5, 38), hot: false },
  { name: 'Sydney', at: project(151.2, -33.9), hot: false },
];

function WorldCard() {
  return (
    <article className={`card ${styles.card}`} data-reveal style={{ '--d': '0.16s' } as CSSProperties}>
      <p className="card-label">where it ran</p>
      <svg className={styles.map} viewBox={`0 0 ${MAP.width} ${MAP.height}`} role="img" aria-label="Runs stay in Frankfurt, Virginia and Sydney">
        {DOTS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.05} className={styles.land} />
        ))}
        {PLACES.map((p) => (
          <g key={p.name} transform={`translate(${p.at[0]} ${p.at[1]})`}>
            {p.hot && <circle r={9} className={styles.ping} />}
            <circle r={p.hot ? 3.4 : 2.2} className={p.hot ? styles.hot : styles.place} />
          </g>
        ))}
      </svg>
      <p className={styles.caption}>Every run stays in the region that started it</p>
    </article>
  );
}

export default function Daily() {
  return (
    <section id="daily" className={`section ${styles.daily}`} data-scene="dusk">
      <div className="container">
        <SectionHead
          eyebrow="daily view"
          title={
            <>
              A <em>Tuesday</em>, seen from Relay.
            </>
          }
          aside="The screen people actually keep open: what ran, what is queued, and who still owes an answer."
        />
        <div className={styles.top}>
          <WeekCard />
          <RingCard />
        </div>
        <div className={styles.bottom}>
          <PeopleCard />
          <WavesCard />
          <WorldCard />
        </div>
      </div>
    </section>
  );
}
