import { useEffect, useRef, useState } from "react";
import { BookOpen, ChartNoAxesColumn, Layers, Pause, Play } from "lucide-react";

type Props = { labels: string[]; pauseLabel: string; playLabel: string; alt: string };
export function LandingBrain({labels, pauseLabel, playLabel, alt}: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const running = allowed && visible && pageVisible && !paused && !failed;

  useEffect(() => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const reducedData = matchMedia("(prefers-reduced-data: reduce)");
    const connection = (navigator as Navigator & {connection?: EventTarget & {saveData?: boolean}}).connection;
    const update = () => {
      const next = !reducedMotion.matches && !reducedData.matches && !connection?.saveData;
      setAllowed(next);
      if (!next) setReady(false);
    };
    const visibility = () => setPageVisible(!document.hidden);
    update(); visibility();
    reducedMotion.addEventListener("change", update);
    reducedData.addEventListener("change", update);
    connection?.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {threshold: 0.1});
    if (stage.current) observer.observe(stage.current);
    return () => {
      reducedMotion.removeEventListener("change", update);
      reducedData.removeEventListener("change", update);
      connection?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    if (running) element.play().catch(() => { if (active) setPaused(true); });
    else element.pause();
    return () => { active = false; element.pause(); };
  }, [running]);

  return (
    <div ref={stage} className="nl-brain-stage" data-running={running}>
      <div className="nl-brain-panels" aria-hidden="true"><span/><span/><span/></div>
      <div className="nl-brain-orbits" aria-hidden="true"><span/><span/></div>
      <div className="nl-brain-media">
        <img src="/noviq-brain-poster.webp" alt={alt} width="640" height="360" fetchPriority="high" className={ready && allowed && !failed ? "nl-poster-hidden" : undefined}/>
        {allowed && !failed && <video ref={video} src="/noviq-brain-loop.mp4" poster="/noviq-brain-poster.webp" muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1} onLoadedData={() => setReady(true)} onError={() => setFailed(true)}/>}
      </div>
      <div className="nl-brain-pedestal" aria-hidden="true"><span/><span/></div>
      <div className="nl-float nl-float-plan" aria-hidden="true"><ChartNoAxesColumn size={24}/><span>{labels[0]}</span><div className="nl-mini-bars"><i/><i/><i/><i/></div></div>
      <div className="nl-float nl-float-book" aria-hidden="true"><BookOpen size={30}/><span>{labels[1]}</span></div>
      <div className="nl-float nl-float-deck" aria-hidden="true"><Layers size={28}/><span>{labels[2]}</span></div>
      {allowed && !failed && <button type="button" className="nl-motion" aria-label={paused ? playLabel : pauseLabel} aria-pressed={!paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={16} aria-hidden="true"/> : <Pause size={16} aria-hidden="true"/>}</button>}
    </div>
  );
}
