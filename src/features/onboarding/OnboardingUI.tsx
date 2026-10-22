import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { Target, ChartNoAxesColumnIncreasing, CalendarDays, Sparkles, Check, ArrowLeft, ArrowRight, Loader2, type LucideIcon } from 'lucide-react';
import type { getOnboardingDesignCopy } from './onboardingConfig';
import './onboarding.css';
type Copy = ReturnType<typeof getOnboardingDesignCopy>;
const features = [Target, ChartNoAxesColumnIncreasing, CalendarDays];
const floatingAssets = [['robot', 'robot.png'], ['cap', 'graduation-cap.png'], ['book', 'book-icon.png'], ['chart', 'chart-icon.png'], ['orb', 'blue-orb.png'], ['planet', 'planet.png']];

export function OnboardingHero({ copy }: { copy: Copy }) {
  return <section className="ob-hero" aria-labelledby="ob-title">
    <div className="ob-brand"><img src="/noviq-logo.jpeg" alt="" width="44" height="44" /><span>NOVIQ</span></div>
    <div className="ob-hero-copy">
      <p className="ob-badge"><Sparkles size={13} aria-hidden="true" />{copy.badge}</p>
      <h1 id="ob-title">{copy.headline}<br /><span>{copy.headlineEnd}</span></h1>
      <p className="ob-hero-description">{copy.description}</p>
      <ul className="ob-highlights">{copy.features.map(([title, description], i) => {
        const Icon = features[i];
        return <li key={i}><Icon size={25} strokeWidth={2.2} aria-hidden="true" /><div><strong>{title}</strong><span>{description}</span></div></li>;
      })}</ul>
    </div>
    <div className="ob-illustration" aria-hidden="true">
      <img className="ob-orbit" src="/onboarding/glowing-orbit.png" alt="" />
      <img className="ob-student" src="/onboarding/student-main.png" alt="" fetchPriority="high" width="550" height="611" />
      {floatingAssets.map(([name, src]) => <img key={name} className={`ob-float ob-float-${name}`} src={`/onboarding/${src}`} alt="" />)}
    </div>
  </section>;
}

export function OnboardingLayout({ children, copy }: { children: ReactNode; copy: Copy }) {
  const [desktop, setDesktop] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const media = window.matchMedia('(min-width: 901px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!video.current || !desktop || !videoReady) return;
    video.current.playbackRate = 0.75;
    if (reduceMotion) video.current.pause();
    else void video.current.play().catch(() => { /* Keep the loaded first frame when autoplay is unavailable. */ });
  }, [desktop, videoReady, reduceMotion]);
  const showVideo = desktop && videoReady && !videoFailed;
  return <main className={`noviq-onboarding${showVideo ? ' ob-has-video' : ''}`}>
    <div className="ob-background" aria-hidden="true">
      <img className="ob-liquid-scene" src="/onboarding/liquid-scene.png" alt="" fetchPriority="high" width="1536" height="1024" />
      {desktop && !videoFailed && <div className="ob-video-plane">
        <video ref={video} className="ob-background-video" src="/onboarding/study-background-loop-4k.mp4" width="3840" height="2160" muted loop playsInline autoPlay={!reduceMotion} preload="auto" tabIndex={-1} disablePictureInPicture onLoadedData={(event) => { event.currentTarget.playbackRate = 0.75; setVideoReady(true); }} onError={() => { setVideoFailed(true); setVideoReady(false); }} />
        <div className="ob-video-copy-mask" />
      </div>}
    </div>
    <div className="ob-composition"><OnboardingHero copy={copy} /><section className="ob-card" aria-label="NOVIQ onboarding">{children}</section></div>
  </main>;
}

export function OnboardingStepper({ step, labels }: { step: number; labels: string[] }) {
  return <nav className="ob-stepper" aria-label="Setup progress"><ol>
    {labels.map((label, index) => <li key={index} aria-current={step === index ? 'step' : undefined} className={index <= step ? 'ob-step-reached' : ''}>
      <span className="ob-step-number">{index < step ? <Check size={15} aria-hidden="true" /> : index + 1}</span><span>{label}</span>
    </li>)}
  </ol><div className="ob-progress" aria-hidden="true"><span style={{ width: `${((step + 1) / labels.length) * 100}%` }} /></div></nav>;
}

export function OnboardingOptionCard({ value, label, description, selected, disabled, name, index, icon: Icon, onSelect }: {
  value: string; label: string; description: string; selected: boolean; disabled: boolean; name: string; index: number; icon: LucideIcon; onSelect: (value: string) => void;
}) {
  return <label className={`ob-option ob-tone-${index} ${selected ? 'ob-option-selected' : ''} ${disabled ? 'ob-option-disabled' : ''}`}>
    <input type="radio" name={name} value={value} checked={selected} disabled={disabled} onChange={() => onSelect(value)} />
    <span className="ob-option-icon" aria-hidden="true"><Icon size={26} strokeWidth={2} /></span>
    <span className="ob-option-copy"><strong>{label}</strong><span>{description}</span></span>
    <span className="ob-radio-mark" aria-hidden="true">{selected && <Check size={11} strokeWidth={3} />}</span>
  </label>;
}

export function OnboardingActions({ step, canContinue, saving, onBack, copy }: {
  step: number; canContinue: boolean; saving: boolean; onBack: () => void; copy: Copy;
}) {
  return <div className="ob-actions">
    <button type="button" className="ob-back" disabled={step === 0 || saving} onClick={onBack}><ArrowLeft size={17} aria-hidden="true" />{copy.back}</button>
    <button type="submit" className="ob-continue" disabled={!canContinue || saving}>
      {saving ? <><Loader2 size={17} className="ob-spinner" aria-hidden="true" />{copy.saving}</> : <>{step === 2 ? copy.finish : copy.next}<ArrowRight size={18} aria-hidden="true" /></>}
    </button>
  </div>;
}
