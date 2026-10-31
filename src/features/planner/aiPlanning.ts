import {dailyPlanningSource,dueReviewTasks,dayParts,period,studyDemand,topicKey,taskTopic} from './adaptivePlanning';
import {proposeSchedule} from './smartSchedule';
import {addDays,buildSmartPreview,dateKey,localInstant,newId,type FocusReceipt,type SmartPlan,type SmartTask} from './smartPlannerModel';
export type PlanningStyle='hybrid'|'self';
export function aiPlanningSource(plan:SmartPlan,receipts:FocusReceipt[],pro:boolean,replan:boolean,now=Date.now()):SmartPlan {
  const removed=new Set(replan&&pro?plan.tasks.filter(t=>t.origin==='ai'&&!t.completed&&!receipts.some(r=>r.taskId===t.id)&&!plan.sessions.some(s=>s.taskId===t.id&&(s.start<=now||s.locked))).map(t=>t.id):[]);
  return {...plan,tasks:plan.tasks.filter(t=>!removed.has(t.id)),sessions:plan.sessions.filter(s=>!removed.has(s.taskId))};
}
export function planningContext(plan:SmartPlan,receipts:FocusReceipt[],style:PlanningStyle,pro:boolean,now=Date.now(),preview=buildSmartPreview(plan,receipts,now)){
  const days=pro?7:1,first=dateKey(now,plan.timezone);
  const context={style,timezone:plan.timezone,today:first,days,dailyLimit:plan.dailyLimit,sessionMinutes:plan.sessionMinutes,breakMinutes:plan.breakMinutes,energyPreference:plan.preference,
    subjects:plan.subjects.filter(s=>!s.paused).slice(0,15).map(s=>({id:s.id,name:s.name,mode:s.mode,target:s.target,deadline:s.deadline,priorities:s.priorities,materials:s.materials,roadmap:(s.roadmap||'').slice(0,1000),topicProgress:(s.topics||[]).slice().sort((a,b)=>a.nextReviewAt-b.nextReviewAt).slice(0,12).map(t=>({key:t.key,rating:t.rating,nextReviewAt:t.nextReviewAt}))})),commitments:plan.commitments.slice(0,30),availability:plan.windows.slice(0,30),
    existingTasks:plan.tasks.filter(t=>!t.completed).slice(0,60).map(t=>({subjectId:t.subjectId,title:t.title,description:(t.description||'').slice(0,500),type:t.type,priority:t.priority,minutes:t.minutes,deadline:t.deadline})),
    spare:Array.from({length:days},(_,i)=>{const day=addDays(first,i),ranges=preview.windows.filter(w=>dateKey(w.start,plan.timezone)===day),planned=preview.sessions.filter(s=>dateKey(s.start,plan.timezone)===day).reduce((n,s)=>n+(s.end-s.start)/60000,0),actual=receipts.filter(r=>dateKey(r.timestamp,plan.timezone)===day).reduce((n,r)=>n+r.seconds/60,0);return {day,minutes:Math.max(0,Math.floor(Math.min(ranges.reduce((n,w)=>n+(w.end-w.start)/60000,0),plan.dailyLimit-actual)-planned))};})};
  while(JSON.stringify(context).length>36000&&context.existingTasks.length>10)context.existingTasks.pop();
  if(JSON.stringify(context).length>36000)for(const subject of context.subjects){subject.roadmap=subject.roadmap.slice(0,120);subject.topicProgress=subject.topicProgress.slice(0,4);}
  return context;
}

function scheduleAiTasks(source:SmartPlan,receipts:FocusReceipt[],tasks:SmartTask[],now:number,baseline=buildSmartPreview(source,receipts,now)){
  const protectedEvents=[...baseline.protectedEvents,...source.sessions,...baseline.sessions].filter(s=>s.end>now).map(s=>({...s,start:Math.max(now,s.start)}));
  return proposeSchedule({now,windows:dayParts(source,baseline.windows),protectedEvents,tasks:tasks.map(t=>({...t,split:source.split&&t.minutes>source.sessionMinutes})),existing:[],sessionMinutes:source.sessionMinutes,breakMinutes:source.breakMinutes,dailyLimit:source.dailyLimit,dayKey:n=>dateKey(n,source.timezone),balanceDays:true,balancePeriods:true,periodKey:n=>dateKey(n,source.timezone)+':'+period(n,source.timezone),taskPreferenceScore:(assignment,n)=>{
    const task=assignment as SmartTask,part=period(n,source.timezone);
    const preferred=task.preferredPeriod!=='any'?task.preferredPeriod:task.demand==='deep'?source.preference:task.demand==='practice'?'afternoon':'any';
    const existingMinutes=source.sessions.filter(s=>dateKey(s.start,source.timezone)===dateKey(n,source.timezone)&&period(s.start,source.timezone)===part).reduce((sum,s)=>sum+(s.end-s.start)/60000,0);
    return (preferred==='any'||preferred===part?0:task.demand==='deep'?100:45)+existingMinutes*.5;
  }});
}
export function rebalanceAiSessions(plan:SmartPlan,receipts:FocusReceipt[],now=Date.now()):SmartPlan {
  const movable=plan.tasks.filter(t=>t.origin==='ai'&&!t.completed&&!plan.subjects.find(s=>s.id===t.subjectId)?.paused&&!receipts.some(r=>r.taskId===t.id)&&!plan.sessions.some(s=>s.taskId===t.id&&(s.locked||(s.start<=now&&s.end>now)))&&plan.sessions.some(s=>s.taskId===t.id&&s.start>now));
  if(!movable.length)return plan;
  const ids=new Set(movable.map(t=>t.id));
  const kept=plan.sessions.filter(s=>!ids.has(s.taskId)||s.start<=now);
  const source={...plan,tasks:plan.tasks.filter(t=>!ids.has(t.id)),sessions:kept};
  const assignments=movable.map(t=>({...t,demand:t.demand||studyDemand(t.title),preferredPeriod:t.preferredPeriod||'any' as const,priority:(t.demand||studyDemand(t.title))==='deep'?3:(t.demand||studyDemand(t.title))==='practice'?2:1}));
  const result=scheduleAiTasks(source,receipts,assignments,now);
  if(assignments.some(t=>result.sessions.filter(s=>s.taskId===t.id).reduce((sum,s)=>sum+(s.end-s.start)/60000,0)<t.minutes))return plan;
  return {...plan,sessions:[...kept,...result.sessions]};
}

/** AI supplies task drafts; the deterministic scheduler controls actual placement. */
export function reviewAiPlan(plan:SmartPlan,receipts:FocusReceipt[],raw:string,pro:boolean,now=Date.now(),replan=false,daily=false){
  if(typeof raw!=='string'||raw.length>80000)throw new Error('invalid');
  const parsed=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
  if(!parsed||typeof parsed.summary!=='string'||parsed.summary.length>1800||!Array.isArray(parsed.tasks)||parsed.tasks.length>(pro?28:6))throw new Error('invalid');
  const first=dateKey(now,plan.timezone),ids=new Set(plan.subjects.filter(s=>!s.paused).map(s=>s.id)),source=daily?rebalanceAiSessions(dailyPlanningSource(aiPlanningSource(plan,receipts,pro,replan,now),receipts,now),receipts,now):aiPlanningSource(plan,receipts,pro,replan,now);
  const seen=new Set(source.tasks.filter(t=>!t.completed).map(t=>t.subjectId+':'+t.title.trim().toLocaleLowerCase()));
  const drafts:SmartTask[]=parsed.tasks.map((t:any)=>{
    if(!t||!ids.has(t.subjectId)||typeof t.title!=='string'||!t.title.trim()||t.title.length>180||typeof t.description!=='string'||t.description.length>2000||!Number.isInteger(t.minutes)||t.minutes<5||t.minutes>90||!Number.isInteger(t.dayOffset)||t.dayOffset<0||t.dayOffset>=(pro?7:1))throw new Error('invalid');
    const key=t.subjectId+':'+t.title.trim().toLocaleLowerCase();if(seen.has(key))throw new Error('duplicate');seen.add(key);
    if(t.topic!==undefined&&(typeof t.topic!=='string'||!t.topic.trim()||t.topic.length>100))throw new Error('invalid');
    if(t.demand!==undefined&&!['deep','practice','review'].includes(t.demand))throw new Error('invalid');
    if(t.preferredPeriod!==undefined&&!['morning','afternoon','evening','any'].includes(t.preferredPeriod))throw new Error('invalid');
    const day=addDays(first,t.dayOffset),subject=plan.subjects.find(s=>s.id===t.subjectId)!;
    return {id:newId(),origin:'ai',topic:topicKey(t.topic||t.title),demand:t.demand||studyDemand(t.title),preferredPeriod:t.preferredPeriod||'any',subjectId:t.subjectId,title:t.title.trim(),description:t.description,minutes:t.minutes,type:'Practice',priority:(t.demand||studyDemand(t.title))==='deep'?3:(t.demand||studyDemand(t.title))==='practice'?2:1,resource:'',flexibility:'flexible',repeat:'none',repeatUntil:'',createdAt:now,notBefore:Math.max(now,localInstant(day,'00:00',plan.timezone)),deadline:Math.min(localInstant(addDays(day,1),'00:00',plan.timezone),subject.deadline?localInstant(subject.deadline,'23:59',plan.timezone):Infinity),completed:false};
  });
  const due=dueReviewTasks(source,now,pro?7:1);
  const dueKeys=new Set(due.map(t=>t.subjectId+':'+taskTopic(t)));
  const eligible=drafts.filter(t=>{const progress=source.subjects.find(s=>s.id===t.subjectId)?.topics?.find(p=>p.key===taskTopic(t));return !dueKeys.has(t.subjectId+':'+taskTopic(t))&&(!progress||progress.nextReviewAt<t.deadline!);});
  const candidates=[...due,...eligible].slice(0,pro?28:6);
  const baseline=buildSmartPreview(source,receipts,now);
  const budgets=planningContext(source,receipts,'hybrid',pro,now,baseline).spare.map(d=>Math.floor(d.minutes*.85));
  const withinBudget=candidates.filter(t=>{const day=Math.round((Date.parse(dateKey(t.notBefore!,plan.timezone))-Date.parse(first))/86400000);if((budgets[day]||0)<t.minutes)return false;budgets[day]-=t.minutes;return true;});
  let result=scheduleAiTasks(source,receipts,withinBudget,now,baseline);
  const feasible=withinBudget.filter(t=>result.sessions.filter(s=>s.taskId===t.id).reduce((n,s)=>n+(s.end-s.start)/60000,0)>=t.minutes);
  result=scheduleAiTasks(source,receipts,feasible,now,baseline);
  const newSessions=result.sessions.map(s=>({...s,locked:false}));
  return {plan:{...source,tasks:[...source.tasks,...feasible],sessions:[...source.sessions,...newSessions]},summary:parsed.summary,added:feasible.length,omitted:Math.max(0,candidates.length-feasible.length)};
}
