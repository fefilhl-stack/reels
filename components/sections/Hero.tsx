import type { CSSProperties } from 'react';
import Typewriter from '../ui/Typewriter';
import FlowCard from './FlowCard';
import { IconPlay } from '../ui/Icons';
import styles from './Hero.module.css';

const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

export default function Hero() {
  return (
    <section id="top" className={styles.hero} data-scene="hero">
      <div className={styles.dots} aria-hidden="true" />
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <p className={`mono ${styles.tag}`}>
            <i aria-hidden="true" />
            <Typewriter text="open beta / 240 apps connected" speed={34} delay={0.15} />
          </p>
          <h1 className={styles.title} data-reveal style={d(0.05)}>
            <span>The handoffs run</span>
            <em>themselves.</em>
          </h1>
          <p className={styles.lead} data-reveal style={d(0.16)}>
            Relay runs the steps between your apps and only pings a person when it matters.
          </p>
          <div className={styles.actions} data-reveal style={d(0.26)}>
            <a className="btn btn-lime" href="#start">
              Start free
            </a>
            <a className="btn btn-dark" href="#product">
              <IconPlay />
              Watch a build, 2 minutes
            </a>
          </div>
          <p className={`mono ${styles.note}`}>
            <Typewriter text="free for 14 days / no card / no call with sales" speed={30} delay={0.7} />
          </p>
        </div>
      </div>
      <FlowCard />
      <span className={styles.cross} aria-hidden="true" />
    </section>
  );
}
