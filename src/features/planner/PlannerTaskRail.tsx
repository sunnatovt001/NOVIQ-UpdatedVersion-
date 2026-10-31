import { Check, ChevronDown, Plus, Search, CalendarDays } from 'lucide-react';
import { useState,useEffect,useRef } from 'react';
import {dailyTasks} from './adaptivePlanning';
import {dateKey} from './smartPlannerModel';
import type { SmartPlan } from './smartPlannerModel';
import type { SmartCopy } from './smartPlannerCopy';
import { subjectColor } from './calendarModel';

export function PlannerTaskRail({ plan, c, onAdd, onInspect, onComplete, searchable=false,day,locale='en' }: {
  searchable?: boolean;day?:string;locale?:string;
  plan: SmartPlan; c: SmartCopy; onAdd: () => void;
  onInspect: (id: string) => void; onComplete: (id: string) => void;
}) {
  const daily=!!plan.adaptation||plan.tasks.some(t=>t.origin==='ai');
  const [search,setSearch]=useState(''),[todayOnly,setTodayOnly]=useState(daily);
  const wasDaily=useRef(daily);useEffect(()=>{if(daily&&!wasDaily.current)setTodayOnly(true);wasDaily.current=daily;},[daily]);
  const visible=todayOnly?dailyTasks(plan,day||dateKey(Date.now(),plan.timezone)):plan.tasks;
  const completed = visible.filter(t => t.completed).length;
  const groups = [...plan.subjects.map(s => ({ id: s.id, name: s.name, color: subjectColor(s.color) })),
    ...(plan.tasks.some(t => !plan.subjects.some(s => s.id === t.subjectId)) ? [{ id: '', name: c.allTasks, color: '#2563eb' }] : [])];
  return <section className="sp-task-rail" aria-label={c.allTasks}>
    <header><h2>{c.allTasks}</h2><button className="sp-icon" onClick={onAdd} aria-label={c.addTask}><Plus size={18}/></button></header>
    {daily&&<div className="sp-rail-filter" role="group" aria-label={locale==='uz'?'Vazifalar ko‘rinishi':locale==='ru'?'Список задач':'Assignment scope'}><button type="button" aria-label={locale==='uz'?'Bugungi vazifalar':locale==='ru'?'Задачи на сегодня':"Today's assignments"} aria-pressed={todayOnly} onClick={()=>setTodayOnly(true)}>{locale==='uz'?'Bugun':locale==='ru'?'Сегодня':'Today'}</button><button type="button" aria-label={locale==='uz'?'Barcha vazifalar':locale==='ru'?'Все задачи':'All assignments'} aria-pressed={!todayOnly} onClick={()=>setTodayOnly(false)}>{locale==='uz'?'Hammasi':locale==='ru'?'Все':'All'}</button></div>}
    {searchable&&<label className="fp-rail-search"><Search size={16}/><input aria-label={c.allTasks} placeholder={`${c.allTasks}…`} value={search} onChange={event=>setSearch(event.target.value)}/></label>}
    <div className="sp-rail-groups">
      {groups.filter(group=>(!todayOnly||visible.some(t=>t.subjectId===group.id))&&(!search||group.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())||visible.some(t=>t.subjectId===group.id&&t.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())))).map(group => {
        const tasks = visible.filter(t => group.id ? t.subjectId === group.id : !plan.subjects.some(s => s.id === t.subjectId));
        return <details open key={group.id} className="sp-task-group" style={{ '--subject-color': group.color } as React.CSSProperties}>
          <summary><ChevronDown size={12}/><span>{group.name}</span><small>{tasks.filter(t => !t.completed).length}</small></summary>
          {tasks.filter(t=>!search||group.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())||t.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(t => <div className={`sp-rail-task ${t.completed ? 'sp-completed' : ''}`} key={t.id}>
            <button className="sp-task-check" role="checkbox" aria-checked={!!t.completed} aria-label={`${t.completed ? c.undo : c.done}: ${t.title}`} onClick={() => onComplete(t.id)}>{t.completed && <Check size={12}/>}</button>
            <button className="sp-rail-task-title" onClick={() => onInspect(t.id)} title={`${t.title} · ${t.minutes} ${c.minutes}`}>{t.title}</button>
          </div>)}
          <button className="sp-rail-add" onClick={onAdd}><Plus size={14}/>{c.addTask}</button>
        </details>;
      })}
      {!visible.length && <div className="sp-rail-empty">{searchable&&<CalendarDays size={49} aria-hidden="true"/>}<p>{todayOnly?(locale==='uz'?'Bu kun uchun vazifa yo‘q. Barcha vazifalarni Hammasi bo‘limida ko‘ring.':locale==='ru'?'На этот день задач нет. Все задания доступны во вкладке «Все».':'No assignments for this day. View your history and backlog in All.') : c.empty}</p></div>}
    </div>
    <footer className="sp-rail-progress" aria-live="polite"><span>{c.done}<strong>{completed} / {visible.length}</strong></span><progress value={completed} max={Math.max(1, visible.length)} aria-label={c.done}/></footer>
  </section>;
}
