import React, { useEffect, useRef, useState } from 'react';
import { Check, Clock3, LockKeyhole, MoveVertical } from 'lucide-react';
import { calendarDay, localMinutes, sessionKey, subjectColor, placementConflict } from './calendarModel';
import { dateKey, localInstant, type SmartPlan } from './smartPlannerModel';
import type { StudyBlock } from './smartSchedule';
import type { SmartCopy } from './smartPlannerCopy';
type Props = {
    plan: SmartPlan;
    days: string[];
    selected: string;
    now: number;
    c: SmartCopy;
    locale: string;
    onDay: (day: string) => void;
    onInspect: (taskId: string, s?: StudyBlock) => void;
    onDrop: (s: StudyBlock, start: number, duration: number) => void;
    onComplete: (id: string) => void;
};
export function PlannerCalendar({ plan, days, selected, now, c, locale, onDay, onInspect, onDrop, onComplete }: Props) {
    const grid = useRef<HTMLDivElement>(null), [drag, setDrag] = useState<{
        key: string;
        resize: boolean;
    } | null>(null), [preview, setPreview] = useState<{
        day: string;
        minute: number;
    } | null>(null);
    const localeName = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB';
    const time = (instant: number) => new Intl.DateTimeFormat(localeName, { timeZone: plan.timezone, hour: '2-digit', minute: '2-digit' }).format(instant);
    const task = (id: string) => plan.tasks.find(t => t.id === id), today = dateKey(now, plan.timezone);
    const stamp = (day: string) => new Intl.DateTimeFormat(localeName, { timeZone: plan.timezone, weekday: 'short', day: 'numeric' }).format(localInstant(day, '12:00', plan.timezone));
    useEffect(() => { if (!grid.current)
        return; const upcoming = plan.sessions.filter(s => s.end > now && days.includes(dateKey(s.start, plan.timezone))).sort((a, b) => a.start - b.start)[0]; const minute = upcoming ? localMinutes(upcoming.start, plan.timezone) : 480; grid.current.scrollTop = Math.max(0, minute - 120); }, [days[0], plan.mode]);
    const beginDrag = (e: React.DragEvent, s: StudyBlock, resize = false) => { if (s.locked || task(s.taskId)?.completed) {
        e.preventDefault();
        return;
    } const payload = { key: sessionKey(s), resize }; setDrag(payload); e.dataTransfer.setData('text/plain', JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'move'; };
    const minuteAt = (e: React.DragEvent) => Math.max(0, Math.min(1425, Math.round((e.clientY - e.currentTarget.getBoundingClientRect().top) / 15) * 15));
    const drop = (e: React.DragEvent, day: string) => { e.preventDefault(); try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const s = plan.sessions.find(s => sessionKey(s) === data.key);
        if (!s)
            return;
        const minute = minuteAt(e), instant = localInstant(day, `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, plan.timezone);
        onDrop(s, data.resize ? s.start : instant, data.resize ? (instant - s.start) / 60000 : (s.end - s.start) / 60000);
    }
    catch { }
    finally {
        setDrag(null);
        setPreview(null);
    } };
    const timeline = plan.mode !== 'list';
    return <>
    {timeline && <div className="sp-timetable" aria-label={c.calendar}><div className="sp-calendar-head" style={{ gridTemplateColumns: `52px repeat(${days.length},minmax(0,1fr))` }}><span className="sp-zone-label">{c.timezone}</span>{days.map(day => <button key={day} className={day === today ? 'sp-is-today' : ''} aria-pressed={day === selected} onClick={() => onDay(day)}>{stamp(day)}{day === today && <small>{c.todayShort}</small>}</button>)}</div>
      <div className="sp-time-scroll" ref={grid}><div className="sp-time-body"><div className="sp-time-ruler">{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: `${h * 60}px` }}>{String(h).padStart(2, '0')}:00</span>)}</div>
      <div className="sp-time-columns" style={{ gridTemplateColumns: `repeat(${days.length},minmax(0,1fr))` }}>{days.map(day => {
                const range = calendarDay(plan, day);
                const blocks = plan.sessions.filter(s => dateKey(s.start, plan.timezone) === day);
                return <section key={day} className={`sp-time-day ${day === today ? 'sp-is-today' : ''}`} aria-label={stamp(day)} onDragOver={e => { if (!drag)
                    return; e.preventDefault(); setPreview({ day, minute: minuteAt(e) }); }} onDrop={e => drop(e, day)}>
        {range.available.map((r, i) => <div className="sp-available-range" key={i} style={{ top: localMinutes(r.start, plan.timezone), height: (r.end - r.start) / 60000 }} aria-hidden="true"/>)}
        {range.commitments.map((r, i) => <div className="sp-fixed-event" key={i} style={{ top: localMinutes(r.start, plan.timezone), height: Math.max(22, (r.end - r.start) / 60000) }}><LockKeyhole size={12}/><strong>{r.label === 'Sleep' ? c.sleep : r.label}</strong><small>{time(r.start)}–{time(r.end)}</small></div>)}
        {blocks.map(s => { const t = task(s.taskId); if (!t)
                    return null; const subject = plan.subjects.find(p => p.id === t.subjectId); const conflict = placementConflict(plan, s); return <article key={sessionKey(s)} className={`sp-timed-event ${t.completed ? 'sp-event-complete' : ''} ${s.locked ? 'sp-event-locked' : ''} ${conflict ? 'sp-event-conflict' : ''}`} style={{ top: localMinutes(s.start, plan.timezone), height: Math.max(42, (s.end - s.start) / 60000), '--subject-color': subjectColor(subject?.color) } as React.CSSProperties} draggable={!s.locked && !t.completed} onDragStart={e => beginDrag(e, s)} onDragEnd={() => { setDrag(null); setPreview(null); }}><button className="sp-event-body" title={`${t.title} · ${time(s.start)}–${time(s.end)}`} onClick={() => onInspect(t.id, s)} aria-label={`${t.title} · ${time(s.start)}–${time(s.end)}${s.locked ? ' · ' + c.locked : ''}`}><span>{time(s.start)}–{time(s.end)}{s.locked && <LockKeyhole size={11}/>}</span><strong>{t.title}</strong><small>{subject?.name}{t.completed ? ' · ' + c.done : conflict ? ' · ' + c.conflict : ''}</small></button>{!s.locked && !t.completed && t.flexibility !== 'fixed' && <button className="sp-resize-handle" aria-label={`${c.resize}: ${t.title}`} draggable onDragStart={e => { e.stopPropagation(); beginDrag(e, s, true); }} onClick={() => onInspect(t.id, s)}><MoveVertical size={13}/></button>}</article>; })}
        {day === today && <div className="sp-now-line" style={{ top: localMinutes(now, plan.timezone) }}><span>{time(now)}</span></div>}
        {preview?.day === day && <div className="sp-drag-preview" style={{ top: preview.minute }}>{String(Math.floor(preview.minute / 60)).padStart(2, '0')}:{String(preview.minute % 60).padStart(2, '0')}</div>}
      </section>;
            })}</div></div></div>
    </div>}
    <div className={`sp-agenda ${timeline ? 'sp-mobile-agenda' : ''}`}>{days.map(day => { const blocks = plan.sessions.filter(s => dateKey(s.start, plan.timezone) === day).sort((a, b) => a.start - b.start); const range = calendarDay(plan, day); return <section className="sp-agenda-day" key={day}><button className="sp-agenda-date" onClick={() => onDay(day)}>{stamp(day)}{day === today && <span>{c.todayShort}</span>}</button>{range.commitments.filter(r => r.label !== 'Sleep').map((r, i) => <div className="sp-agenda-fixed" key={i}><LockKeyhole size={14}/><span>{r.label} · {time(r.start)}–{time(r.end)}</span></div>)}{blocks.map(s => { const t = task(s.taskId); if (!t)
        return null; const subject = plan.subjects.find(v => v.id === t.subjectId); return <article className={`sp-agenda-row ${t.completed ? 'sp-completed' : ''}`} style={{ '--subject-color': subjectColor(subject?.color) } as React.CSSProperties} key={sessionKey(s)}><button className="sp-agenda-inspect" onClick={() => onInspect(t.id, s)}><span className="sp-agenda-time">{plan.mode === 'list' ? `${Math.round((s.end - s.start) / 60000)} ${c.minutes}` : `${time(s.start)}–${time(s.end)}`}</span><strong>{t.title}</strong><small>{subject?.name}{s.locked ? ' · ' + c.locked : ''}{s.end < now && !t.completed ? ' · ' + c.missed : ''}</small></button><button className="sp-icon" aria-label={`${t.completed ? c.undo : c.done}: ${t.title}`} aria-pressed={!!t.completed} onClick={() => onComplete(t.id)}><Check size={18}/></button></article>; })}{!blocks.length && <p className="sp-empty-day"><Clock3 size={18}/>{c.noToday}</p>}</section>; })}</div>
  </>;
}
