import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, BookOpen, CalendarDays, ChartNoAxesColumn, Check, Layers, Menu, MessagesSquare, Music, Sparkles, X } from "lucide-react";
import { useLocale } from "@/src/contexts/LocaleContext";
import { getAuthCopy } from "@/src/features/auth/authCopy";
import type { AuthMode } from "@/src/features/auth/AuthDialog";
import { DeferredAuthDialog } from "@/src/features/auth/DeferredAuthDialog";
import { LandingStudents } from "@/src/features/landing/LandingStudents";
import { getPublicLandingCopy, landingFeatureRoutes } from "@/src/features/landing/landingContent";
import "./Landing.css";

const featureIcons = [CalendarDays, Layers, Music, ChartNoAxesColumn, Sparkles, BookOpen];
const benefitIcons = [CalendarDays, Layers, MessagesSquare];

export const Landing = () => {
  const {locale, setLocale} = useLocale();
  const copy = getPublicLandingCopy(locale);
  const auth = getAuthCopy(locale);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  const tracks = ["IELTS", "SAT", "HSK", "CEFR", copy.school, copy.university];

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const desktop = matchMedia("(min-width: 900px)");
    const resize = () => { if (desktop.matches) setMenuOpen(false); };
    menu.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    desktop.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
      desktop.removeEventListener("change", resize);
    };
  }, [menuOpen]);

  const openAuth = (mode: AuthMode) => {
    setMenuOpen(false);
    setAuthMode(mode);
  };
  const openFeature = (route: typeof landingFeatureRoutes[number]) => {
    window.location.hash = `/${route}`;
    openAuth("signup");
  };
  const goToSection = () => setMenuOpen(false);
  const followAnchor = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;
    const destination = document.getElementById(link.hash.slice(1));
    if (!destination) return;
    event.preventDefault();
    history.replaceState(null, "", link.hash);
    destination.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
    // An in-page link should transfer keyboard focus out of a closing mobile menu.
    destination.setAttribute("tabindex", "-1");
    destination.focus({preventScroll: true});
  };

  return (
    <div className="noviq-landing" id="landing-home" lang={locale} onClick={followAnchor}>
      <a className="nl-skip" href="#landing-main">{copy.skip}</a>
      <header ref={header} className="nl-header">
        <a className="nl-brand" href="#landing-home" aria-label="NOVIQ"><img src="/noviq-logo.jpeg" alt="" width="40" height="40"/><span>NOVIQ</span></a>
        <nav className="nl-desktop-nav" aria-label={copy.menu}>
          <a className="nl-home-link" href="#landing-home">{copy.home}</a>
          <a href="#study-tools">{copy.features}</a>
          <a href="#exam-tracks">{copy.tracks}</a>
        </nav>
        <label className="nl-language"><span className="nl-sr-only">{copy.language}</span>
          <select value={locale} onChange={event => {
            const value = event.target.value;
            if (value === "en" || value === "uz" || value === "ru") setLocale(value);
          }}><option value="en" lang="en">English</option><option value="uz" lang="uz">O‘zbekcha</option><option value="ru" lang="ru">Русский</option></select>
        </label>
        <div className="nl-header-actions">
          <button type="button" className="nl-signin" onClick={() => openAuth("login")}>{auth.signIn}</button>
          <button type="button" className="nl-primary" onClick={() => openAuth("signup")}>{copy.start}<ArrowRight size={17} aria-hidden="true"/></button>
        </div>
        <button ref={menuButton} type="button" className="nl-menu-button" aria-label={menuOpen ? copy.closeMenu : copy.menu} aria-expanded={menuOpen} aria-controls="landing-menu" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={22} aria-hidden="true"/> : <Menu size={22} aria-hidden="true"/>}</button>
        {menuOpen && <nav ref={menu} id="landing-menu" className="nl-mobile-nav" aria-label={copy.menu}>
          <a href="#landing-home" onClick={goToSection}>{copy.home}</a>
          <a href="#study-tools" onClick={goToSection}>{copy.features}</a>
          <a href="#exam-tracks" onClick={goToSection}>{copy.tracks}</a>
          <button type="button" onClick={() => openAuth("login")}>{auth.signIn}</button>
          <button type="button" className="nl-primary" onClick={() => openAuth("signup")}>{copy.start}</button>
        </nav>}
      </header>
      <main id="landing-main">
        <section className="nl-hero nl-container" aria-labelledby="landing-title">
          <div className="nl-hero-copy">
            <p className="nl-eyebrow"><Sparkles size={14} aria-hidden="true"/>{copy.eyebrow}</p>
            <h1 id="landing-title">{copy.headline.map(line => <span key={line}>{line}</span>)}</h1>
            <p className="nl-description">{copy.description}</p>
            <div className="nl-actions">
              <button type="button" className="nl-primary" onClick={() => openAuth("signup")}>{copy.start}<ArrowRight size={20} aria-hidden="true"/></button>
              <a className="nl-secondary" href="#study-tools">{copy.explore}<ArrowRight size={18} aria-hidden="true"/></a>
            </div>
            <div id="exam-tracks" className="nl-track-chips" aria-label={copy.tracks}>{tracks.map(track => <span key={track}>{track}</span>)}</div>
          </div>
            <LandingStudents labels={copy.visualLabels} tutorLabel={copy.benefits[2][0]} alt={copy.brainAlt}/>
        </section>
        <section className="nl-benefits nl-container" aria-label={copy.features}>
          {copy.benefits.map(([title, description], index) => {
            const Icon = benefitIcons[index];
            return <article key={title}><div className="nl-icon-shell"><Icon size={28} aria-hidden="true"/></div><div><h2>{title}</h2><p>{description}</p></div></article>;
          })}
        </section>
        <section className="nl-showcase nl-container" aria-labelledby="showcase-title">
          <div className="nl-showcase-copy">
            <p className="nl-eyebrow"><Sparkles size={14} aria-hidden="true"/>{copy.showcaseEyebrow}</p>
            <h2 id="showcase-title">{copy.showcaseTitle.map(line => <span key={line}>{line}</span>)}</h2>
            <p>{copy.showcaseDescription}</p>
            <a className="nl-primary" href="#study-tools">{copy.explore}<ArrowRight size={18} aria-hidden="true"/></a>
            <ul className="nl-checklist">{copy.showcasePoints.map(point => <li key={point}><Check size={13} aria-hidden="true"/>{point}</li>)}</ul>
          </div>
          <figure className="nl-device-showcase">
            <div className="nl-laptop"><img src="/landing/dashboard-empty-desktop.webp" srcSet="/landing/dashboard-empty-desktop-small.webp 720w, /landing/dashboard-empty-desktop.webp 1440w" sizes="(max-width: 599px) calc(100vw - 70px), (max-width: 899px) 50vw, 680px" alt={copy.screenshotAlt} width="1440" height="960" loading="lazy" decoding="async"/></div>
            <div className="nl-phone"><img src="/landing/dashboard-empty-mobile.webp" srcSet="/landing/dashboard-empty-mobile-small.webp 195w, /landing/dashboard-empty-mobile.webp 390w" sizes="(max-width: 599px) 24vw, 160px" alt={copy.mobileAlt} width="390" height="844" loading="lazy" decoding="async"/></div>
            <figcaption>{copy.screenshotCaption}</figcaption>
          </figure>
        </section>
        <section id="study-tools" className="nl-tools nl-container" aria-labelledby="features-title">
          <div className="nl-section-heading"><div><p className="nl-eyebrow"><Sparkles size={14} aria-hidden="true"/>{copy.featureEyebrow}</p><h2 id="features-title">{copy.featureTitle}</h2></div><p>{copy.featureDescription}</p></div>
          <div className="nl-tool-grid">{copy.featureCards.map(([title, description], index) => {
            const Icon = featureIcons[index];
            return <button type="button" key={title} className="nl-feature-card" onClick={() => openFeature(landingFeatureRoutes[index])}>
              <span className="nl-icon-shell"><Icon size={26} aria-hidden="true"/></span>
              <span className="nl-feature-text"><span className="nl-feature-title" id={`landing-feature-title-${index}`}>{title}</span><span className="nl-feature-description" id={`landing-feature-description-${index}`}>{description}</span></span>
              <ArrowRight className="nl-feature-arrow" size={18} aria-hidden="true"/>
            </button>;
          })}</div>
        </section>
        <section className="nl-ending nl-container" aria-labelledby="landing-cta-title">
          <div className="nl-ending-art" aria-hidden="true"><BookOpen size={64}/></div>
          <div><p className="nl-eyebrow">{copy.ctaEyebrow}</p><h2 id="landing-cta-title">{copy.ctaTitle}</h2><p>{copy.ctaDescription}</p></div>
          <div className="nl-ending-action"><button type="button" className="nl-primary" onClick={() => openAuth("signup")}>{copy.start}<ArrowRight size={20} aria-hidden="true"/></button><p>{copy.ctaNote}</p></div>
        </section>
      </main>
      <footer className="nl-footer nl-container">
        <div className="nl-footer-top"><a className="nl-brand" href="#landing-home"><img src="/noviq-logo.jpeg" alt="" width="32" height="32"/><span>NOVIQ</span></a><nav aria-label={copy.features}><a href="#landing-home">{copy.home}</a><a href="#study-tools">{copy.features}</a><a href="#exam-tracks">{copy.tracks}</a><button type="button" onClick={() => openAuth("login")}>{auth.signIn}</button></nav></div>
        <div className="nl-footer-bottom"><p>© {new Date().getFullYear()} NOVIQ. {copy.footer}</p><span>{copy.copyright}</span></div>
      </footer>
      {authMode && <DeferredAuthDialog mode={authMode} onClose={() => setAuthMode(null)} onModeChange={setAuthMode}/>}
    </div>
  );
};
