/** UTC instants at the engine boundary: the UI resolves local calendar/timezone input. */
export type TimeRange = { start: number; end: number; label?: string };
export type StudyAssignment = {
  id: string; subjectId: string; title: string; minutes: number;
  priority: number; deadline?: number; dependsOn?: string[]; completed?: boolean; notBefore?: number; split?: boolean;
};
export type StudyBlock = TimeRange & { id?: string; taskId: string; locked?: boolean };
export type ScheduleInput = {
  now: number; windows: TimeRange[]; protectedEvents: TimeRange[];
  tasks: StudyAssignment[]; existing: StudyBlock[];
  sessionMinutes: number; breakMinutes: number;
  dailyLimit?: number; dayKey?: (instant: number) => string; preserveExisting?: boolean;
  preferenceScore?: (instant: number) => number; balanceDays?: boolean;
  taskPreferenceScore?: (task:StudyAssignment,instant:number)=>number;
  periodKey?: (instant:number)=>string; balancePeriods?: boolean;
};
export type ScheduleWarning = { taskId: string; remainingMinutes: number; reason: 'capacity' | 'dependency' | 'invalid' | 'locked-conflict' | 'review-estimate' };
const overlaps = (a: TimeRange, b: TimeRange) => a.start < b.end && b.start < a.end;
const validRange = (range: TimeRange) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start;

/** Preview only. Calling this never mutates saved tasks or moves locked sessions. */
export function proposeSchedule(input: ScheduleInput): { sessions: StudyBlock[]; warnings: ScheduleWarning[] } {
  if (!Number.isFinite(input.now) || !Number.isFinite(input.sessionMinutes) || input.sessionMinutes < 1 ||
      !Number.isFinite(input.breakMinutes) || input.breakMinutes < 0 ||
      input.windows.some(range => !validRange(range)) || input.protectedEvents.some(range => !validRange(range)) ||
      input.existing.some(range => !validRange(range))) throw new Error('Invalid scheduling constraints');
  const ids = new Set(input.tasks.map(task => task.id));
  if (ids.size !== input.tasks.length) throw new Error('Duplicate task IDs');
  const sessions = input.existing.filter(block => block.locked).map(block => ({ ...block }));
  const warnings: ScheduleWarning[] = [];
  const busy: TimeRange[] = [...input.protectedEvents, ...sessions];
  const finished = new Map<string, number>(input.tasks.filter(task => task.completed).map(task => [task.id, input.now]));
  const pending = input.tasks.filter(task => !task.completed).slice().sort((a,b) =>
    (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || b.priority-a.priority || a.id.localeCompare(b.id));
  const windows = input.windows.slice().sort((a,b) => a.start-b.start);
  const breakMs = input.breakMinutes*60000;
  const dailyLimit = (input.dailyLimit ?? Infinity)*60000;
  if (dailyLimit<=0 || Number.isNaN(dailyLimit)) throw new Error('Invalid daily capacity');
  const dayKey = input.dayKey ?? (instant => new Date(instant).toISOString().slice(0,10));
  for (const block of sessions) {
    const task=input.tasks.find(t=>t.id===block.taskId);
    if (block.start<input.now || (task?.deadline !== undefined && block.end>task.deadline) ||
        !windows.some(w=>w.start<=block.start && w.end>=block.end) || input.protectedEvents.some(e=>overlaps(e,block)) ||
        sessions.some(other=>other!==block && overlaps(other,{start:block.start-breakMs,end:block.end+breakMs}))) {
      warnings.push({ taskId:block.taskId,remainingMinutes:0,reason:'locked-conflict' });
    }
  }
  // Topological passes make input ordering irrelevant and expose missing/cyclic dependencies.
  while (pending.length) {
    const index = pending.findIndex(task => (task.dependsOn ?? []).every(id => finished.has(id)));
    if (index < 0) {
      for (const task of pending) warnings.push({ taskId: task.id, remainingMinutes: task.minutes, reason: 'dependency' });
      break;
    }
    const task = pending.splice(index,1)[0];
    if (!Number.isFinite(task.minutes) || task.minutes < 0 ||
        (task.deadline !== undefined && !Number.isFinite(task.deadline))) {
      warnings.push({taskId:task.id,remainingMinutes:0,reason:'invalid'}); continue;
    }
    if(task.minutes===0){warnings.push({taskId:task.id,remainingMinutes:0,reason:'review-estimate'});continue;}
    let remaining = Math.max(0, task.minutes*60000 - sessions.filter(block => block.taskId===task.id).reduce((sum,block)=>sum+block.end-block.start,0));
    let earliest = Math.max(input.now, task.notBefore ?? input.now, ...(task.dependsOn ?? []).map(id => finished.get(id)!));
    if(sessions.some(s=>s.taskId===task.id && s.start<earliest))warnings.push({taskId:task.id,remainingMinutes:0,reason:'locked-conflict'});
    const usedOnDay = (instant: number) => sessions.filter(s=>dayKey(s.start)===dayKey(instant)).reduce((sum,s)=>sum+s.end-s.start,0);
    // Keep feasible old placements before allocating new ones. Never silently retain a broken constraint.
    if (input.preserveExisting) {
      for (const old of input.existing.filter(s=>!s.locked && s.taskId===task.id).sort((a,b)=>a.start-b.start)) {
        const length=old.end-old.start;
        if (old.start<earliest || old.end>(task.deadline ?? Infinity) || length>remaining ||
            (task.split===false && length!==remaining) || length+usedOnDay(old.start)>dailyLimit ||
            !windows.some(w=>w.start<=old.start && w.end>=old.end) ||
            busy.some(e=>overlaps(old,{start:e.start-breakMs,end:e.end+breakMs}))) continue;
        const block={...old}; sessions.push(block);busy.push(block);remaining-=length;
      }
    }
    let lastEnd = sessions.filter(block=>block.taskId===task.id).reduce((end,block)=>Math.max(end,block.end),earliest);
    const rankedWindows = windows.slice().sort((a,b)=>{
      if(!input.balanceDays && !input.preferenceScore && !input.taskPreferenceScore && !input.balancePeriods)return a.start-b.start;
      const score=(w:TimeRange)=>(input.balanceDays?usedOnDay(w.start)/60000:0)+(w.start-input.now)/86400000*3+(input.preferenceScore?.(w.start) ?? 0)+(input.taskPreferenceScore?.(task,w.start) ?? 0)+(input.balancePeriods?sessions.filter(s=>input.periodKey?.(s.start)===input.periodKey?.(w.start)).reduce((n,s)=>n+(s.end-s.start)/60000,0)*4:0);
      return score(a)-score(b) || a.start-b.start;
    });
    for (const window of rankedWindows) {
      let cursor = Math.max(window.start,earliest);
      const limit = Math.min(window.end,task.deadline ?? Infinity);
      while (remaining > 0 && cursor < limit) {
        const blocked = busy.filter(range => overlaps({start:cursor,end:cursor+1}, {start:range.start-breakMs,end:range.end+breakMs}));
        if (blocked.length) { cursor = Math.max(...blocked.map(range=>range.end+breakMs)); continue; }
        const next = busy.filter(range=>range.start-breakMs>=cursor).reduce((end,range)=>Math.min(end,range.start-breakMs),limit);
        const cap=dailyLimit-usedOnDay(cursor);
        const length = Math.min(remaining,task.split===false?remaining:input.sessionMinutes*60000,next-cursor,cap);
        if (task.split===false && length<remaining) { cursor=next+breakMs+1; continue; }
        if (length < 60000) { cursor = next+breakMs+1; continue; }
        const block = {taskId:task.id,start:cursor,end:cursor+length};
        sessions.push(block); busy.push(block); remaining-=length; lastEnd=Math.max(lastEnd,block.end);
        cursor=block.end+breakMs; earliest=cursor;
      }
      if (!remaining) break;
    }
    if (remaining) warnings.push({taskId:task.id,remainingMinutes:remaining/60000,reason:'capacity'});
    else finished.set(task.id,lastEnd);
  }
  return {sessions:sessions.sort((a,b)=>a.start-b.start),warnings};
}
