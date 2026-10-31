import {proposeSchedule} from './smartSchedule';
import {addDays,buildSmartPreview,dateKey,localInstant,newId,type FocusReceipt,type SmartPlan,type SmartTask} from './smartPlannerModel';
export type PlanningStyle='hybrid'|'self';
export function aiPlanningSource(plan:SmartPlan,receipts:FocusReceipt[],pro:boolean,replan:boolean,now=Date.now()):SmartPlan {
  const removed=new Set(replan&&pro?plan.tasks.filter(t=>t.origin==='ai'&&!t.completed&&!receipts.some(r=>r.taskId===t.id)&&!plan.sessions.some(s=>s.taskId===t.id&&(s.start<=now||s.locked))).map(t=>t.id):[]);
  return {...plan,tasks:plan.tasks.filter(t=>!removed.has(t.id)),sessions:plan.sessions.filter(s=>!removed.has(s.taskId))};
}
export function planningContext(plan:SmartPlan,receipts:FocusReceipt[],style:PlanningStyle,pro:boolean,now=Date.now()){
  const days=pro?7:1,first=dateKey(now,plan.timezone),preview=buildSmartPreview(plan,receipts,now);
  return {style,timezone:plan.timezone,today:first,days,dailyLimit:plan.dailyLimit,sessionMinutes:plan.sessionMinutes,breakMinutes:plan.breakMinutes,
    subjects:plan.subjects.filter(s=>!s.paused).slice(0,15).map(s=>({id:s.id,name:s.name,mode:s.mode,target:s.target,deadline:s.deadline,priorities:s.priorities,materials:s.materials,roadmap:(s.roadmap||'').slice(0,1000)})),commitments:plan.commitments,availability:plan.windows,
    existingTasks:plan.tasks.filter(t=>!t.completed).slice(0,60).map(t=>({subjectId:t.subjectId,title:t.title,description:(t.description||'').slice(0,500),type:t.type,priority:t.priority,minutes:t.minutes,deadline:t.deadline})),
    spare:Array.from({length:days},(_,i)=>{const day=addDays(first,i),ranges=preview.windows.filter(w=>dateKey(w.start,plan.timezone)===day),planned=preview.sessions.filter(s=>dateKey(s.start,plan.timezone)===day).reduce((n,s)=>n+(s.end-s.start)/60000,0),actual=receipts.filter(r=>dateKey(r.timestamp,plan.timezone)===day).reduce((n,r)=>n+r.seconds/60,0);return {day,minutes:Math.max(0,Math.floor(Math.min(ranges.reduce((n,w)=>n+(w.end-w.start)/60000,0),plan.dailyLimit-actual)-planned))};})};
}
/** AI supplies task drafts; the deterministic scheduler controls actual placement. */
export function reviewAiPlan(plan:SmartPlan,receipts:FocusReceipt[],raw:string,pro:boolean,now=Date.now(),replan=false){
  if(typeof raw!=='string'||raw.length>80000)throw new Error('invalid');
  const parsed=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
  if(!parsed||typeof parsed.summary!=='string'||parsed.summary.length>1800||!Array.isArray(parsed.tasks)||parsed.tasks.length>(pro?28:6))throw new Error('invalid');
  const first=dateKey(now,plan.timezone),ids=new Set(plan.subjects.filter(s=>!s.paused).map(s=>s.id)),source=aiPlanningSource(plan,receipts,pro,replan,now);
  const seen=new Set(source.tasks.map(t=>t.subjectId+':'+t.title.trim().toLocaleLowerCase()));
  const drafts:SmartTask[]=parsed.tasks.map((t:any)=>{
    if(!t||!ids.has(t.subjectId)||typeof t.title!=='string'||!t.title.trim()||t.title.length>180||typeof t.description!=='string'||t.description.length>2000||!Number.isInteger(t.minutes)||t.minutes<5||t.minutes>90||!Number.isInteger(t.dayOffset)||t.dayOffset<0||t.dayOffset>=(pro?7:1))throw new Error('invalid');
    const key=t.subjectId+':'+t.title.trim().toLocaleLowerCase();if(seen.has(key))throw new Error('duplicate');seen.add(key);
    const day=addDays(first,t.dayOffset),subject=plan.subjects.find(s=>s.id===t.subjectId)!;
    return {id:newId(),origin:'ai',subjectId:t.subjectId,title:t.title.trim(),description:t.description,minutes:t.minutes,type:'Practice',priority:1,resource:'',flexibility:'flexible',repeat:'none',repeatUntil:'',createdAt:now,notBefore:Math.max(now,localInstant(day,'00:00',plan.timezone)),deadline:Math.min(localInstant(addDays(day,1),'00:00',plan.timezone),subject.deadline?localInstant(subject.deadline,'23:59',plan.timezone):Infinity),completed:false};
  });
  const budgets=planningContext(source,receipts,'hybrid',pro,now).spare.map(d=>Math.floor(d.minutes*.85));
  const withinBudget=drafts.filter(t=>{const day=Math.round((Date.parse(dateKey(t.notBefore!,plan.timezone))-Date.parse(first))/86400000);if((budgets[day]||0)<t.minutes)return false;budgets[day]-=t.minutes;return true;});
  const baseline=buildSmartPreview(source,receipts,now);
  const protectedEvents=[...baseline.protectedEvents,...source.sessions,...baseline.sessions].filter(s=>s.end>now).map(s=>({...s,start:Math.max(now,s.start)}));
  const schedule=(tasks:SmartTask[])=>proposeSchedule({now,windows:baseline.windows,protectedEvents,tasks,existing:[],sessionMinutes:source.sessionMinutes,breakMinutes:source.breakMinutes,dailyLimit:source.dailyLimit,dayKey:n=>dateKey(n,source.timezone),balanceDays:true});
  let result=schedule(withinBudget);
  const feasible=withinBudget.filter(t=>result.sessions.filter(s=>s.taskId===t.id).reduce((n,s)=>n+(s.end-s.start)/60000,0)>=t.minutes);
  result=schedule(feasible);
  const newSessions=result.sessions.map(s=>({...s,locked:false}));
  return {plan:{...source,tasks:[...source.tasks,...feasible],sessions:[...source.sessions,...newSessions]},summary:parsed.summary,added:feasible.length,omitted:drafts.length-feasible.length};
}
