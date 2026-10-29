import { useActivityClock } from "@/src/lib/useActivityClock";
import { SyncNotice } from "@/src/features/progression/SyncNotice";
import { navigateToPage } from '@/src/lib/navigation';
import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Flame, Sparkles } from 'lucide-react';
import { useLocale } from '@/src/contexts/LocaleContext';
import type { StudyEvidence } from '@/src/features/pro/useStudyEvidence';
import type { UserActivityMetrics } from '@/src/lib/useUserActivityMetrics';
import { activityDay, actualDuration } from '@/src/features/pro/activitySummary';
import { getAnalyticsCopy, formatAnalyticsCopy } from './analyticsCopy';
import './glass-progress.css';

type Props = { sessions: StudyEvidence[]; ready: boolean; loading: boolean; error: string; deviceSeconds: number; retry: () => void; metrics: UserActivityMetrics; dailyTargetMinutes: number; navigate?: (tab: string) => void };
const words = {
  en: { today:'Today', title:'Your progress', subtitle:'Every focused minute moves you forward.', workspace:'Workspace', progress:'Progress', week:'Week', month:'Month', monthTitle:'This month', goal:'of your {goal} goal', remaining:'{time} to your goal', achieved:'Goal reached. Keep your rhythm.', continue:'Continue learning', tasks:'Tasks completed', allTime:'All time', rhythm:'Study rhythm', rhythmHint:'Focused time, day by day', minutes:'min', recorded:'{time} of focused study', consistency:'Consistency', consistencyHint:'Last 5 weeks · daily study time', less:'Less', more:'More', recent:'Recent sessions', subject:'Subject', date:'Date & time', duration:'Duration', next:'Your next step', nextText:'Make room for one focused session.', planner:'Open Planner', device:'Includes activity saved only on this device.' },
  uz: { today:'Bugun', title:'Sizning natijalaringiz', subtitle:'Har bir diqqatli daqiqa sizni oldinga olib boradi.', workspace:'Ish maydoni', progress:'Natijalar', week:'Hafta', month:'Oy', monthTitle:'Shu oy', goal:'{goal} maqsadingizdan', remaining:'Maqsadgacha {time}', achieved:'Maqsadga erishdingiz. Davom eting.', continue:'O‘qishni davom ettirish', tasks:'Bajarilgan vazifalar', allTime:'Barcha vaqt', rhythm:'O‘qish ritmi', rhythmHint:'Kunlik diqqat bilan o‘qish vaqti', minutes:'daq', recorded:'{time} diqqatli o‘qish', consistency:'Muntazamlik', consistencyHint:'So‘nggi 5 hafta · kunlik o‘qish vaqti', less:'Kam', more:'Ko‘p', recent:'Oxirgi mashg‘ulotlar', subject:'Fan', date:'Sana va vaqt', duration:'Davomiylik', next:'Keyingi qadamingiz', nextText:'Bitta diqqatli mashg‘ulot uchun vaqt ajrating.', planner:'Rejalashtirishni ochish', device:'Qurilmada saqlangan faoliyat ham kiritilgan.' },
  ru: { today:'Сегодня', title:'Ваш прогресс', subtitle:'Каждая минута сосредоточенности двигает вас вперёд.', workspace:'Рабочая область', progress:'Прогресс', week:'Неделя', month:'Месяц', monthTitle:'Этот месяц', goal:'из вашей цели {goal}', remaining:'До цели {time}', achieved:'Цель достигнута. Продолжайте в том же ритме.', continue:'Продолжить учёбу', tasks:'Задач выполнено', allTime:'За всё время', rhythm:'Ритм обучения', rhythmHint:'Время сосредоточенной учёбы по дням', minutes:'мин', recorded:'{time} сосредоточенной учёбы', consistency:'Регулярность', consistencyHint:'Последние 5 недель · время учёбы по дням', less:'Меньше', more:'Больше', recent:'Недавние занятия', subject:'Предмет', date:'Дата и время', duration:'Длительность', next:'Ваш следующий шаг', nextText:'Выделите время для одного занятия.', planner:'Открыть планировщик', device:'Включена активность, сохранённая на устройстве.' },
};
const dayDate = (key: string) => new Date(`${key}T12:00:00Z`);
const shift = (key: string, offset: number) => { const date=dayDate(key); date.setUTCDate(date.getUTCDate()+offset); return date.toISOString().slice(0,10); };

export function GlassProgress({sessions, ready, loading, error, deviceSeconds, retry, metrics, dailyTargetMinutes, navigate}: Props) {
  const {locale}=useLocale(), text=words[locale], copy=getAnalyticsCopy(locale);
  const [period,setPeriod]=useState<'today'|'week'|'month'>('today');
  const now=useActivityClock(),today=activityDay(now);
  const weekStart=shift(today,-((dayDate(today).getUTCDay()+6)%7));
  const monthStart=`${today.slice(0,7)}-01`;
  const daysInMonth=new Date(Date.UTC(dayDate(today).getUTCFullYear(),dayDate(today).getUTCMonth()+1,0)).getUTCDate();
  const start=period==='today'?today:period==='week'?weekStart:monthStart;
  const numberOfDays=period==='today'?1:period==='week'?7:daysInMonth;
  const periodTitle=period==='today'?text.today:period==='week'?copy.thisWeek:text.monthTitle;
  const totals=useMemo(()=>{const map=new Map<string,number>(); for(const s of sessions){const key=activityDay(Date.parse(s.timestamp));map.set(key,(map.get(key)||0)+s.duration);}return map;},[sessions]);
  const days=Array.from({length:numberOfDays},(_,i)=>{const key=shift(start,i);return {key,seconds:totals.get(key)||0,label:period==='today'?text.today:period==='week'?copy.dayLabels[i]:String(i+1)};});
  const seconds=days.reduce((sum,d)=>sum+d.seconds,0);
  const target=dailyTargetMinutes*numberOfDays*60;
  const percent=Math.min(100,Math.round(seconds/Math.max(target,1)*100));
  const maxMinutes=Math.max(30,...days.map(d=>Math.ceil(d.seconds/60/15)*15));
  const peak=Math.max(...days.map(d=>d.seconds));
  // Five complete Monday–Sunday rows, ending with the current week. Future dates stay distinct.
  const heatStart=shift(weekStart,-28);
  const heat=Array.from({length:35},(_,i)=>{const key=shift(heatStart,i),minutes=(totals.get(key)||0)/60;return {key,minutes,future:key>today,intensity:minutes<=0?0:Math.min(4,Math.ceil(minutes/Math.max(dailyTargetMinutes,1)*4))};});
  const recent=[...sessions].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,3);
  const go=(tab:string)=>navigate?navigate(tab):navigateToPage(`/${tab}`);
  const duration=(value:number)=>actualDuration(value,locale);
  const metricReady=!metrics.loading&&!metrics.error;
  return <div className="gp-page">
    <header className="gp-heading"><div><p className="gp-breadcrumb">{text.workspace}<span>/</span>{text.progress}</p><h1>{text.title}</h1><p>{text.subtitle}</p></div><div className="gp-period" role="group" aria-label={copy.productivityFlow}>{(['today','week','month'] as const).map(p=><button type="button" key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)}>{text[p]}</button>)}</div></header>
    {loading&&<p role="status" className="gp-notice">{copy.loading}</p>}
    {(error||metrics.error)&&<SyncNotice message={error||metrics.error||''} onRefresh={retry}/>}

    <section className="gp-hero gp-panel" aria-label={periodTitle}>
      <div className="gp-total"><h2>{periodTitle}</h2><strong>{ready?duration(seconds):'—'}</strong><p>{formatAnalyticsCopy(text.goal,{goal:duration(target)})}</p><div className="gp-goal-line"><progress aria-label={periodTitle} value={ready?percent:0} max={100}/><span>{ready?`${percent}%`:'—'}</span></div><div className="gp-hero-action"><button type="button" className="gp-primary" onClick={()=>go('focus')}>{text.continue}<ArrowRight size={19}/></button><span>{ready?(seconds>=target?text.achieved:formatAnalyticsCopy(text.remaining,{time:duration(target-seconds)})):'—'}</span></div></div>
      <div className="gp-stat"><Flame className="gp-flame" size={35}/><strong>{metricReady?formatAnalyticsCopy(copy.streakDays,{count:metrics.streak,unit:metrics.streak===1?copy.day:copy.days}):'—'}</strong><span>{copy.currentStreak}</span></div>
      <div className="gp-stat"><CheckCircle2 size={34}/><strong>{metricReady?metrics.tasksDone:'—'}</strong><span>{text.tasks}</span><small>{text.allTime}</small></div>
    </section>
    <div className="gp-chart-grid">
      <section className="gp-panel gp-rhythm"><h2>{text.rhythm}</h2><p>{text.rhythmHint}</p><div className="gp-chart" role="img" aria-label={ready?days.map(d=>`${d.label}: ${duration(d.seconds)}`).join(', '):copy.loading}>
        <div className="gp-axis"><span>{maxMinutes} {text.minutes}</span><span>{maxMinutes/2} {text.minutes}</span><span>0 {text.minutes}</span></div><div className="gp-plot"><div className="gp-gridlines"><i/><i/><i/></div><div className="gp-bars">{days.map(d=><div key={d.key} className="gp-bar-column"><div className="gp-bar-area"><span className={`gp-bar ${d.seconds===peak&&peak>0?'gp-peak':''}`} style={{height:ready?`${d.seconds/60/maxMinutes*100}%`:'0%'}}><span>{ready&&d.seconds>0?`${Math.round(d.seconds/60)} ${text.minutes}`:''}</span></span></div><span className="gp-day">{d.label}</span></div>)}</div></div></div><p className="gp-chart-summary">{ready?formatAnalyticsCopy(text.recorded,{time:duration(seconds)}):'—'}</p></section>
      <section className="gp-panel gp-consistency"><h2>{text.consistency}</h2><p>{text.consistencyHint}</p><div className="gp-heat-labels">{copy.dayLabels.map((day,i)=><span key={i}>{day}</span>)}</div><div className="gp-heat">{heat.map(d=><div key={d.key} className={`gp-cell gp-intensity-${ready?d.intensity:0} ${d.future?'gp-future':''}`} tabIndex={0} role="img" aria-label={`${d.key}: ${ready?duration(d.minutes*60):'—'}`} title={`${d.key}: ${ready?duration(d.minutes*60):'—'}`}/>)}</div><div className="gp-legend"><span>{text.less}</span>{[0,1,2,3,4].map(i=><i className={`gp-intensity-${i}`} key={i}/>)}<span>{text.more}</span></div></section>
    </div>
    <div className="gp-bottom-grid"><section className="gp-panel gp-recent"><h2>{text.recent}</h2>{ready&&recent.length?<table><thead><tr><th>{text.subject}</th><th>{text.date}</th><th>{text.duration}</th></tr></thead><tbody>{recent.map((s,i)=><tr key={s.id}><td><span className={`gp-subject gp-subject-${i}`}><BookOpen size={18}/></span><span>{s.subject||s.category}</span></td><td>{new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tashkent',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s.timestamp))}</td><td>{duration(s.duration)}</td></tr>)}</tbody></table>:<p className="gp-empty">{ready?copy.noSessions:loading?copy.loading:copy.historyError}</p>}</section><section className="gp-panel gp-next"><h2><Sparkles size={27}/>{text.next}</h2><p>{text.nextText}</p><button type="button" className="gp-primary" onClick={()=>go('planner')}>{text.planner}<ArrowRight size={20}/></button></section></div>
    {sessions.some(s=>s.origin==='device'&&activityDay(Date.parse(s.timestamp))>=start&&activityDay(Date.parse(s.timestamp))<=today)&&<details className="gp-data-note"><summary>{locale==='uz'?'Ma’lumotlar sinxronlashuvi':locale==='ru'?'Синхронизация данных':'Data sync'}</summary><p>{text.device}</p></details>}
  </div>;
}
