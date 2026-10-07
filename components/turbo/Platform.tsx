import type { CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import RollingNumber from '../ui/RollingNumber';
import RunTimeline from '../sections/RunTimeline';
import SlackCard from '../sections/SlackCard';
import IsoBarsCard from '../sections/IsoBarsCard';
import { APPROVAL, BARS, TIMELINE } from './content';
import styles from '../sections/Glue.module.css';

const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

const FEATURES = [
  {
    num: '01',
    title: 'Процесс от события до проводки',
    text: ['Платформа сама ведёт шаги, считает и проверяет.', 'Рутину забирают роботы RPA, людям остаются решения.'],
    visual: <RunTimeline content={TIMELINE} />,
  },
  {
    num: '02',
    title: 'Согласования там, где работают люди',
    text: ['Запрос приходит в рабочий чат: да, нет, едем дальше.', 'Никому не нужно учить ещё один интерфейс.'],
    visual: <SlackCard content={APPROVAL} />,
    flip: true,
  },
  {
    num: '03',
    title: 'Отчёты без программиста',
    text: ['Параметрический генератор отчётов и графиков.', 'Доступ разграничен на нескольких уровнях.'],
    visual: <IsoBarsCard content={BARS} />,
  },
];

export default function Platform() {
  return (
    <section id="platform" className={`section ${styles.glue}`} data-scene="sweep">
      <div className="container">
        <SectionHead
          eyebrow="платформа турбо x"
          title={
            <>
              Скорость — это <em>архитектура.</em>
            </>
          }
          aside="ТУРБО X — полностью российская платформа для высоконагруженных многопользовательских систем. На ней работают готовые решения ТУРБО и десятки приложений партнёров."
        />

        <div className={styles.features}>
          {FEATURES.map((f) => (
            <article key={f.num} className={`${styles.feature} ${f.flip ? styles.flip : ''}`}>
              <div className={styles.copy}>
                <RollingNumber value={f.num} className={styles.num} />
                <h3 data-reveal="wipe">{f.title}</h3>
                <p data-reveal style={d(0.12)}>
                  {f.text[0]}{' '}
                  <br />
                  {f.text[1]}
                </p>
              </div>
              <div className={styles.visual} data-reveal style={d(0.06)}>
                {f.visual}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
