import { navigateToPage } from '@/src/lib/navigation';
import { ProgressionPanel } from '@/src/features/progression/ProgressionPanel';
import { useState } from 'react';
import { ArrowRight, Bell, BookOpen, Brain, Check, CheckSquare, Clock3, FileText, Flame, FlaskConical, MessageCircle, Play, Search, Sparkles, Layers } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLocale } from '@/src/contexts/LocaleContext';
import { addDays, dateKey, type SmartPlan, type SmartTask } from '@/src/features/planner/smartPlannerModel';
import { focusContextKey } from '@/src/features/planner/useSmartPlanner';
import { saveLocalData } from '@/src/lib/localStore';
import type { StudyEvidence } from './useStudyEvidence';
import { getProfileAvatar } from '@/src/lib/profileAvatar';
import { useMembership } from './MembershipContext';
import './glass-dashboard.css';

type Props = { plan: SmartPlan | null; now: number; status: string; due: number; records: StudyEvidence[]; blocked: boolean; save: (plan: SmartPlan, description: string) => boolean; retry: () => void; explore: () => void };

export function GlassDashboard({ plan, now, status, due, records, blocked, save, retry, explore }: Props) {
  const { profile } = useAuth();
  const { access } = useMembership();
  const { locale } = useLocale();
  const tr = (en: string, uz: string, ru: string) => locale === 'uz' ? uz : locale === 'ru' ? ru : en;
  const [search, setSearch] = useState(''), [notice, setNotice] = useState(false), [error, setError] = useState('');
  const zone = plan?.timezone || 'Asia/Tashkent', today = dateKey(now, zone);
  const language = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-US';
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    return { day, minutes: records.filter(r => r.category === 'focus' && Date.parse(r.timestamp) <= now && dateKey(Date.parse(r.timestamp), zone) === day).reduce((sum, r) => sum + r.duration / 60, 0) };
  });
  const minutes = Math.round(days.reduce((sum, d) => sum + d.minutes, 0));
  const duration = (n: number) => n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n} ${tr('min', 'daq', 'мин')}`;
  const tasks = plan?.tasks || [], completed = tasks.filter(t => t.completed).length;
  const sessions = (plan?.sessions || []).filter(s => dateKey(s.start, zone) === today).sort((a, b) => a.start - b.start);
  const next = [...(plan?.sessions || [])].filter(s => s.end > now && tasks.some(t => t.id === s.taskId && !t.completed)).sort((a, b) => a.start - b.start)[0];
  const nextTask = tasks.find(t => t.id === next?.taskId) || tasks.find(t => !t.completed);
  const subject = (task: SmartTask) => plan?.subjects.find(s => s.id === task.subjectId);
  const icons = [FileText, FlaskConical, MessageCircle];
  const available = status === 'ready';
  const value = (v: string | number) => available ? v : '—';
  const start = () => {
    if (!plan || !nextTask) { navigateToPage('/planner'); return; }
    try {
      saveLocalData(focusContextKey(plan.userId), { taskId: nextTask.id, title: nextTask.title, subject: subject(nextTask)?.name || nextTask.title });
      saveLocalData(`noviq-focus-task-${plan.userId}`, nextTask.title);
      saveLocalData(`noviq-focus-task-done-${plan.userId}`, false);
      navigateToPage('/focus');
    } catch { setError(tr('Could not open this task. Please retry.', 'Vazifa ochilmadi. Qayta urining.', 'Не удалось открыть задачу. Повторите.')); }
  };
  const toggle = (task: SmartTask) => {
    if (!plan || blocked) return;
    const accepted = save({ ...plan, tasks: tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed, completedAt: t.completed ? undefined : now } : t) }, task.completed ? 'Reopen assignment' : 'Complete assignment');
    setError(accepted ? '' : tr('Could not save. Please retry in Planner.', 'Saqlanmadi. Planner’da qayta urining.', 'Не удалось сохранить. Повторите в планировщике.'));
  };
  const matches = tasks.filter(t => t.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0, 5);
  const scale = Math.ceil(Math.max(120, ...days.map(d => d.minutes)) / 120) * 120;
  return <div className="glass-dashboard">
    <div className="gd-toolbar"><span>{tr('Workspace', 'Ish maydoni', 'Рабочее пространство')} <b>/</b> {tr('Dashboard', 'Dashboard', 'Обзор')}</span><div className="gd-tools"><div className="gd-search"><Search size={18}/><input aria-label={tr('Search your workspace', 'Ish maydonida qidirish', 'Поиск в рабочем пространстве')} placeholder={tr('Search your workspace', 'Ish maydonida qidirish', 'Поиск в рабочем пространстве')} value={search} onChange={e => setSearch(e.target.value)}/>{search && <div className="gd-search-results">{matches.length ? matches.map(t => <a key={t.id} href="/planner">{t.title}<ArrowRight size={15}/></a>) : <p>{tr('No matching tasks', 'Vazifa topilmadi', 'Задачи не найдены')}</p>}</div>}</div><div className="gd-notifications"><button className="gd-icon-button" aria-label={tr('Notifications', 'Bildirishnomalar', 'Уведомления')} aria-expanded={notice} onClick={() => setNotice(!notice)}><Bell size={20}/></button>{notice && <div className="gd-notice">{available ? tr(`${due} cards ready for review.`, `${due} ta karta takrorlashga tayyor.`, `Карточек для повторения: ${due}.`) : tr('Your activity is loading.', 'Ma’lumotlar yuklanmoqda.', 'Загрузка данных.')}<a href="/flashcards">{tr('Open flashcards', 'Kartalarni ochish', 'Открыть карточки')} →</a></div>}</div><a className="gd-avatar" href="/profile" aria-label={tr('Open profile', 'Profilni ochish', 'Открыть профиль')}><img src={getProfileAvatar(profile, access.entitled)} alt=""/></a></div></div>
    <header className="gd-greeting"><div><h1>{tr('Good morning', 'Xayrli kun', 'Добрый день')}{profile?.displayName ? `, ${profile.displayName.trim().split(/\s+/)[0]}` : ''}</h1><p>{tr('A clear plan. A little focus. Real progress.', 'Aniq reja. Biroz diqqat. Haqiqiy natija.', 'Чёткий план. Немного фокуса. Настоящий прогресс.')}</p></div><time>{new Intl.DateTimeFormat(language, { weekday: 'long', month: 'long', day: 'numeric', timeZone: zone }).format(now)}</time></header>
    <ProgressionPanel />
    {status !== 'ready' && <div className="gd-status" role={status === 'unavailable' ? 'alert' : 'status'}>{status === 'unavailable' ? tr('Could not load your activity.', 'Ma’lumotlarni yuklab bo‘lmadi.', 'Не удалось загрузить данные.') : tr('Loading your workspace…', 'Ish maydoni yuklanmoqda…', 'Загрузка рабочего пространства…')}{status === 'unavailable' && <button onClick={retry}>{tr('Retry', 'Qayta urinish', 'Повторить')}</button>}</div>}
    <div className="gd-stats">{[
      { icon: Clock3, value: value(duration(minutes)), label: tr('Study time this week', 'Bu haftadagi o‘qish vaqti', 'Учёба за неделю') },
      { icon: CheckSquare, value: value(`${completed} / ${tasks.length}`), label: tr('Tasks completed', 'Bajarilgan vazifalar', 'Выполнено задач') },
      { icon: Flame, value: `${profile?.streak || 0} ${tr('days', 'kun', 'дн.')}`, label: tr('Current streak', 'Joriy davomiylik', 'Текущая серия') },
      { icon: Layers, value: value(due), label: tr('Cards to review', 'Takrorlanadigan kartalar', 'Карточек к повторению') },
    ].map(({ icon: Icon, value: v, label }) => <div className="gd-panel gd-stat" key={label}><span className="gd-stat-icon"><Icon size={27}/></span><div><strong>{v}</strong><p>{label}</p></div></div>)}</div>
    <div className="gd-grid">
      <section className="gd-journey"><div><p className="gd-journey-label">{tr('CONTINUE YOUR JOURNEY', 'O‘QISHNI DAVOM ETTIRING', 'ПРОДОЛЖАЙТЕ СВОЙ ПУТЬ')}</p><h2>{nextTask ? subject(nextTask)?.name || nextTask.title : tr('Your next chapter starts here', 'Yangi maqsad sari bir qadam', 'Начните новую главу')}</h2><p>{nextTask ? `${nextTask.title} · ${duration(nextTask.minutes)}` : tr('Make a little room for learning.', 'Bugun o‘qish uchun vaqt ajrating.', 'Найдите немного времени для учёбы.')}</p><progress aria-label={tr('Task progress', 'Vazifalar natijasi', 'Прогресс задач')} value={completed} max={Math.max(tasks.length, 1)}/><small>{completed} {tr('of', '/ ', 'из')} {tasks.length} {tr('tasks completed', 'vazifa bajarildi', 'задач выполнено')}</small><button className="gd-button" disabled={blocked || !available} onClick={start}><Play size={18} fill="currentColor"/>{nextTask ? tr('Start focus session', 'Fokusni boshlash', 'Начать фокус-сессию') : tr('Create your study plan', 'O‘qish rejasini tuzish', 'Создать учебный план')}</button></div></section>
      <section className="gd-panel gd-week"><div className="gd-section-heading"><h2>{tr('This week', 'Bu hafta', 'Эта неделя')}</h2><span><b>{value(duration(minutes))}</b></span></div><div className="gd-chart" role="img" aria-label={`${tr('Study minutes by day this week', 'Hafta kunlari bo‘yicha o‘qish vaqti', 'Время учёбы по дням недели')}: ${days.map(d => `${d.day}: ${available ? duration(Math.round(d.minutes)) : '—'}`).join('; ')}`}><div className="gd-axis"><span>{Math.round(scale / 60)}h</span><span>{Math.round(scale / 120)}h</span><span>0h</span></div><div className="gd-bars">{days.map(d => <div className={d.day > today ? 'is-future' : ''} key={d.day}><div className="gd-bar-track"><span title={`${d.day}: ${duration(Math.round(d.minutes))}`} style={{ height: `${available ? d.minutes / scale * 100 : 0}%` }}/></div><small>{new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(new Date(d.day + 'T12:00Z'))}</small></div>)}</div></div></section>
      <section className="gd-panel gd-plan"><div className="gd-section-heading"><h2>{tr('Your study plan', 'O‘qish rejangiz', 'Ваш учебный план')}</h2><a href="/planner">{tr('View planner', 'Rejani ochish', 'Открыть план')}<ArrowRight size={19}/></a></div><div className="gd-plan-list">{sessions.slice(0, 3).map((s, i) => { const task = tasks.find(t => t.id === s.taskId); if (!task) return null; const Icon = icons[i % 3]; return <div className={`gd-plan-row gd-tone-${i % 3}`} key={`${s.taskId}-${s.start}`}><time>{new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(s.start)}</time><div className="gd-task"><span className="gd-task-icon"><Icon size={23}/></span><a href="/planner"><strong>{subject(task)?.name || task.title}</strong><small>{task.title}</small></a><span className="gd-task-duration"><Clock3 size={18}/>{Math.round((s.end - s.start) / 60000)} {tr('min', 'daq', 'мин')}</span><button className="gd-check" aria-label={`${task.completed ? tr('Reopen', 'Qayta ochish', 'Открыть снова') : tr('Complete', 'Bajarildi', 'Выполнить')}: ${task.title}`} aria-pressed={!!task.completed} disabled={blocked} onClick={() => toggle(task)}>{task.completed && <Check size={15}/>}</button></div></div>; })}{!sessions.length && <div className="gd-empty"><BookOpen size={28}/><p>{tr('A clear day starts with a small plan.', 'Unumli kun kichik rejadan boshlanadi.', 'Продуктивный день начинается с плана.')}</p><a href="/planner">{tr('Plan your first session', 'Birinchi mashg‘ulotni rejalash', 'Запланировать занятие')}<ArrowRight size={17}/></a></div>}</div>{error && <p role="alert">{error}</p>}</section>
      <section className="gd-panel gd-review"><h2>{tr('Review & remember', 'Takrorlang va eslab qoling', 'Повторяйте и запоминайте')}</h2><div className="gd-review-content"><div className="gd-card-art" aria-hidden="true"><i/><i/><i/><div><Brain size={27}/><span/><span/></div></div><div><strong>{value(due)} {tr('cards', 'karta', 'карточек')}</strong><p>{tr('ready for review', 'takrorlashga tayyor', 'готовы к повторению')}</p><a className="gd-button" href="/flashcards">{tr('Review flashcards', 'Kartalarni takrorlash', 'Повторить карточки')}<ArrowRight size={17}/></a></div></div></section>
      <section className="gd-panel gd-subjects"><h2>{tr('Your subjects', 'Fanlaringiz', 'Ваши предметы')}</h2><div>{(plan?.subjects || []).filter(s => !s.paused).slice(0, 3).map((s, i) => { const items = tasks.filter(t => t.subjectId === s.id), percent = items.length ? Math.round(items.filter(t => t.completed).length / items.length * 100) : 0, Icon = [BookOpen, MessageCircle, FlaskConical][i % 3]; return <a href="/planner" className={`gd-subject gd-tone-${i % 3}`} key={s.id}><span className="gd-task-icon"><Icon size={23}/></span><div><strong>{s.name}</strong><small>{s.target || tr('Your learning journey', 'O‘qish maqsadingiz', 'Ваш учебный путь')}</small></div><progress value={percent} max={100} aria-label={`${s.name}: ${percent}%`}/><span>{percent}%</span></a>; })}{!plan?.subjects.length && <a className="gd-empty-subject" href="/planner">{tr('Add a subject to begin', 'Boshlash uchun fan qo‘shing', 'Добавьте предмет')}<ArrowRight size={18}/></a>}</div></section>
      <section className="gd-panel gd-next"><Sparkles size={27}/><div><h2>{tr('A useful next step', 'Foydali keyingi qadam', 'Полезный следующий шаг')}</h2><p>{tr('Bring a tricky question to your tutor before your next session.', 'Keyingi mashg‘ulotdan oldin qiyin savolni Tutor bilan ko‘rib chiqing.', 'Разберите сложный вопрос с тьютором перед следующим занятием.')}</p><a href="/tutor">{tr('Open Tutor', 'Tutorni ochish', 'Открыть тьютора')}<ArrowRight size={18}/></a></div></section>
    </div><footer className="gd-footer"><button onClick={explore}>{tr('Explore your learning insights', 'O‘qish tahlilini ko‘rish', 'Открыть аналитику обучения')}<ArrowRight size={15}/></button><a href="/pricing">NOVIQ PRO</a></footer>
  </div>;
}
