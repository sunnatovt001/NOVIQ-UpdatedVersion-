import {addDays,dateKey,localInstant,newId,type SmartPlan,type SmartTask,type FocusReceipt,type TopicProgress} from './smartPlannerModel';
export const topicKey=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().slice(0,100);
export const taskTopic=(task:SmartTask)=>topicKey(task.topic||task.title)||task.id;
export function topicFeedback(plan:SmartPlan,taskId:string,rating:TopicProgress['rating'],now=Date.now(),receipts:FocusReceipt[]=[]):SmartPlan{
  const task=plan.tasks.find(t=>t.id===taskId);if(!task||!['again','good','easy'].includes(rating))throw new Error('Invalid feedback');
  const subject=plan.subjects.find(s=>s.id===task.subjectId);if(!subject)throw new Error('Missing subject');
  const key=taskTopic(task),old=subject.topics?.find(t=>t.key===key),sameDay=old&&dateKey(old.reviewedAt,plan.timezone)===dateKey(now,plan.timezone);
  const intervalDays=rating==='again'?1:sameDay?Math.max(rating==='easy'?7:3,Math.min(rating==='easy'?60:30,old.intervalDays)):rating==='easy'?Math.min(60,Math.max(7,(old?.intervalDays||0)*2)):Math.min(30,Math.max(3,(old?.intervalDays||0)*2));
  const progress:TopicProgress={key,label:task.topic||task.title,rating,reviewedAt:now,nextReviewAt:localInstant(addDays(dateKey(now,plan.timezone),intervalDays),'08:00',plan.timezone),intervalDays};
  const retired=new Set(plan.tasks.filter(t=>t.id!==task.id&&t.origin==='ai'&&!t.completed&&t.subjectId===task.subjectId&&taskTopic(t)===key&&!receipts.some(r=>r.taskId===t.id)&&!plan.sessions.some(s=>s.taskId===t.id&&(s.locked||s.start<=now))).map(t=>t.id));
  return {...plan,subjects:plan.subjects.map(s=>s.id===subject.id?{...s,topics:[...(s.topics||[]).filter(t=>t.key!==key),progress]}:s),tasks:plan.tasks.filter(t=>!retired.has(t.id)).map(t=>t.id===task.id?{...t,completed:true,completedAt:now}:t),sessions:plan.sessions.filter(s=>!retired.has(s.taskId)&&(s.taskId!==task.id||s.start<now))};
}
/** Refresh AI-owned unstarted work only; manual work and history are immutable. */
export function dailyPlanningSource(plan:SmartPlan,receipts:FocusReceipt[],now=Date.now()):SmartPlan{
  const today=dateKey(now,plan.timezone);
  const remove=new Set(plan.tasks.filter(t=>{
    if(t.origin!=='ai'||t.completed||receipts.some(r=>r.taskId===t.id)||plan.sessions.some(s=>s.taskId===t.id&&(s.locked||(s.start<=now&&s.end>now))))return false;
    const topic=plan.subjects.find(s=>s.id===t.subjectId)?.topics?.find(p=>p.key===taskTopic(t));
    return (t.deadline!==undefined&&t.deadline<=now)||!!(topic&&topic.nextReviewAt>now&&dateKey(topic.nextReviewAt,plan.timezone)>today);
  }).map(t=>t.id));
  return {...plan,tasks:plan.tasks.filter(t=>!remove.has(t.id)),sessions:plan.sessions.filter(s=>!remove.has(s.taskId))};
}
export function dueReviewTasks(plan:SmartPlan,now:number,days:number):SmartTask[]{
  const end=localInstant(addDays(dateKey(now,plan.timezone),days),'00:00',plan.timezone);
  return plan.subjects.filter(s=>!s.paused).flatMap(s=>(s.topics||[]).filter(p=>p.nextReviewAt<end&&!plan.tasks.some(t=>t.subjectId===s.id&&!t.completed&&taskTopic(t)===p.key)).map(p=>{
    const day=dateKey(Math.max(now,p.nextReviewAt),plan.timezone);
    return {id:newId(),origin:'ai' as const,topic:p.key,demand:p.rating==='again'?'practice' as const:'review' as const,preferredPeriod:'any' as const,subjectId:s.id,title:p.label,description:p.rating==='again'?'Targeted retrieval practice; explain and correct mistakes.':'Spaced retrieval review; recall before checking the material.',minutes:p.rating==='again'?25:10,priority:2,type:'Review',resource:'',flexibility:'flexible' as const,repeat:'none' as const,repeatUntil:'',createdAt:now,notBefore:Math.max(now,p.nextReviewAt),deadline:Math.min(end,localInstant(addDays(day,1),'00:00',plan.timezone),s.deadline?localInstant(s.deadline,'23:59',plan.timezone):Infinity),completed:false};
  }).filter(t=>t.deadline>t.notBefore));
}
export function dayParts(plan:SmartPlan,windows:{start:number;end:number}[]){
  return windows.flatMap(w=>{
    const day=dateKey(w.start,plan.timezone),points=[0,6,9,12,15,17,20,24].map(h=>h===24?localInstant(addDays(day,1),'00:00',plan.timezone):localInstant(day,String(h).padStart(2,'0')+':00',plan.timezone));
    return points.slice(0,-1).map((start,i)=>({start:Math.max(w.start,start),end:Math.min(w.end,points[i+1])})).filter(r=>r.end>r.start);
  });
}
export function period(instant:number,zone:string){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(instant));return hour<12?'morning':hour<17?'afternoon':'evening';}
export function studyDemand(title:string):SmartTask['demand']{return /review|vocab|flashcard|takror|lug‘at|повтор|словар/i.test(title)?'review':/math|algebra|physics|writing|essay|timed|reading|matem|fizik|письм|матем/i.test(title)?'deep':'practice';}

/** Today's view hides old completions while preserving personal overdue work. */
export function dailyTasks(plan:SmartPlan,day:string){
  const end=localInstant(addDays(day,1),'00:00',plan.timezone);
  return plan.tasks.filter(t=>{
    const placed=plan.sessions.filter(s=>s.taskId===t.id);
    if(placed.some(s=>dateKey(s.start,plan.timezone)===day||dateKey(s.end-1,plan.timezone)===day))return true;
    if(t.completed)return !!t.completedAt&&dateKey(t.completedAt,plan.timezone)===day;
    if(t.origin==='ai')return dateKey(t.notBefore||t.createdAt,plan.timezone)===day;
    if(t.deadline&&t.deadline<=end)return true;
    return !placed.some(s=>s.end>=end)&&(!t.notBefore||t.notBefore<end)&&(!t.deadline||t.deadline<=end)&&t.createdAt<end;
  });
}
