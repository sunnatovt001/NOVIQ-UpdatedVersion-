import { SyncNotice } from "@/src/features/progression/SyncNotice";
import { navigateToPage } from '@/src/lib/navigation';
import React, {useMemo, useState} from 'react';
import {Clock, CheckCircle2, Flame, Layers, ChartNoAxesColumn, Compass, ArrowRight} from 'lucide-react';
import {useAuth} from '@/src/contexts/AuthContext';
import {useLocale} from '@/src/contexts/LocaleContext';
import {useUserActivityMetrics} from '@/src/lib/useUserActivityMetrics';
import {useStudyEvidence} from '@/src/features/pro/useStudyEvidence';
import {activityDay, actualDuration} from '@/src/features/pro/activitySummary';
import {missionCompletion} from '@/src/lib/activityEvidence';
import {getAnalyticsCopy} from '@/src/features/analytics/analyticsCopy';
import './free-progress.css';

const dayDate=(key:string)=>new Date(`${key}T12:00:00Z`);
const shift=(key:string,offset:number)=>{const d=dayDate(key);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
export const Analytics=({setActiveTab}:{setActiveTab?:(tab:string)=>void})=>{
 const {user,profile}=useAuth(),{locale}=useLocale(),copy=getAnalyticsCopy(locale);
 const evidence=useStudyEvidence(user?.uid),metrics=useUserActivityMetrics(user?.uid);
 const [period,setPeriod]=useState<'week'|'month'>('week');
 const t=(en:string,uz:string,ru:string)=>locale==='uz'?uz:locale==='ru'?ru:en;
 const today=activityDay(Date.now()),weekStart=shift(today,-((dayDate(today).getUTCDay()+6)%7));
 const monthStart=`${today.slice(0,7)}-01`,daysInMonth=new Date(Date.UTC(dayDate(today).getUTCFullYear(),dayDate(today).getUTCMonth()+1,0)).getUTCDate();
 const start=period==='week'?weekStart:monthStart,count=period==='week'?7:daysInMonth;
 const totals=useMemo(()=>{const map=new Map<string,number>();for(const s of evidence.records){const key=activityDay(Date.parse(s.timestamp));map.set(key,(map.get(key)||0)+s.duration);}return map;},[evidence.records]);
 const days=Array.from({length:count},(_,i)=>{const key=shift(start,i);return {key,label:period==='week'?copy.dayLabels[i]:String(i+1),seconds:totals.get(key)||0};});
 const seconds=days.reduce((sum,d)=>sum+d.seconds,0),dailyTarget=profile?.dailyTargetMinutes||30,target=dailyTarget*count*60;
 const ready=evidence.ready&&!evidence.error,metricReady=!metrics.loading&&!metrics.error;
 const percent=Math.min(100,Math.round(seconds/Math.max(target,1)*100)),maxMinutes=Math.max(60,...days.map(d=>Math.ceil(d.seconds/60/30)*30));
 const heat=Array.from({length:35},(_,i)=>{const key=shift(weekStart,i-28),value=totals.get(key)||0;return {key,value,future:key>today,intensity:value<=0?0:Math.min(4,Math.ceil(value/60/Math.max(dailyTarget,1)*4))};});
 const recent=[...evidence.records].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,3);
 const coverage=missionCompletion(metrics.flashcardsCreated,metrics.reviewedCards);
 const duration=(s:number)=>actualDuration(s,locale);
 const go=(tab:string)=>setActiveTab?setActiveTab(tab):navigateToPage(`/${tab}`);
 const retry=()=>{evidence.retry();metrics.retry();};
 const stats=[{icon:Clock,value:ready?duration(seconds):'—',label:period==='week'?t('Study time this week','Shu haftadagi o‘qish vaqti','Время учёбы за неделю'):t('Study time this month','Shu oydagi o‘qish vaqti','Время учёбы за месяц')},{icon:CheckCircle2,value:metricReady?metrics.tasksDone:'—',label:t('Tasks completed · all time','Bajarilgan vazifalar · jami','Задач выполнено · всего')},{icon:Flame,value:metricReady?`${metrics.streak} ${t('days','kun','дн.')}`:'—',label:copy.currentStreak},{icon:Layers,value:metricReady&&coverage!==null?`${coverage}%`:'—',label:copy.reviewCoverage}];
 return <div className="free-progress">
  <header className="fp-heading"><div><h1>{t('See your progress.','Natijalaringizni kuzating.','Следите за прогрессом.')}</h1><p>{t('Every focused minute is a step forward.','Har bir diqqatli daqiqa — oldinga qadam.','Каждая минута сосредоточенности — шаг вперёд.')}</p></div><div className="fp-period" role="group" aria-label={t('Reporting period','Hisobot davri','Период отчёта')}>{(['week','month'] as const).map(p=><button key={p} type="button" aria-pressed={period===p} onClick={()=>setPeriod(p)}>{p==='week'?t('Week','Hafta','Неделя'):t('Month','Oy','Месяц')}</button>)}</div></header>
  {!evidence.ready&&<p role="status" className="fp-notice">{copy.loading}</p>}
  {(metrics.error||evidence.error)&&<SyncNotice message={metrics.error||copy.historyError} onRefresh={retry}/>}
  {evidence.deviceSeconds>0&&<p role="status" className="fp-notice">{t('Includes recorded activity saved only on this device.','Qurilmada saqlangan faoliyat ham kiritilgan.','Включена активность, сохранённая на устройстве.')}</p>}
  <section className="fp-stats" aria-label={t('Progress summary','Natijalar xulosasi','Сводка прогресса')}>{stats.map(({icon:Icon,value,label})=><div key={label}><Icon size={25}/><p><strong>{value}</strong><span>{label}</span></p></div>)}</section>
  <div className="fp-top-grid"><section className="fp-panel fp-rhythm"><h2>{t('Your study rhythm','O‘qish ritmingiz','Ваш учебный ритм')}</h2><p>{t('Focus minutes','Diqqat daqiqalari','Минуты концентрации')} · {period==='week'?copy.thisWeek:t('This month','Shu oy','В этом месяце')}</p><div className="fp-chart" role="img" aria-label={ready?days.map(d=>`${d.label}: ${duration(d.seconds)}`).join(', '):copy.loading}><div className="fp-axis"><span>{maxMinutes}</span><span>{maxMinutes/2}</span><span>0</span></div><div className="fp-plot"><div className="fp-gridlines"><i/><i/><i/></div><div className="fp-bars">{days.map(d=><div key={d.key}><div className="fp-bar-space"><span style={{height:ready?`${d.seconds/60/maxMinutes*100}%`:'0%'}} title={`${d.key}: ${duration(d.seconds)}`}/></div><span className="fp-day">{d.label}</span></div>)}</div></div></div>{ready&&seconds===0&&<div className="fp-chart-empty"><ChartNoAxesColumn size={23}/><p>{t('Your first session starts the story.','Birinchi mashg‘ulotdan boshlang.','Начните историю с первого занятия.')}</p><button onClick={()=>go('focus')}>{t('Start a focus session','Fokus mashg‘ulotini boshlash','Начать фокус-сессию')}</button></div>}</section>
  <section className="fp-panel fp-goal"><h2>{period==='week'?t('Weekly goal','Haftalik maqsad','Цель на неделю'):t('Monthly goal','Oylik maqsad','Цель на месяц')}</h2><div className="fp-ring" role="img" aria-label={ready?`${percent}%`:copy.loading} style={{background:`conic-gradient(#345cff ${ready?percent:0}%, var(--fp-tint) 0)`}}><strong>{ready?`${percent}%`:'—'}</strong></div><strong>{ready?`${Math.round(seconds/60)} / ${Math.round(target/60)} ${t('min','daq','мин')}`:'—'}</strong><p>{t('Your study time goal','O‘qish vaqti maqsadingiz','Ваша цель по времени учёбы')}</p><p className="fp-goal-hint">{t('Small, consistent steps lead to big results.','Kichik, muntazam qadamlar katta natijaga olib boradi.','Маленькие регулярные шаги ведут к большим результатам.')}</p><button className="fp-outline" onClick={()=>go('planner')}>{t('Open Planner','Plannerni ochish','Открыть планировщик')}</button></section></div>
  <div className="fp-bottom-grid"><section className="fp-panel fp-consistency"><div className="fp-section-head"><div><h2>{t('Consistency','Muntazamlik','Регулярность')}</h2><p>{t('Last 5 weeks · a little more often.','So‘nggi 5 hafta · oz-ozdan, tez-tez.','Последние 5 недель · понемногу, но чаще.')}</p></div><div className="fp-legend"><span>{t('Less','Kam','Меньше')}</span>{[0,1,2,3,4].map(i=><i key={i} className={`fp-intensity-${i}`}/>)}<span>{t('More','Ko‘p','Больше')}</span></div></div><div className="fp-heat-labels">{copy.dayLabels.map((d,i)=><span key={i}>{d}</span>)}</div><div className="fp-heat">{heat.map(d=><div key={d.key} className={`fp-cell fp-intensity-${ready?d.intensity:0} ${d.future?'fp-future':''}`} tabIndex={0} role="img" title={`${d.key}: ${ready?duration(d.value):'—'}`} aria-label={`${d.key}: ${ready?duration(d.value):'—'}`}/>)}</div></section>
  <section className="fp-panel fp-recent"><h2>{t('Recent activity','So‘nggi faoliyat','Недавняя активность')}</h2>{ready&&recent.length?<ul>{recent.map(s=><li key={s.id}><span className="fp-session-icon"><Clock size={18}/></span><div><strong>{s.subject||s.category}</strong><small>{new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tashkent',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s.timestamp))}</small></div><span>{duration(s.duration)}</span></li>)}</ul>:<div className="fp-recent-empty"><Clock size={60}/><h3>{ready?t('No sessions yet','Hali mashg‘ulot yo‘q','Занятий пока нет'):!evidence.ready?copy.loading:copy.historyError}</h3><p>{ready?t('Completed focus sessions will appear here.','Yakunlangan mashg‘ulotlar shu yerda ko‘rinadi.','Здесь появятся завершённые занятия.'):''}</p></div>}</section></div>
  <section className="fp-panel fp-next"><Compass size={32}/><div><h2>{t('Your next step','Keyingi qadamingiz','Ваш следующий шаг')}</h2><p>{t('Choose one task and make room for 25 focused minutes.','Bitta vazifani tanlang va 25 diqqatli daqiqa ajrating.','Выберите задачу и выделите 25 минут концентрации.')}</p></div><button className="fp-primary" onClick={()=>go('planner')}>{t('Plan my next session','Keyingi mashg‘ulotni rejalash','Запланировать занятие')}<ArrowRight size={17}/></button></section>
  <p className="fp-footnote">{t('Study time reflects recorded activity, not mastery.','O‘qish vaqti qayd etilgan faoliyatni ko‘rsatadi, bilim darajasini emas.','Время учёбы отражает записанную активность, а не уровень знаний.')}</p>
 </div>;
};
