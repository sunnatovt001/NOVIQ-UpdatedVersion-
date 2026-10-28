import React from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLocale } from '@/src/contexts/LocaleContext';
import { useSmartPlanner } from './useSmartPlanner';
import { getSmartCopy } from './smartPlannerCopy';
import { dateKey, addDays } from './smartPlannerModel';
import './smartPlanner.css';

/** Planner time is displayed separately from verified activity totals to avoid double-counting. */
export function SmartPlannerInsights() {
  const {user}=useAuth();const {locale}=useLocale();const {plan,receipts}=useSmartPlanner(user?.uid);const c=getSmartCopy(locale);
  if(!plan?.ready)return null;
  let first:string;try{first=dateKey(Date.now(),plan.timezone);}catch{return null;}
  const weekStart=addDays(first,-((new Date(`${first}T12:00Z`).getUTCDay()+6)%7));const weekEnd=addDays(weekStart,7);
  const thisWeek=(instant:number)=>{const day=dateKey(instant,plan.timezone);return day>=weekStart && day<weekEnd;};
  const planned=plan.sessions.filter(s=>thisWeek(s.start)).reduce((sum,s)=>sum+(s.end-s.start)/60000,0);
  const actual=receipts.filter(r=>thisWeek(r.timestamp)).reduce((sum,r)=>sum+r.seconds/60,0);
  const completed=plan.tasks.filter(t=>t.completedAt && thisWeek(t.completedAt));
  return <section className="smart-planner sp-panel" aria-label={c.progress}><h2>{c.title} · {weekStart}</h2><div className="sp-summary"><div><strong>{Math.round(planned)}</strong><span>{c.planned}</span></div><div><strong>{Math.round(actual)}</strong><span>{c.actual}</span></div><div><strong>{completed.length}</strong><span>{c.completion}</span></div></div><p>{c.observed}</p><a href="/planner" className="sp-text">{c.preview}</a></section>;
}
