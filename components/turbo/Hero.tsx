import type { CSSProperties } from 'react';
import Typewriter from '../ui/Typewriter';
import FlowCard from '../sections/FlowCard';
import { IconPlay } from '../ui/Icons';
import { FLOW, YOUTUBE } from './content';
import styles from '../sections/Hero.module.css';

const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

export default function Hero() {
  return (
    <section id="top" className={styles.hero} data-scene="hero">
      <div className={styles.dots} aria-hidden="true" />
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <p className={`mono ${styles.tag}`}>
            <i aria-hidden="true" />
            <Typewriter text="российская платформа для бизнеса" speed={30} delay={0.15} />
          </p>
          <h1 className={styles.title} data-reveal style={d(0.05)}>
            <span>Бизнес-системы</span>
            <em>без тормозов.</em>
          </h1>
          <p className={styles.lead} data-reveal style={d(0.16)}>
            Российская платформа ТУРБО X и готовые решения на ней для высоконагруженных систем и критичных процессов.
          </p>
          <div className={styles.actions} data-reveal style={d(0.26)}>
            <a className="btn btn-lime" href="#demo">
              Запросить демо
            </a>
            <a className="btn btn-dark" href={YOUTUBE} target="_blank" rel="noopener noreferrer">
              <IconPlay />
              Видео о платформе
            </a>
          </div>
          <p className={`mono ${styles.note}`}>
            <Typewriter text="с 1991 года / 1000+ клиентов / реестр российского ПО" speed={28} delay={0.7} />
          </p>
        </div>
      </div>
      <FlowCard content={FLOW} />
      <span className={styles.cross} aria-hidden="true" />
    </section>
  );
}
