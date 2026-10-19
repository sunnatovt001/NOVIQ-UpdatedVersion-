import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Clock3 } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLocale } from '@/src/contexts/LocaleContext';
import { useSmartPlanner } from '@/src/features/planner/useSmartPlanner';
import { dateKey, addDays, localInstant } from '@/src/features/planner/smartPlannerModel';
import { useProCopy } from './proCopy';
import { useMembership } from './MembershipContext';

export function ReferenceActivityRail() {
  const { cinematic } = useMembership();
  return cinematic ? <ActivityRail/> : null;
}

function ActivityRail() {
  const { user } = useAuth(), { locale } = useLocale(), c = useProCopy();
  const { plan,known,error } = useSmartPlanner(user?.uid);
  const zone = plan?.timezone || 'Asia/Tashkent';
  const [offset, setOffset] = useState(0), [selected, setSelected] = useState('');
  const today = dateKey(Date.now(), zone), first = addDays(today, offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const day = days.includes(selected) ? selected : first;
  const format = (key: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }).format(localInstant(key, '12:00', zone));
  const sessions = (plan?.sessions || []).filter(s => dateKey(s.start, zone) === day).sort((a, b) => a.start - b.start);
  return <aside className="pro-activity-rail">
    <header><button aria-label={locale === 'uz' ? 'Oldingi hafta' : locale === 'ru' ? 'Предыдущая неделя' : 'Previous week'} onClick={() => setOffset(v => v - 1)}><ArrowLeft size={19}/></button><strong>{format(day, { month: 'long', year: 'numeric' })}</strong><button aria-label={locale === 'uz' ? 'Keyingi hafta' : locale === 'ru' ? 'Следующая неделя' : 'Next week'} onClick={() => setOffset(v => v + 1)}><ArrowRight size={19}/></button></header>
    <div className="pro-activity-days">{days.map(d => <button key={d} aria-pressed={d === day} onClick={() => setSelected(d)}><small>{format(d, { weekday: 'short' })}</small><span>{d.slice(-2)}</span></button>)}</div>
    <div className="pro-activity-items">{!known || error ? <p role="status">{error ? c.loadError : c.loading}</p> : sessions.length ? sessions.map(s => <a href="#/planner" key={s.id || s.taskId + ':' + s.start}><strong>{plan?.tasks.find(t => t.id === s.taskId)?.title || c.plan}</strong><span>{plan?.subjects.find(subject => subject.id === plan.tasks.find(t => t.id === s.taskId)?.subjectId)?.name}</span><time><Clock3 size={14}/>{new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(s.start)}</time></a>) : <p>{c.empty}</p>}</div>
    <a className="pro-activity-create" href="#/planner"><Plus size={18}/>{c.plan}</a>
    <div className="pro-activity-brand"><strong>NOVIQ PRO</strong><span>{c.flow}</span></div>
  </aside>;
}
