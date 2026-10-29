import { dateKey, expandTasks, type SmartPlan } from '@/src/features/planner/smartPlannerModel';
import type { StudyEvidence } from './useStudyEvidence';

/** A daily view, not a reset of the saved plan or historical completions. */
export function dashboardDay(plan:SmartPlan|null,records:StudyEvidence[],now:number) {
  const zone=plan?.timezone||'Asia/Tashkent',today=dateKey(now,zone);
  const onToday=(time:number|undefined)=>Number.isFinite(time)&&dateKey(time!,zone)===today;
  const sessions=(plan?.sessions||[]).filter(s=>onToday(s.start)).sort((a,b)=>a.start-b.start);
  const planned=new Set(sessions.map(s=>s.taskId));
  const future=new Set((plan?.sessions||[]).filter(s=>dateKey(s.start,zone)>today).map(s=>s.taskId));
  const tasks=(plan?expandTasks({...plan,tasks:plan.tasks.map(t=>t.repeat==='daily'||t.repeat==='weekly'?t:{...t,repeat:'none'})},today):[]).filter(task=>{
    if(task.createdAt>now||task.notBefore&&dateKey(task.notBefore,zone)>today)return false;
    if(task.completed)return typeof task.completedAt==='number'?task.completedAt<=now&&onToday(task.completedAt):onToday(task.createdAt);
    if(task.parentId||task.repeat!=='none')return onToday(task.createdAt);
    return planned.has(task.id)||!future.has(task.id);
  });
  const ids=new Set(tasks.map(t=>t.id));
  const todaySessions=sessions.filter(s=>ids.has(s.taskId));
  const rows:{taskId:string;start?:number;end?:number}[]=[...todaySessions,...tasks.filter(t=>!planned.has(t.id)).map(t=>({taskId:t.id}))];
  const seconds=records.filter(r=>r.category==='focus'&&Date.parse(r.timestamp)<=now&&onToday(Date.parse(r.timestamp))&&Number.isFinite(r.duration)&&r.duration>0).reduce((sum,r)=>sum+r.duration,0);
  return {today,tasks,sessions:todaySessions,rows,completed:tasks.filter(t=>t.completed).length,focusMinutes:Math.floor(seconds/60)};
}
