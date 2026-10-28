import { navigateToPage } from '@/src/lib/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, Plus, Play, Target } from 'lucide-react';
import { useLocale } from '@/src/contexts/LocaleContext';
import { addDays, dateKey, localInstant, type SmartPlan, type SmartTask } from '@/src/features/planner/smartPlannerModel';
import { subjectColor } from '@/src/features/planner/calendarModel';
import { focusContextKey } from '@/src/features/planner/useSmartPlanner';
import { saveLocalData } from '@/src/lib/localStore';

type Props = {
  plan: SmartPlan | null; now: number; loading: boolean; blocked: boolean;
  save: (plan: SmartPlan, description: string) => boolean;
};

/** Daily view shares the planner repository, including its conflict and save rules. */
export function LiquidToday({ plan, now, loading, blocked, save }: Props) {
  const { locale } = useLocale();
  const tr = (en: string, uz: string, ru: string) => locale === 'uz' ? uz : locale === 'ru' ? ru : en;
  const zone = plan?.timezone || 'Asia/Tashkent';
  const today = dateKey(now, zone);
  const [offset, setOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState('');
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7) + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const day = selectedDay && days.includes(selectedDay) ? selectedDay : days.includes(today) ? today : monday;
  const language = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB';
  const time = (value: number) => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(value);
  const stamp = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language, { ...options, timeZone: zone }).format(localInstant(value, '12:00', zone));
  const sessions = (plan?.sessions || []).filter(s => dateKey(s.start, zone) === day).sort((a, b) => a.start - b.start);
  const scheduledIds = new Set(sessions.map(s => s.taskId));
  const tasks = (plan?.tasks || []).filter(t => scheduledIds.has(t.id));
  const completed = tasks.filter(t => t.completed).length;
  const priorities = tasks.filter(t => !t.completed).sort((a, b) => b.priority - a.priority).slice(0, 3);
  const next = priorities[0];
  const subject = (task: SmartTask) => plan?.subjects.find(s => s.id === task.subjectId);
  const [actionError, setActionError] = useState('');
  const toggle = (task: SmartTask) => {
    if (!plan || blocked) return;
    const accepted = save({ ...plan, tasks: plan.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed, completedAt: t.completed ? undefined : now } : t) }, task.completed ? 'Reopen assignment' : 'Complete assignment');
    setActionError(accepted ? '' : tr('Could not save. Please retry in Planner.', 'Saqlanmadi. Planner’da qayta urining.', 'Не удалось сохранить. Повторите в планировщике.'));
  };
  const start = (task: SmartTask) => {
    if (!plan || blocked) return;
    try {
      saveLocalData(focusContextKey(plan.userId), { taskId: task.id, title: task.title, subject: subject(task)?.name || task.title });
      saveLocalData(`noviq-focus-task-${plan.userId}`, task.title);
      saveLocalData(`noviq-focus-task-done-${plan.userId}`, false);
      navigateToPage('/focus');
    } catch { setActionError(tr('Could not open this task. Please retry.', 'Vazifa ochilmadi. Qayta urining.', 'Не удалось открыть задачу. Повторите.')); }
  };
  return <section className="liquid-today" aria-label={tr('Today', 'Bugun', 'Сегодня')}>
    <div className="liquid-day-heading"><div><span className="liquid-eyebrow">{tr('YOUR DAILY WORKSPACE', 'KUNLIK ISH MAYDONI', 'ПЛАН НА ДЕНЬ')}</span><h2>{tr('Today', 'Bugun', 'Сегодня')}<span>{stamp(day, { month: 'long', day: 'numeric' })}</span></h2></div><a className="liquid-button" href="/planner"><CalendarDays size={16}/>{tr('Open planner', 'Rejani ochish', 'Открыть план')}</a></div>
    <div className="liquid-today-grid">
      <section className="liquid-panel liquid-schedule">
        <div className="liquid-week-strip"><button className="liquid-icon" aria-label={tr('Previous week', 'Oldingi hafta', 'Предыдущая неделя')} onClick={() => { setOffset(v => v - 1); setSelectedDay(''); }}><ArrowLeft size={16}/></button>{days.map(d => <button key={d} aria-pressed={d === day} className={d === today ? 'is-today' : ''} onClick={() => setSelectedDay(d)}><span>{stamp(d, { weekday: 'short' })}</span><strong>{d.slice(8)}</strong></button>)}<button className="liquid-icon" aria-label={tr('Next week', 'Keyingi hafta', 'Следующая неделя')} onClick={() => { setOffset(v => v + 1); setSelectedDay(''); }}><ArrowRight size={16}/></button></div>
        <div className="liquid-schedule-label"><span><Clock3 size={15}/>{tr('Your schedule', 'Kunlik jadval', 'Расписание')}</span><button onClick={() => { setOffset(0); setSelectedDay(today); }}>{tr('Today', 'Bugun', 'Сегодня')}</button></div>
        <div className="liquid-timeline" aria-busy={loading}>
          {sessions.map((s, i) => { const task = plan?.tasks.find(t => t.id === s.taskId); if (!task) return null; return <div className="liquid-timeline-row" key={`${s.taskId}-${s.start}`} style={{ '--subject-color': subjectColor(subject(task)?.color), '--event-index': i } as React.CSSProperties}><time>{time(s.start)}<small>{time(s.end)}</small></time><button className={task.completed ? 'liquid-time-event is-complete' : 'liquid-time-event'} onClick={() => { navigateToPage('/planner'); }}><small>{subject(task)?.name}</small><strong>{task.title}</strong><span>{Math.round((s.end - s.start) / 60000)} {tr('min', 'daq', 'мин')}{task.completed && <Check size={14}/>}</span></button></div>; })}
          {!sessions.length && <div className="liquid-empty"><CalendarDays size={36}/><h3>{loading ? tr('Loading your day…', 'Rejangiz yuklanmoqda…', 'Загрузка плана…') : tr('Make room for what matters.', 'Muhim ishlar uchun vaqt ajrating.', 'Найдите время для важного.')}</h3><p>{tr('Your saved planner sessions will appear here.', 'Saqlangan rejangizdagi mashg‘ulotlar shu yerda ko‘rinadi.', 'Здесь появятся занятия из сохранённого плана.')}</p><a className="liquid-button liquid-primary" href="/planner"><Plus size={16}/>{tr('Plan your day', 'Kunni rejalashtirish', 'Спланировать день')}</a></div>}
        </div>
        <a className="liquid-add-slot" href="/planner"><Plus size={16}/>{tr('Add a study block', 'Mashg‘ulot qo‘shish', 'Добавить занятие')}</a>
      </section>
      <aside className="liquid-today-aside">
        <section className="liquid-panel liquid-intention"><img src="/onboarding/planet.png" alt=""/><span className="liquid-eyebrow">{tr('ONE STEP AT A TIME', 'BIR QADAMDAN BOSHLANG', 'ШАГ ЗА ШАГОМ')}</span><h3>{tr('A little focus. A brighter future.', 'Bugungi e’tibor — ertangi natija.', 'Больше фокуса. Ярче будущее.')}</h3><p>{tr('Give your next task your full attention.', 'Keyingi vazifaga to‘liq e’tibor bering.', 'Уделите следующей задаче всё внимание.')}</p></section>
        <section className="liquid-panel liquid-priorities"><h3><Target size={18}/>{tr('Top 3 priorities', '3 ta ustuvor vazifa', 'Три главных задачи')}</h3>{priorities.map((task, i) => <div className="liquid-priority" key={task.id}><span>{i + 1}</span><button onClick={() => start(task)} disabled={blocked}>{task.title}</button><button className="liquid-task-check" aria-label={`${tr('Complete', 'Bajarildi', 'Выполнить')}: ${task.title}`} disabled={blocked} onClick={() => toggle(task)}><Check size={13}/></button></div>)}{!priorities.length && <p className="liquid-muted">{tr('Your next priorities appear when you schedule tasks.', 'Rejaga vazifa qo‘shsangiz, ustuvor ishlar shu yerda ko‘rinadi.', 'Запланируйте задачи, чтобы увидеть приоритеты.')}</p>}</section>
        <section className="liquid-panel liquid-day-tasks"><div className="liquid-section-heading"><h3>{tr('Tasks for the day', 'Kunlik vazifalar', 'Задачи на день')}</h3><span>{completed} / {tasks.length}</span></div><progress value={completed} max={Math.max(1, tasks.length)} aria-label={tr('Daily progress', 'Kunlik natija', 'Прогресс за день')}/>{tasks.map(task => <button className={`liquid-check-row ${task.completed ? 'is-complete' : ''}`} key={task.id} role="checkbox" aria-checked={!!task.completed} disabled={blocked} onClick={() => toggle(task)}><span>{task.completed && <Check size={12}/>}</span><span>{task.title}</span></button>)}{next && <button className="liquid-button liquid-primary" disabled={blocked} onClick={() => start(next)}><Play size={15}/>{tr('Start next task', 'Keyingi vazifani boshlash', 'Начать следующую задачу')}</button>}{!tasks.length && <p className="liquid-muted">{tr('A clear day starts with a small plan.', 'Unumli kun kichik rejadan boshlanadi.', 'Продуктивный день начинается с плана.')}</p>}{actionError && <p role="alert">{actionError}</p>}</section>
      </aside>
    </div>
  </section>;
}
