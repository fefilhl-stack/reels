import Intro from '@/components/Intro';
import Ribbons from '@/components/Ribbons';
import FrostLayer from '@/components/FrostLayer';
import Cursor from '@/components/Cursor';
import SmoothScroll from '@/components/SmoothScroll';
import RevealObserver from '@/components/RevealObserver';
import Header from '@/components/Header';
import Hero from '@/components/sections/Hero';
import Apps from '@/components/sections/Apps';
import Glue from '@/components/sections/Glue';
import Manifesto from '@/components/sections/Manifesto';
import Reliability from '@/components/sections/Reliability';
import Daily from '@/components/sections/Daily';
import Cases from '@/components/sections/Cases';
import Pricing from '@/components/sections/Pricing';
import FinalCta from '@/components/sections/FinalCta';
import Footer from '@/components/sections/Footer';
import styles from './page.module.css';

export default function Page() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Intro />
      <Ribbons />
      <FrostLayer />
      <Cursor />
      <SmoothScroll />
      <RevealObserver />
      <Header />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Apps />
        {/* sections over the frosted, out-of-focus ribbons */}
        <div className={styles.frost} data-frost>
          <Glue />
          <Manifesto />
          <Reliability />
          <Daily />
          <Cases />
        </div>
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
