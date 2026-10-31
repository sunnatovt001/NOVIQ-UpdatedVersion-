import { proposeSchedule, type StudyAssignment, type StudyBlock, type TimeRange } from './smartSchedule';

export type Subject = { color?: string; id: string; name: string; mode: 'self' | 'tutor' | 'hybrid'; paused: boolean; target: string; estimate: string; deadline: string; priorities: string; materials: string; roadmap: string };
export type WeeklyRange = { id: string; label: string; days: number[]; start: string; end: string; date?: string; until?: string };
export type SmartTask = StudyAssignment & { origin?: 'ai'; description: string; type: string; resource: string; flexibility: 'flexible' | 'fixed'; repeat: 'none' | 'daily' | 'weekly'; repeatUntil: string; createdAt: number; completedAt?: number; parentId?: string };
export type FocusReceipt = { id: string; taskId: string; seconds: number; timestamp: number; verified: boolean };
export type SmartPlan = {
  persistenceVersion?: 3; sequence?: number; previousRevision?: string | null; confirmedAt?: number;
  version: 2; userId: string; updatedAt: number; revision: string; startedAt: number; completedOnboardingAt?: number; step: number; ready: boolean;
  statuses: string[]; timezone: string; subjects: Subject[]; windows: WeeklyRange[]; commitments: WeeklyRange[];
  sessionMinutes: number; breakMinutes: number; dailyLimit: number; split: boolean; mode: 'blocked' | 'list' | 'hybrid';
  preference: 'morning' | 'afternoon' | 'evening'; tasks: SmartTask[]; sessions: StudyBlock[];
  history: { timestamp: number; moved: number; usefulness?: number }[];
};
export const newId = () => crypto.randomUUID();
export const newSubject = (name: string): Subject => ({ id: newId(), name, mode: 'self', paused: false, target: '', estimate: '', deadline: '', priorities: '', materials: '', roadmap: '' });
export function initialSmartPlan(userId: string): SmartPlan {
  return { version: 2, userId, updatedAt: 0, revision: '', startedAt: Date.now(), step: 0, ready: false, statuses: [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, subjects: [],
    windows: [{ id: newId(), label: '', days: [1,2,3,4,5], start: '17:00', end: '20:00' }, { id: newId(), label: '', days: [0,6], start: '10:00', end: '13:00' }],
    commitments: [{ id: newId(), label: 'Sleep', days: [0,1,2,3,4,5,6], start: '23:00', end: '07:00' }],
    sessionMinutes: 25, breakMinutes: 5, dailyLimit: 120, split: true, mode: 'hybrid', preference: 'evening', tasks: [], sessions: [], history: [] };
}
export function validSmartPlan(value: unknown, uid: string): value is SmartPlan {
  const p = value as SmartPlan;
  if(!p || typeof p.timezone!=='string')return false;
  try{new Intl.DateTimeFormat('en',{timeZone:p.timezone});}catch{return false;}
  const range=(r:WeeklyRange)=>!!r && typeof r.id==='string' && typeof r.label==='string' && Array.isArray(r.days) && r.days.every(d=>Number.isInteger(d) && d>=0 && d<=6) && typeof r.start==='string' && typeof r.end==='string';
  return !!p && p.version === 2 && p.userId === uid &&
    Array.isArray(p.subjects) && p.subjects.every(s=>!!s && typeof s.id==='string' && typeof s.name==='string' && ['self','tutor','hybrid'].includes(s.mode)) &&
    Array.isArray(p.tasks) && p.tasks.every(t=>!!t && typeof t.id==='string' && typeof t.subjectId==='string' && typeof t.title==='string' && Number.isFinite(t.minutes) && Number.isFinite(t.createdAt)) &&
    Array.isArray(p.windows) && p.windows.every(range) && Array.isArray(p.commitments) && p.commitments.every(range) &&
    Array.isArray(p.sessions) && p.sessions.every(s=>!!s && typeof s.taskId==='string' && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end>s.start) &&
    Array.isArray(p.history) && Array.isArray(p.statuses) && typeof p.timezone === 'string' && typeof p.ready === 'boolean' &&
    Number.isInteger(p.step) && p.step>=0 && p.step<=5 && Number.isFinite(p.sessionMinutes) && Number.isFinite(p.breakMinutes) && Number.isFinite(p.dailyLimit) && ['blocked','list','hybrid'].includes(p.mode);
}
export const dateKey = (instant: number, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  return ['year','month','day'].map(type => parts.find(p => p.type === type)!.value).join('-');
};
export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0,10);
}
const localParts = (instant: number, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const read = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute') };
};
/** Reject nonexistent DST wall times. A repeated wall time chooses its earliest instant. */
export function localInstant(day: string, time: string, timezone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Invalid date or time');
  const [year,month,date] = day.split('-').map(Number); const [hour,minute] = time.split(':').map(Number);
  const target = Date.UTC(year,month-1,date,hour,minute);
  if (new Date(target).toISOString().slice(0,10) !== day) throw new Error('Invalid date');
  const offsets = new Set<number>();
  for (const delta of [-36,-12,0,12,36]) {
    const sample = target + delta*3600000; const p = localParts(sample,timezone);
    offsets.add(Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute)-sample);
  }
  const candidates = [...offsets].map(offset => target-offset).filter(instant => {
    const p = localParts(instant,timezone); return p.year===year && p.month===month && p.day===date && p.hour===hour && p.minute===minute;
  });
  if (!candidates.length) throw new Error(`Unavailable local time: ${day} ${time}`);
  return Math.min(...candidates);
}
export function expandWeekly(ranges: WeeklyRange[], timezone: string, first: string, days = 14): TimeRange[] {
  const result: TimeRange[] = [];
  // Include yesterday so overnight sleep protects the first morning.
  for (let index=-1; index<days; index++) {
    const day = addDays(first,index); const weekday = new Date(`${day}T12:00Z`).getUTCDay();
    for (const range of ranges) {
      if (range.date ? range.date !== day : !range.days.includes(weekday)) continue;
      if (range.until && day > range.until) continue;
      const start=localInstant(day,range.start,timezone); const end=localInstant(range.end<=range.start?addDays(day,1):day,range.end,timezone);
      result.push({ start,end,label:range.label });
    }
  }
  return result;
}
export function availableRanges(windows: TimeRange[], busy: TimeRange[], now: number): TimeRange[] {
  const merged: TimeRange[] = [];
  for (const w of windows.slice().sort((a,b)=>a.start-b.start)) {
    const start=Math.max(now,w.start); if (w.end<=start) continue;
    const last=merged.at(-1); if (last && start<=last.end) last.end=Math.max(last.end,w.end); else merged.push({start,end:w.end});
  }
  return busy.reduce((ranges,event)=>ranges.flatMap(w => event.end<=w.start || event.start>=w.end ? [w] : [
    ...(event.start>w.start?[{start:w.start,end:event.start}]:[]), ...(event.end<w.end?[{start:event.end,end:w.end}]:[]),
  ]),merged);
}
export function expandTasks(plan: SmartPlan, first: string): SmartTask[] {
  const tasks = plan.tasks.slice(); const ids = new Set(tasks.map(t=>t.id));
  for (const task of plan.tasks.filter(t=>!t.parentId && t.repeat!=='none')) {
    const origin=dateKey(task.createdAt,plan.timezone);
    for (let i=0;i<14;i++) {
      const day=addDays(first,i); const difference=Math.round((Date.parse(day)-Date.parse(origin))/86400000);
      if (difference<=0 || (task.repeat==='weekly' && difference%7!==0) || (task.repeatUntil && day>task.repeatUntil)) continue;
      const id=`${task.id}@${day}`; if (ids.has(id)) continue;
      tasks.push({...task,id,parentId:task.id,repeat:'none',createdAt:localInstant(day,'00:00',plan.timezone),deadline:localInstant(addDays(day,1),'00:00',plan.timezone),completed:false,completedAt:undefined}); ids.add(id);
    }
  }
  return tasks;
}
export function buildSmartPreview(plan: SmartPlan, receipts: FocusReceipt[], now=Date.now()) {
  const first=dateKey(now,plan.timezone); const allWindows=expandWeekly(plan.windows,plan.timezone,first);
  const protectedEvents=expandWeekly(plan.commitments,plan.timezone,first);
  const end=localInstant(addDays(first,14),'00:00',plan.timezone);
  const windows=availableRanges(allWindows,protectedEvents,now).filter(w=>w.start<end).flatMap(w=>{
    const segments:TimeRange[]=[];let cursor=w.start;const limit=Math.min(w.end,end);
    while(cursor<limit){const midnight=localInstant(addDays(dateKey(cursor,plan.timezone),1),'00:00',plan.timezone);const stop=Math.min(limit,midnight);segments.push({start:cursor,end:stop});cursor=stop;}return segments;
  });
  const tasks=expandTasks(plan,first);
  const paused=new Set(plan.subjects.filter(s=>s.paused).map(s=>s.id));
  const actual = (id: string) => receipts.filter(r=>r.taskId===id).reduce((sum,r)=>sum+r.seconds/60,0);
  const assignments=tasks.filter(t=>!paused.has(t.subjectId) || t.completed).map(t=>{
    const subject=plan.subjects.find(s=>s.id===t.subjectId);
    return {...t,deadline:t.deadline ?? (subject?.deadline?localInstant(subject.deadline,'23:59',plan.timezone):undefined),minutes:Math.max(0,t.minutes-actual(t.id)),completed:t.completed,notBefore:Math.max(now,t.createdAt,t.notBefore ?? 0),split:plan.split && t.flexibility==='flexible'};
  });
  const existing=plan.sessions.filter(s=>!tasks.find(t=>t.id===s.taskId)?.completed && (!paused.has(tasks.find(t=>t.id===s.taskId)?.subjectId || '') || s.locked) && s.end>now);
  const preferredHour=plan.preference==='morning'?9:plan.preference==='afternoon'?14:18;
  const result=proposeSchedule({ now,windows,protectedEvents,tasks:assignments,existing,sessionMinutes:plan.sessionMinutes,breakMinutes:plan.breakMinutes,dailyLimit:plan.dailyLimit,dayKey:instant=>dateKey(instant,plan.timezone),preserveExisting:true,balanceDays:true,preferenceScore:instant=>Math.abs(localParts(instant,plan.timezone).hour-preferredHour)*2 });
  const dailyCapacity=new Map<string,number>();for(const w of windows){const day=dateKey(w.start,plan.timezone);dailyCapacity.set(day,(dailyCapacity.get(day) || 0)+(w.end-w.start)/60000);}
  return {...result,tasks,windows,protectedEvents,capacityMinutes:[...dailyCapacity.values()].reduce((sum,minutes)=>sum+Math.min(plan.dailyLimit,minutes),0)};
}
export function estimateSuggestion(task: SmartTask, tasks: SmartTask[], receipts: FocusReceipt[]) {
  const samples=tasks.filter(t=>t.completed && t.subjectId===task.subjectId && t.type===task.type && t.id!==task.id).map(t=>{
    const minutes=receipts.filter(r=>r.taskId===t.id).reduce((s,r)=>s+r.seconds/60,0); return minutes>0 ? minutes/t.minutes : 0;
  }).filter(ratio=>ratio>0);
  if (samples.length<3) return null;
  samples.sort((a,b)=>a-b); const ratio=samples[Math.floor(samples.length/2)];
  return { minutes: Math.round(task.minutes*Math.max(.8,Math.min(1.2,ratio))), observations:samples.length };
}

/** Explicit user placement: validates the requested instant without moving other sessions. */
export function moveStudyBlock(plan:SmartPlan, block:StudyBlock, start:number, receipts:FocusReceipt[], now=Date.now()):SmartPlan {
  const task=plan.tasks.find(t=>t.id===block.taskId);if(!task || task.completed || !Number.isFinite(start) || start<now)throw new Error('Invalid placement');
  const moved={...block,start,end:start+(block.end-block.start),locked:true};const first=dateKey(start,plan.timezone);
  const windows=expandWeekly(plan.windows,plan.timezone,first,2);const protectedEvents=expandWeekly(plan.commitments,plan.timezone,first,2);
  const breakMs=plan.breakMinutes*60000;
  const overlaps=(a:TimeRange,b:TimeRange)=>a.start<b.end && b.start<a.end;
  const others=plan.sessions.filter(s=>s!==block);
  const subject=plan.subjects.find(s=>s.id===task.subjectId);
  const deadline=task.deadline ?? (subject?.deadline?localInstant(subject.deadline,'23:59',plan.timezone):Infinity);
  if(moved.end>deadline || dateKey(moved.end-1,plan.timezone)!==first || !windows.some(w=>w.start<=moved.start && w.end>=moved.end) ||
    protectedEvents.some(e=>overlaps(moved,{start:e.start-breakMs,end:e.end+breakMs})) ||
    others.some(s=>overlaps(moved,{start:s.start-breakMs,end:s.end+breakMs})))throw new Error('Placement conflicts');
  const recorded=receipts.filter(r=>dateKey(r.timestamp,plan.timezone)===first).reduce((sum,r)=>sum+r.seconds/60,0);
  const allocated=others.filter(s=>dateKey(s.start,plan.timezone)===first && s.end>now).reduce((sum,s)=>sum+(s.end-Math.max(s.start,now))/60000,0);
  if(allocated+recorded+(moved.end-moved.start)/60000>plan.dailyLimit)throw new Error('Daily limit exceeded');
  for(const id of task.dependsOn || []){
    const prerequisite=plan.tasks.find(t=>t.id===id);if(!prerequisite)throw new Error('Missing prerequisite');if(prerequisite.completed)continue;
    const minutes=others.filter(s=>s.taskId===id && s.end>now && s.end<=start).reduce((sum,s)=>sum+(s.end-s.start)/60000,0)+receipts.filter(r=>r.taskId===id).reduce((sum,r)=>sum+r.seconds/60,0);
    if(minutes<prerequisite.minutes)throw new Error('Prerequisite unfinished');
  }
  for(const dependent of plan.tasks.filter(t=>t.dependsOn?.includes(task.id) && !t.completed))if(others.some(s=>s.taskId===dependent.id && s.start<moved.end))throw new Error('Dependent starts too early');
  return {...plan,sessions:plan.sessions.map(s=>s===block?moved:s)};
}
