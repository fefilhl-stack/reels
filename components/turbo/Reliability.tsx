import type { CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import Typewriter from '../ui/Typewriter';
import Hub from '../sections/Hub';
import Regions from '../sections/Regions';
import { HUB, REGIONS } from './content';
import styles from '../sections/Reliability.module.css';

export default function Reliability() {
  return (
    <section id="how" className={`section ${styles.reliability}`} data-scene="edge">
      <div className="container">
        <SectionHead
          eyebrow="надёжность"
          title={
            <>
              <em>Скучно</em> там, где это важно.
            </>
          }
          aside="Импортонезависимость, безопасность, масштабирование. То, что не показывают на демо, но что решает судьбу проекта."
        />

        <div className={styles.grid}>
          <article className={`card ${styles.card}`} data-reveal>
            <h3>Одно ядро для всех контуров</h3>
            <p>ERP, EAM и CPM на одной платформе: финансы, склад, ремонты и бюджет работают с одними и теми же данными.</p>
            <p className="card-label">
              <Typewriter text="одна платформа, все решения" />
            </p>
            <Hub apps={HUB} mark="turbo" />
            <p className={`card-label ${styles.foot}`}>
              <Typewriter text="права доступа, аудит, rpa, отчёты" delay={0.6} />
            </p>
          </article>

          <article className={`card ${styles.card}`} data-reveal style={{ '--d': '0.1s' } as CSSProperties}>
            <h3>Работает в вашем контуре</h3>
            <p>Свой ЦОД, российское облако или гибрид. Данные остаются там, где вы решили, а защиту приложений усиливает партнёрство с «Лабораторией Касперского».</p>
            <Regions content={REGIONS} />
          </article>
        </div>
      </div>
    </section>
  );
}
