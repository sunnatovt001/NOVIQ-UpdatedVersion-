import { Check, ChevronDown, Plus } from 'lucide-react';
import type { SmartPlan } from './smartPlannerModel';
import type { SmartCopy } from './smartPlannerCopy';
import { subjectColor } from './calendarModel';

export function PlannerTaskRail({ plan, c, onAdd, onInspect, onComplete }: {
  plan: SmartPlan; c: SmartCopy; onAdd: () => void;
  onInspect: (id: string) => void; onComplete: (id: string) => void;
}) {
  const completed = plan.tasks.filter(t => t.completed).length;
  const groups = [...plan.subjects.map(s => ({ id: s.id, name: s.name, color: subjectColor(s.color) })),
    ...(plan.tasks.some(t => !plan.subjects.some(s => s.id === t.subjectId)) ? [{ id: '', name: c.allTasks, color: '#2563eb' }] : [])];
  return <section className="sp-task-rail" aria-label={c.allTasks}>
    <header><h2>{c.allTasks}</h2><button className="sp-icon" onClick={onAdd} aria-label={c.addTask}><Plus size={18}/></button></header>
    <div className="sp-rail-groups">
      {groups.map(group => {
        const tasks = plan.tasks.filter(t => group.id ? t.subjectId === group.id : !plan.subjects.some(s => s.id === t.subjectId));
        return <details open key={group.id} className="sp-task-group" style={{ '--subject-color': group.color } as React.CSSProperties}>
          <summary><ChevronDown size={12}/><span>{group.name}</span><small>{tasks.filter(t => !t.completed).length}</small></summary>
          {tasks.map(t => <div className={`sp-rail-task ${t.completed ? 'sp-completed' : ''}`} key={t.id}>
            <button className="sp-task-check" role="checkbox" aria-checked={!!t.completed} aria-label={`${t.completed ? c.undo : c.done}: ${t.title}`} onClick={() => onComplete(t.id)}>{t.completed && <Check size={12}/>}</button>
            <button className="sp-rail-task-title" onClick={() => onInspect(t.id)} title={`${t.title} · ${t.minutes} ${c.minutes}`}>{t.title}</button>
          </div>)}
          <button className="sp-rail-add" onClick={onAdd}><Plus size={14}/>{c.addTask}</button>
        </details>;
      })}
      {!plan.tasks.length && <p className="sp-rail-empty">{c.empty}</p>}
    </div>
    <footer className="sp-rail-progress" aria-live="polite"><span>{c.done}<strong>{completed} / {plan.tasks.length}</strong></span><progress value={completed} max={Math.max(1, plan.tasks.length)} aria-label={c.done}/></footer>
  </section>;
}
