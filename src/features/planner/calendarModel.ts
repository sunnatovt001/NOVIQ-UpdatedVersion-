import { addDays, dateKey, localInstant, expandWeekly, availableRanges, moveStudyBlock, type SmartPlan, type FocusReceipt } from './smartPlannerModel';
import type { StudyBlock } from './smartSchedule';
export const sessionKey = (s: StudyBlock) => s.id || `${s.taskId}:${s.start}:${s.end}`;
export const subjectColor = (color?: string) => ['#2563eb', '#0891b2', '#059669', '#c2410c', '#7c3aed'].includes(color || '') ? color! : '#2563eb';
export function calendarDay(plan: SmartPlan, day: string) { const start = localInstant(day, '00:00', plan.timezone), end = localInstant(addDays(day, 1), '00:00', plan.timezone); const clip = (r: {
    start: number;
    end: number;
    label?: string;
}) => ({ ...r, start: Math.max(start, r.start), end: Math.min(end, r.end) }); const windows = expandWeekly(plan.windows, plan.timezone, day, 1).filter(r => r.start < end && r.end > start).map(clip); const commitments = expandWeekly(plan.commitments, plan.timezone, day, 1).filter(r => r.start < end && r.end > start).map(clip); return { start, end, windows, commitments, available: availableRanges(windows, commitments, start) }; }
export function localMinutes(instant: number, zone: string) { const p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(instant); return Number(p.find(v => v.type === 'hour')?.value) * 60 + Number(p.find(v => v.type === 'minute')?.value); }
export function moveOrResize(plan: SmartPlan, block: StudyBlock, start: number, duration: number, receipts: FocusReceipt[], now = Date.now()) {
    if (block.locked || !Number.isFinite(duration) || duration < 5 || duration > 480)
        throw new Error('Unlock the session and choose a duration between 5 and 480 minutes.');
    const adjusted = { ...block, id: sessionKey(block), start, end: start + duration * 60000 };
    const candidate = { ...plan, sessions: plan.sessions.map(s => sessionKey(s) === sessionKey(block) ? adjusted : s) };
    return moveStudyBlock(candidate, adjusted, start, receipts, now);
}
export function placementConflict(plan: SmartPlan, s: StudyBlock) { try {
    const day = dateKey(s.start, plan.timezone), r = calendarDay(plan, day);
    const task = plan.tasks.find(t => t.id === s.taskId);
    return !task || !!task.deadline && s.end > task.deadline || !r.windows.some(w => w.start <= s.start && w.end >= s.end) || r.commitments.some(e => s.start < e.end && e.start < s.end) || plan.sessions.some(other => sessionKey(other) !== sessionKey(s) && s.start < other.end && other.start < s.end);
}
catch {
    return true;
} }
