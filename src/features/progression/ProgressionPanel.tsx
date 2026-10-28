import { useEffect, useRef, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Award, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLocale } from '@/src/contexts/LocaleContext';
import { db } from '@/src/lib/firebase';
import { ACHIEVEMENTS, levelProgress } from '@/src/lib/levels';
import { checkInProgress } from '@/src/lib/verifiedProgress';
import { getCurrentStreak } from '@/src/lib/progressMath';
import './progression.css';

type AchievementState = { unlockedAt: string; tier: string; xp: number };
type Progress = { xp?: number; counters?: Record<string, number>; achievements?: Record<string, AchievementState>; lastQualifiedDay?: string; streak?: number; levelHistory?: Record<string, { at: string }> };
type Ledger = { id: string; source: string; xpDelta: number; createdAt: string; dayKey: string };
const achievementNames = {
  uz: ['Birinchi qadamlar','Birinchi fokus','Fokus quruvchisi','Fokus ustasi','Chuqur mehnat elitasi','Marafon o‘quvchisi','Birinchi eslash','Eslash quruvchisi','Xotira qo‘riqchisi','Xotira afsonasi','7 kunlik muntazamlik','30 kunlik muntazamlik','Maqsad boshlovchisi','Maqsad qo‘riqchisi','Maqsad chempioni','Muvozanatli o‘quvchi'],
  ru: ['Первые шаги','Первый фокус','Развитие фокуса','Мастер фокуса','Элита глубокой работы','Учебный марафон','Первое припоминание','Развитие памяти','Хранитель памяти','Легенда памяти','7 дней подряд','30 дней подряд','Первые цели','Хранитель целей','Чемпион целей','Сбалансированное обучение'],
};

export function ProgressionPanel({ details = false }: { details?: boolean }) {
  const { user, profile } = useAuth(), { locale } = useLocale();
  const tr = (en: string, uz: string, ru: string) => locale === 'uz' ? uz : locale === 'ru' ? ru : en;
  const [progress, setProgress] = useState<Progress | null>(null), [owner, setOwner] = useState('');
  const [daily, setDaily] = useState<{ordinaryXp?: number; bonusXp?: number}>({});
  const [days, setDays] = useState<{dayKey: string; ordinaryXp: number; bonusXp: number}[]>([]);
  const [clock, setClock] = useState(Date.now());
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(clock));
  const [levelUp, setLevelUp] = useState<{from: number; to: number} | null>(null);
  const lastLevel = useRef<{uid: string; level: number} | null>(null), dialog = useRef<HTMLDialogElement>(null);
  const [events, setEvents] = useState<Ledger[]>([]), [error, setError] = useState(false), [filter, setFilter] = useState('all'), [revision, setRevision] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  const shownXp = owner === user?.uid ? progress?.xp ?? profile?.xp ?? 0 : profile?.xp ?? 0;
  const shownLevel = levelProgress(shownXp).level;
  useEffect(() => {
    if (!user) return;
    if (lastLevel.current?.uid === user.uid && shownLevel > lastLevel.current.level) setLevelUp({from:lastLevel.current.level,to:shownLevel});
    lastLevel.current = {uid:user.uid,level:shownLevel};
  }, [user?.uid,shownLevel]);
  useEffect(() => { if(levelUp && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [levelUp]);
  useEffect(() => {
    setProgress(null); setEvents([]); setDays([]); setDaily({}); setError(false); setOwner(user?.uid || '');
    if (!user) return;
    const fail = () => setError(true);
    const dayKey = today;
    const stop = [onSnapshot(doc(db, 'users', user.uid, 'trusted', 'progress'), snapshot => { setProgress(snapshot.exists() ? snapshot.data() : null); }, fail)];
    stop.push(onSnapshot(doc(db, 'users', user.uid, 'xpDays', dayKey), snapshot => setDaily(snapshot.exists() ? snapshot.data() : {}), fail));
    stop.push(onSnapshot(query(collection(db, 'users', user.uid, 'progressEvents'), orderBy('processedAt', 'desc'), limit(30)), snapshot => {
      setEvents(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Ledger)).filter(e => Number.isFinite(e.xpDelta)));
    }, fail));
    if(details) stop.push(onSnapshot(query(collection(db,'users',user.uid,'xpDays'),orderBy('dayKey','desc'),limit(7)),snapshot => setDays(snapshot.docs.map(d=>d.data() as {dayKey: string;ordinaryXp:number;bonusXp:number})),fail));
    return () => stop.forEach(unsubscribe => unsubscribe());
  }, [user?.uid, revision, today, details]);
  if (!user || !profile) return null;
  const current = owner === user.uid ? progress : null;
  const info = levelProgress(current?.xp ?? profile.xp), achievements = current?.achievements || {};
  const counters = current?.counters || {}, visibleEvents = owner === user.uid ? events : [];
  const todayXp = owner === user.uid ? (daily.ordinaryXp || 0) + (daily.bonusXp || 0) : 0;
  const streak = current?.lastQualifiedDay ? getCurrentStreak(current.streak, `${current.lastQualifiedDay}T12:00:00+05:00`) : profile.streak || 0;
  const requirement = (metric: string, target: number) => {
    const units: Record<string, string> = {
      studyEvents: tr(target === 1 ? 'verified study event' : 'verified study events','tasdiqlangan o‘qish hodisasi','подтверждённых учебных событий'),
      longFocusSessions: tr(target === 1 ? 'Focus session of at least 25 minutes' : 'Focus sessions of at least 25 minutes','kamida 25 daqiqalik fokus mashg‘uloti','фокус-сессий от 25 минут'),
      focusSeconds: tr('verified Focus hours','tasdiqlangan fokus soati','подтверждённых часов фокуса'),
      recallBlocks: tr('active 10-card recall blocks','10 kartali faol eslash bloki','активных блоков по 10 карточек'),
      uniqueRecallCards: tr('distinct active recall cards','turli faol eslangan karta','уникальных активно повторённых карточек'),
      bestStreak: tr('consecutive qualifying study days','ketma-ket malakali o‘qish kuni','учебных дней подряд'),
      goalDays: tr('verified daily goals on different days','turli kundagi tasdiqlangan kunlik maqsad','подтверждённых дневных целей в разные дни'),
      balancedDays: tr('days with 10 Focus minutes and 10 active cards','10 fokus daqiqasi va 10 faol kartali kun','дней с 10 минутами фокуса и 10 активными карточками'),
    };
    return `${metric === 'focusSeconds' ? target / 3600 : target} ${units[metric]}`;
  };
  return <section aria-label={tr('XP and achievements','XP va yutuqlar','XP и достижения')} className="noviq-progression my-4 rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-4 text-[var(--noviq-text)] sm:p-5">
    {levelUp && <dialog ref={dialog} onClose={() => setLevelUp(null)} aria-labelledby="xp-level-up-title" className="m-auto max-w-sm rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6 text-[var(--noviq-text)] backdrop:bg-black/40"><h2 id="xp-level-up-title" className="text-xl font-bold">{tr('Level up!','Yangi daraja!','Новый уровень!')}</h2><p className="my-4">{levelUp.from} → {levelUp.to}</p><button type="button" autoFocus className="min-h-11 rounded-xl border px-4" onClick={() => dialog.current?.close()}>{tr('Continue','Davom etish','Продолжить')}</button></dialog>}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{tr('Level','Daraja','Уровень')} {info.level} · {info.name}</h2><p className="text-sm">{info.xp.toLocaleString()} {tr('total XP','jami XP','всего XP')} · {streak} {tr('day streak','kunlik seriya','дней подряд')}</p></div><a className="inline-flex min-h-11 items-center gap-2 underline" href="/profile"><Award size={18} aria-hidden="true"/>{Object.keys(achievements).length}/16 {tr('badges','nishon','значков')}</a></div>
    <label className="mt-3 block text-sm">{info.earned}/{info.required} XP · {info.percent.toFixed(0)}%<progress className="mt-2 block h-3 w-full accent-blue-600" aria-label={tr('Progress to the next level','Keyingi darajagacha natija','Прогресс до следующего уровня')} value={info.earned} max={info.required}/></label>
    <p className="mt-2 text-sm text-[var(--noviq-muted)]">{info.remaining} XP {tr('remaining','qoldi','осталось')} · {tr('Next level at','Keyingi daraja','Следующий уровень при')} {info.nextXp.toLocaleString()} XP</p>
    {error && <p role="status" className="mt-2 text-sm">{tr('History could not load. Your XP is shown above.','Tarix yuklanmadi. XP yuqorida ko‘rsatilgan.','История недоступна. Ваш XP показан выше.')} <button type="button" className="min-h-11 underline" onClick={() => {setRevision(n => n + 1); void checkInProgress().catch(() => setError(true));}}>{tr('Retry','Qayta urinish','Повторить')}</button></p>}
    {details ? <>
      <h3 className="mt-5 font-bold">{tr('Achievements','Yutuqlar','Достижения')}</h3>
      <div className="my-2 flex flex-wrap gap-2" role="group" aria-label={tr('Filter achievements','Yutuqlarni filtrlash','Фильтр достижений')}>{[['all',tr('All','Barchasi','Все')],['unlocked',tr('Unlocked','Ochilgan','Открытые')],['locked',tr('Locked','Qulflangan','Закрытые')]].map(([value,label]) => <button key={value} type="button" className="min-h-11 rounded-xl border border-[var(--noviq-border)] px-4" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ACHIEVEMENTS.map((item,index) => {
        const unlocked = achievements[item.id];
        if (filter === 'unlocked' && !unlocked || filter === 'locked' && unlocked) return null;
        const earned = Math.min(item.target,counters[item.metric] || 0);
        const title = locale === 'en' ? item.name : achievementNames[locale][index];
        const tier = item.tier === 'Bronze' ? tr('Bronze','Bronza','Бронза') : item.tier === 'Silver' ? tr('Silver','Kumush','Серебро') : item.tier === 'Gold' ? tr('Gold','Oltin','Золото') : tr('Platinum','Platina','Платина');
        const tone = item.tier === 'Bronze' ? 'text-orange-700 dark:text-orange-200' : item.tier === 'Silver' ? 'text-slate-600 dark:text-slate-200' : item.tier === 'Gold' ? 'text-amber-700 dark:text-amber-200' : 'text-violet-700 dark:text-violet-200';
        return <article key={item.id} className="rounded-xl border border-[var(--noviq-border)] p-3"><div className="flex items-center gap-2">{unlocked ? <Award className={tone} aria-hidden="true" size={22}/> : <LockKeyhole aria-hidden="true" size={18}/>}<h4 className="font-semibold">{title}</h4></div><p className="mt-1 text-sm">{tier} · +{item.xp} XP {tr('once','bir marta','однократно')}{['A11','A12'].includes(item.id) ? tr(' · includes streak bonus',' · seriya bonusi shu yerda',' · включает бонус серии') : ''}</p><p className="mt-2 text-sm text-[var(--noviq-muted)]">{requirement(item.metric,item.target)}</p><progress className="mt-2 block w-full accent-blue-600" aria-label={title} value={unlocked ? item.target : earned} max={item.target}/><p className="text-sm">{unlocked ? `${tr('Unlocked','Ochilgan','Открыто')} · ${new Date(unlocked.unlockedAt).toLocaleDateString(locale, { timeZone: 'Asia/Tashkent' })}` : `${item.metric === 'focusSeconds' ? (earned / 3600).toFixed(1) : earned}/${item.metric === 'focusSeconds' ? item.target / 3600 : item.target}`}</p></article>;
      })}</div>
      <h3 className="mt-5 font-bold">{tr('Recent XP history','Oxirgi XP tarixi','История XP')}</h3>
      <ul className="mt-2 space-y-2">{visibleEvents.slice(0,10).map(entry => <li key={entry.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--noviq-border)] py-2 text-sm"><span>{entry.dayKey} · {entry.source === 'focus' ? tr('Focus','Fokus','Фокус') : entry.source === 'recall' ? tr('Active recall','Faol eslash','Активное припоминание') : tr('Daily login','Kunlik kirish','Ежедневный вход')}</span><strong>+{entry.xpDelta} XP</strong></li>)}</ul>
      {!visibleEvents.length && <p className="mt-2 text-sm">{tr('New verified rewards will appear here. Existing XP is preserved.','Yangi tasdiqlangan mukofotlar shu yerda ko‘rinadi. Oldingi XP saqlangan.','Здесь появятся новые подтверждённые награды. Прежний XP сохранён.')}</p>}
      <p className="mt-3 text-sm">{tr('Source totals (recent events)','Manbalar bo‘yicha (oxirgi hodisalar)','По источникам (недавние события)')}: {['login','focus','recall'].map(source => `${source}: ${visibleEvents.filter(e=>e.source===source).reduce((sum,e)=>sum+e.xpDelta,0)} XP`).join(' · ')}</p>
      {days.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2">{tr('XP trend · last 7 active days','XP dinamikasi · oxirgi 7 faol kun','Динамика XP · последние 7 активных дней')}</summary><table className="w-full text-left text-sm"><thead><tr><th scope="col">{tr('Day','Kun','День')}</th><th scope="col">XP</th></tr></thead><tbody>{days.slice().reverse().map(day => <tr key={day.dayKey}><td className="py-2">{day.dayKey}</td><td>{(day.ordinaryXp || 0) + (day.bonusXp || 0)}</td></tr>)}</tbody></table></details>}
      {current?.levelHistory && <p className="mt-2 text-sm">{tr('Levels reached','Erishilgan darajalar','Достигнутые уровни')}: {Object.keys(current.levelHistory).join(', ') || '—'}</p>}
    </> : <p className="mt-2 text-sm">{tr('Confirmed XP today','Bugungi tasdiqlangan XP','Подтверждённый XP за сегодня')}: +{todayXp} XP · <a className="underline" href="/profile">{tr('View rewards','Mukofotlarni ko‘rish','Посмотреть награды')}</a></p>}
  </section>;
}
