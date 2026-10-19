import React from 'react';
import { ArrowUpRight, BookOpen, CheckCheck, Clock3, Sparkles, Timer } from 'lucide-react';
import { useLocale } from '@/src/contexts/LocaleContext';
import { useProCopy } from './proCopy';
import { actualDuration } from './activitySummary';

interface Props {
  active: number; completed: number; progressCompleted: number; minutes: number; due: number;
  days: { day: string; minutes: number }[];
  nextTitle: string; nextTime?: string; busy: boolean;
  onBriefing: () => void; briefingAllowed: boolean;
  dataStatus?: 'ready' | 'loading' | 'unavailable';
}

/** Summary reads the same evidence as the existing hub; it never writes study records. */
export function ReferenceOverview(p: Props) {
  const c = useProCopy();
  const { locale } = useLocale();
  const en = locale === 'en', uz = locale === 'uz';
  const text = (a: string, b: string, d: string) => en ? a : uz ? b : d;
  const max = Math.max(1, ...p.days.map(d => d.minutes));
  const total = p.active + p.progressCompleted;
  const ready = !p.dataStatus || p.dataStatus === 'ready';
  const percent = total ? Math.round(p.progressCompleted / total * 100) : 0;
  return <section className="pro-reference-overview" aria-label={c.overview}>
    <div className="pro-summary-cards">
      {[
        { icon: BookOpen, value: p.active, label: c.pending, href: '#/planner' },
        { icon: CheckCheck, value: p.completed, label: c.completed, href: '#/planner' },
        { icon: Clock3, value: actualDuration(p.minutes * 60,locale), label: text('Focus · last 7 days', 'Fokus · oxirgi 7 kun', 'Фокус · последние 7 дней'), href: '#/focus' },
        { icon: BookOpen, value: p.due, label: c.due, href: '#/flashcards' },
      ].map(({ icon: Icon, value, label, href }, i) => <a className="pro-summary-card" href={href} key={i}>
        <span className={`pro-summary-icon pro-summary-icon-${i}`}><Icon size={23}/></span>
        <strong>{ready ? value : '—'}</strong><span>{label}</span>
      </a>)}
    </div>
    <section className="pro-trend-card">
      <header><h2>{c.weekly}</h2><p>{c.minutes}</p></header>
      <div className="pro-trend-body"><div className="pro-trend-total"><strong>{ready ? actualDuration(p.minutes * 60,locale) : '—'}</strong><p>{c.focus}</p><a href="#/analytics">{c.evidence}<ArrowUpRight size={15}/></a></div>
        <div className="pro-pill-chart" role="img" aria-label={ready ? p.days.map(d => `${d.day}: ${actualDuration(d.minutes*60,locale)}`).join(', ') : p.dataStatus === 'loading' ? c.loading : c.loadError}>
          {p.days.map((d, i) => <div key={d.day}><span className={`pro-pill pro-pill-${i}`} style={{ height: `${ready ? Math.max(0, d.minutes / max * 100) : 0}%` }} title={`${d.day}: ${ready ? actualDuration(d.minutes * 60,locale) : '—'}`}/><small>{d.day.slice(5)}</small></div>)}
        </div>
      </div>
      {(!ready || !p.minutes) && <p className="pro-chart-empty">{ready ? c.empty : p.dataStatus === 'loading' ? c.loading : c.loadError}</p>}
    </section>
    <section className="pro-balance-card"><div className="pro-balance-ring" style={{ '--pro-progress': `${ready ? percent : 0}%` } as React.CSSProperties}><div><strong>{ready && total ? `${percent}%` : '—'}</strong><span>{c.completed}</span></div></div>
      <h2>{text('Study progress', 'O‘qish jarayoni', 'Учебный прогресс')}</h2><dl><div><dt><i/>{c.completed}</dt><dd>{ready ? p.progressCompleted : '—'}</dd></div><div><dt><i/>{c.pending}</dt><dd>{ready ? p.active : '—'}</dd></div></dl><p>{c.notMastery}</p>
    </section>
    <section className="pro-timer-card"><header><h2>{c.focus}</h2><Timer size={24}/></header><div className="pro-timer-arc"><strong>25:00</strong></div><a href="#/focus">{text('Start a focus session', 'Fokus mashg‘ulotini boshlash', 'Начать фокус-сессию')}<ArrowUpRight size={17}/></a></section>
    <section className="pro-reminder-card"><h2>{c.next}</h2><p>{c.flow}</p><a href="#/planner"><div><strong>{p.nextTitle || c.empty}</strong>{p.nextTime && <time>{p.nextTime}</time>}</div><ArrowUpRight size={21}/></a></section>
    <section className="pro-insight-card"><span><Sparkles size={18}/>{c.intelligence}</span><p>{p.briefingAllowed ? c.briefHelp : c.lockedHelp}</p><div className="pro-insight-actions"><a href="#/tutor">{c.tutor}</a><button disabled={p.busy || !p.briefingAllowed} onClick={p.onBriefing}>{p.busy ? c.working : c.briefing}<ArrowUpRight size={17}/></button></div></section>
  </section>;
}
