import Intro from '@/components/Intro';
import Ribbons from '@/components/Ribbons';
import FrostLayer from '@/components/FrostLayer';
import Cursor from '@/components/Cursor';
import SmoothScroll from '@/components/SmoothScroll';
import RevealObserver from '@/components/RevealObserver';
import Header from '@/components/Header';
import Apps from '@/components/sections/Apps';
import Manifesto from '@/components/sections/Manifesto';
import Hero from '@/components/turbo/Hero';
import Platform from '@/components/turbo/Platform';
import Reliability from '@/components/turbo/Reliability';
import Daily from '@/components/turbo/Daily';
import Clients from '@/components/turbo/Clients';
import Services from '@/components/turbo/Services';
import Demo from '@/components/turbo/Demo';
import Footer from '@/components/turbo/Footer';
import { HEADER, MANIFESTO, PRODUCTS } from '@/components/turbo/content';
import styles from '../../page.module.css';

/** Главная для ТУРБО на том же движке, что и Relay: фон-река, заставка, стекло. */
export default function TurboPage() {
  return (
    <>
      <a className="skip-link" href="#main">
        К содержанию
      </a>
      <Intro mark="turbo" />
      <Ribbons />
      <FrostLayer />
      <Cursor />
      <SmoothScroll />
      <RevealObserver />
      <Header content={HEADER} />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Apps apps={PRODUCTS} label="ERP, EAM и CPM на одной платформе, плюс десятки приложений партнёров" aria="Решения ТУРБО" />
        {/* секции поверх размытой «реки» */}
        <div className={styles.frost} data-frost>
          <Platform />
          <Manifesto content={MANIFESTO} />
          <Reliability />
          <Daily />
          <Clients />
        </div>
        <Services />
        <Demo />
      </main>
      <Footer />
    </>
  );
}
