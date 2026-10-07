import type { CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import { WeekCard, RingCard, PeopleCard, WavesCard } from '../sections/DailyCards';
import { landDots, project, MAP } from '@/lib/world';
import { DAILY } from './content';
import styles from '../sections/Daily.module.css';

const DOTS = landDots(4);
const PLACES = [
  { name: 'Москва', at: project(37.6, 55.75), hot: true },
  { name: 'Санкт-Петербург', at: project(30.3, 59.9), hot: false },
  { name: 'Екатеринбург', at: project(60.6, 56.8), hot: false },
  { name: 'Новосибирск', at: project(82.9, 55.0), hot: false },
  { name: 'Владивосток', at: project(131.9, 43.1), hot: false },
];

function MapCard() {
  return (
    <article className={`card ${styles.card}`} data-reveal style={{ '--d': '0.16s' } as CSSProperties}>
      <p className="card-label">где работают</p>
      <svg className={styles.map} viewBox={`0 0 ${MAP.width} ${MAP.height}`} role="img" aria-label="Клиенты и партнёры ТУРБО от Санкт-Петербурга до Владивостока">
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
      <p className={styles.caption}>Партнёры ТУРБО поддерживают клиентов по всей России</p>
    </article>
  );
}

export default function Daily() {
  return (
    <section id="daily" className={`section ${styles.daily}`} data-scene="dusk">
      <div className="container">
        <SectionHead
          eyebrow="рабочий день"
          title={
            <>
              <em>Вторник</em> глазами ТУРБО.
            </>
          }
          aside="Экран, который держат открытым: что посчитано, что стоит в очереди и кто ещё должен ответ."
        />
        <div className={styles.top}>
          <WeekCard c={DAILY.week} />
          <RingCard c={DAILY.ring} />
        </div>
        <div className={styles.bottom}>
          <PeopleCard c={DAILY.people} />
          <WavesCard c={DAILY.waves} />
          <MapCard />
        </div>
      </div>
    </section>
  );
}
