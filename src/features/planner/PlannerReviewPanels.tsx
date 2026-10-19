import React, { useState } from 'react';
import { Clock3 } from 'lucide-react';
import { clonePlan, mergePlannerPlans, type PlanDraft } from './plannerPersistence';
import type { SmartPlan } from './smartPlannerModel';
import type { SmartCopy } from './smartPlannerCopy';
import { sessionKey } from './calendarModel';
export type PlanProposal = {
    plan: SmartPlan;
    baseRevision: string;
    description: string;
    warnings: string[];
    receiptSignature: string;
};
export function ProposalPanel({ current, proposal, c, format, onApply, onCancel }: {
    current: SmartPlan;
    proposal: PlanProposal;
    c: SmartCopy;
    format: (n: number) => string;
    onApply: () => void;
    onCancel: () => void;
}) {
    const changed = proposal.plan.sessions.filter(s => !current.sessions.some(old => old.taskId === s.taskId && old.start === s.start && old.end === s.end));
    const removed = current.sessions.filter(old => !proposal.plan.sessions.some(s => s.taskId === old.taskId && s.start === old.start && s.end === old.end));
    const changedTasks = proposal.plan.tasks.filter(t => JSON.stringify(t) !== JSON.stringify(current.tasks.find(old => old.id === t.id)));
    const removedTasks = current.tasks.filter(t => !proposal.plan.tasks.some(n => n.id === t.id));
    return <section className="sp-review-panel sp-preview" aria-labelledby="sp-review-heading"><div className="sp-section-heading"><div><span className="sp-eyebrow">{c.previewOnly}</span><h2 id="sp-review-heading">{c.preview}</h2></div><button className="sp-button" onClick={onCancel}>{c.cancel}</button></div><p>{c.previewHelp}</p><div className="sp-review-columns"><div><h3>{c.currentPlan}</h3>{removed.length ? removed.map(s => <p key={sessionKey(s)}><strong>{current.tasks.find(t => t.id === s.taskId)?.title}</strong><span>{format(s.start)} – {format(s.end)}</span></p>) : <p>{c.noMoves}</p>}</div><div><h3>{c.proposedPlan}</h3>{changed.length ? changed.map(s => <p key={sessionKey(s)}><strong>{proposal.plan.tasks.find(t => t.id === s.taskId)?.title}</strong><span>{format(s.start)} – {format(s.end)}</span></p>) : <p>{c.noMoves}</p>}</div></div>{(changedTasks.length > 0 || removedTasks.length > 0) && <details className="sp-task-change-list" open><summary>{c.taskChanges}</summary>{removedTasks.map(t => <p key={t.id}>{t.title} · {c.removedValue}</p>)}{changedTasks.map(t => <p key={t.id}>{t.title} · {t.minutes} {c.minutes}{t.deadline ? ' · ' + format(t.deadline) : ''}{t.completed ? ' · ' + c.done : ''}</p>)}</details>}{proposal.warnings.map((w, i) => <p className="sp-warning" role="status" key={i}>{w}</p>)}<div className="sp-actions"><button className="sp-button sp-primary" disabled={current.revision !== proposal.baseRevision || proposal.warnings.includes(c.lockedWarning)} onClick={onApply}>{c.apply}</button><span className="sp-muted">{c.confirmBeforeSave}</span></div></section>;
}
export function ConflictPanel({ saved, draft, c, onSaved, onMerge }: {
    saved: SmartPlan | null;
    draft: PlanDraft | null;
    c: SmartCopy;
    onSaved: () => void;
    onMerge: (p: SmartPlan) => boolean;
}) {
    const [choices, setChoices] = useState<Record<string, 'mine' | 'saved'>>({}), [review, setReview] = useState(false);
    const merged = draft ? mergePlannerPlans(draft.base, draft.plan, saved, choices) : null;
    const originalConflicts = draft ? mergePlannerPlans(draft.base, draft.plan, saved).conflicts : [];
    const label = (path: string) => { const parts = path.split(':'), field = parts.at(-1)!; const task = draft?.plan.tasks.find(t => parts.includes(t.id)) || saved?.tasks.find(t => parts.includes(t.id)); const fields: Record<string, string> = { dailyLimit: c.dailyLimit, breakMinutes: c.breaks, sessionMinutes: c.focusLength, title: c.taskTitle, minutes: c.duration, deadline: c.deadline, priority: c.priority, subjects: c.subject, windows: c.windows, commitments: c.commitments, sessions: c.sessions, mode: c.mode, description: c.description, completed: c.done }; return `${task ? task.title + ' · ' : ''}${fields[field] || c.otherChanges}`; };
    const showValue = (root: SmartPlan | null, path: string) => { let v: any = root; for (const key of path.split(':').slice(1)) {
        if (Array.isArray(v))
            v = v.find(x => (x.id || (x.taskId + ':' + x.start + ':' + x.end)) === key);
        else
            v = v?.[key];
    } if (v === undefined || v === null)
        return c.removedValue; if (typeof v === 'boolean')
        return v ? c.yes : c.no; if (typeof v === 'object')
        return v.title || v.name || v.label || (Array.isArray(v) ? String(v.length) + ' ' + c.otherChanges : c.otherChanges); return String(v); };
    return <section className="sp-conflict-panel" role="alert"><h2>{c.conflict}</h2><p>{c.conflictHelp}</p><div className="sp-review-columns"><div><h3>{c.deviceDraft}</h3><p>{draft?.plan.tasks.length ?? 0} {c.allTasks} · {draft?.plan.sessions.length ?? 0} {c.sessions}</p></div><div><h3>{c.savedPlan}</h3><p>{saved?.tasks.length ?? 0} {c.allTasks} · {saved?.sessions.length ?? 0} {c.sessions}</p></div></div><div className="sp-actions"><button className="sp-button" onClick={onSaved}>{c.loadRemote}</button>{draft && <button className="sp-button" onClick={() => setReview(v => !v)}>{c.reviewMyChanges}</button>}</div>{review && merged && <div className="sp-merge-review"><p>{c.mergeHelp}</p>{originalConflicts.map(path => <fieldset key={path}><legend>{label(path)}</legend><label><input type="radio" name={path} checked={choices[path] === 'saved'} onChange={() => setChoices(v => ({ ...v, [path]: 'saved' }))}/>{c.keepSaved} · {showValue(saved, path)}</label><label><input type="radio" name={path} checked={choices[path] === 'mine'} onChange={() => setChoices(v => ({ ...v, [path]: 'mine' }))}/>{c.keepMine} · {showValue(draft?.plan || null, path)}</label></fieldset>)}<button className="sp-button sp-primary" disabled={merged.conflicts.length > 0} onClick={() => onMerge(clonePlan(merged.plan))}>{c.applyMerge}</button></div>}</section>;
}
