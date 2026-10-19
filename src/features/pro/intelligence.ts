import type { SmartPlan } from '@/src/features/planner/smartPlannerModel';
import { dateKey,localInstant,addDays } from '@/src/features/planner/smartPlannerModel';
import type { Card, Review, Session } from '@/src/features/flashcards/model';
export const learningWeekStart=(now:number,zone:string)=>localInstant(addDays(dateKey(now,zone),-6),'00:00',zone);
export function learningEvidence(plan: SmartPlan | null, cards: Card[], getReview: (c: Card) => Review, sessions: Session[], now = Date.now()) {
    const weekStart=learningWeekStart(now,plan?.timezone||'Asia/Tashkent');
    const active = plan?.tasks.filter(t => !t.completed) || [];
    const uniqueAttempts = new Map<string, Session['attempts'][number] & {deckId:string}>();
    for(const session of sessions)for(const attempt of session.attempts){
      if(typeof attempt.correct!=='boolean' || !Number.isFinite(Date.parse(attempt.at||'')) || Date.parse(attempt.at)>now)continue;
      const key=session.id ? `${session.id}:${session.deckId}:${attempt.cardId}` : `${session.startedAt || ""}:${session.deckId}:${attempt.cardId}:${attempt.at}`;
      uniqueAttempts.set(key,{...attempt,deckId:session.deckId});
    }
    const attempts = [...uniqueAttempts.values()];
    const recent = attempts.filter(a => Date.parse(a.at) >= weekStart && Date.parse(a.at) <= now);
    const due = cards.filter(c => !c.deleted && Date.parse(getReview(c).dueAt) <= now);
    const mistakes = new Map<string, number>();
    for (const a of attempts)
        if (!a.correct)
            mistakes.set(a.deckId + ':' + a.cardId, (mistakes.get(a.deckId + ':' + a.cardId) || 0) + 1);
    const weak = cards.filter(c => !c.deleted && (mistakes.get(c.deckId + ':' + c.id) || 0) >= 2).map(c => ({ card: c, misses: mistakes.get(c.deckId + ':' + c.id)! })).sort((a, b) => b.misses - a.misses);
    const upcoming = plan?.sessions.filter(s => s.end > now && !plan.tasks.find(t => t.id === s.taskId)?.completed).sort((a, b) => a.start - b.start) || [];
    const today = plan ? dateKey(now, plan.timezone) : '';
    const missed = plan?.sessions.filter(s => s.end < now && !plan.tasks.find(t => t.id === s.taskId)?.completed) || [];
    const completed = plan?.tasks.filter(t => t.completed && t.completedAt && t.completedAt >= weekStart && t.completedAt <= now) || [];
    const deadlines = plan?.subjects.filter(s => s.deadline).map(s => ({ subject: s, days: Math.ceil((Date.parse(s.deadline + 'T23:59:00Z') - now) / 86400000) })) || [];
    return { active, attempts, recent, due, weak, upcoming, today, missed, completed, deadlines };
}
export function validateDeckDraft(raw: string): {
    front: string;
    back: string;
}[] {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
    if (!Array.isArray(parsed.cards) || !parsed.cards.length || parsed.cards.length > 12)
        throw new Error('Invalid draft');
    return parsed.cards.map((c: any) => { if (typeof c.front !== 'string' || typeof c.back !== 'string' || !c.front.trim() || !c.back.trim() || c.front.length > 2000 || c.back.length > 5000)
        throw new Error('Invalid draft'); return { front: c.front.trim(), back: c.back.trim() }; });
}
