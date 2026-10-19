import { initialSmartPlan, validSmartPlan, type SmartPlan } from './smartPlannerModel';
export type PlanDraft = {
    plan: SmartPlan;
    base: SmartPlan | null;
    baseRevision: string | null;
    description: string;
};
export type PlanSnapshot = {
    plan: SmartPlan | null;
    fromCache: boolean;
    pending: boolean;
};
export type PlanStatus = 'loading' | 'device' | 'synced' | 'pending' | 'saving' | 'failed' | 'conflict';
export type PlanState = {
    plan: SmartPlan | null;
    confirmed: SmartPlan | null;
    draft: PlanDraft | null;
    remote: SmartPlan | null;
    known: boolean;
    status: PlanStatus;
    error: string;
    blocked: boolean;
};
export const revisionOf = (p: SmartPlan | null) => p?.revision ?? null;
export const sequenceOf = (p: SmartPlan | null) => p?.sequence ?? 0;
export const clonePlan = <T,>(p: T): T => JSON.parse(JSON.stringify(p));
export class PlanConflict extends Error {
    constructor(public latest: SmartPlan | null) { super('Planner revision changed'); }
}
export type PlanAdapter = {
    loadConfirmed: () => SmartPlan | null;
    loadDraft: () => PlanDraft | null;
    loadLegacy: () => SmartPlan | null;
    storeConfirmed: (p: SmartPlan | null) => void;
    storeDraft: (d: PlanDraft | null) => void;
    backup: (d: PlanDraft) => void;
    listen: (next: (s: PlanSnapshot) => void, error: () => void) => () => void;
    commit: (next: SmartPlan, base: SmartPlan | null, description: string) => Promise<SmartPlan>;
    retireLegacy: () => void;
    now: () => number;
    id: () => string;
    readOnly: boolean;
};
/** One repository per authenticated UID. Mounting only reads; it never creates a plan. */
export class PlannerRepository {
    state: PlanState = { plan: null, confirmed: null, draft: null, remote: null, known: false, status: 'loading', error: '', blocked: false };
    private listeners = new Set<() => void>();
    private stop: (() => void) | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private flight: SmartPlan | null = null;
    private clients = 0;
    private started = false;
    private loadTimer: ReturnType<typeof setTimeout> | undefined;
    constructor(readonly uid: string, private adapter: PlanAdapter) { }
    private emit() { this.state = { ...this.state }; this.listeners.forEach(fn => fn()); }
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    snapshot = () => this.state;
    connect() { this.clients++; if (!this.started) {
        this.started = true;
        this.hydrate();
    } if (!this.stop && !this.state.blocked)
        this.listen(); return () => { if (--this.clients === 0) {
        this.stop?.();
        this.stop = null;
        clearTimeout(this.loadTimer);
    } }; }
    private hydrate() {
        try {
            const confirmed = this.adapter.loadConfirmed(), draft = this.adapter.loadDraft(), legacy = this.adapter.loadLegacy();
            if (confirmed && !validSmartPlan(confirmed, this.uid) || draft && (!validSmartPlan(draft.plan, this.uid) || draft.base && !validSmartPlan(draft.base, this.uid)))
                throw new Error();
            const recovery = draft ?? (legacy ? { plan: legacy, base: confirmed, baseRevision: revisionOf(confirmed), description: 'Recover previous device edits' } : null);
            if (recovery && !validSmartPlan(recovery.plan, this.uid))
                throw new Error();
            this.state = { ...this.state, confirmed, draft: recovery, plan: recovery?.plan ?? confirmed, status: recovery ? 'pending' : confirmed ? 'device' : 'loading' };
        }
        catch {
            this.state = { ...this.state, blocked: true, status: 'failed', error: 'storage-corrupt' };
        }
        this.emit();
    }
    private listen() { clearTimeout(this.loadTimer); this.loadTimer = setTimeout(() => { if (!this.state.known) {
        this.state = { ...this.state, status: 'failed', error: 'load-timeout' };
        this.emit();
    } }, 12000); this.stop = this.adapter.listen(this.observe, () => { clearTimeout(this.loadTimer); this.state = { ...this.state, status: 'failed', error: 'load-failed', known: false }; this.emit(); }); }
    observe = (snapshot: PlanSnapshot) => {
        if (this.state.blocked || snapshot.pending)
            return;
        const incoming = snapshot.plan;
        if (incoming && !validSmartPlan(incoming, this.uid)) {
            this.state = { ...this.state, blocked: true, status: 'failed', error: 'record-invalid' };
            this.emit();
            return;
        }
        // Firestore's initial cache miss is not proof that a saved plan is absent.
        if (snapshot.fromCache) {
            if (!this.state.plan && incoming) {
                this.state = { ...this.state, plan: incoming, confirmed: incoming, status: 'device' };
                this.emit();
            }
            return;
        }
        clearTimeout(this.loadTimer);
        if (this.state.confirmed && incoming && sequenceOf(incoming) < sequenceOf(this.state.confirmed))
            return;
        try {
            const cached = this.state.confirmed;
            let draft = this.state.draft;
            if (!draft && cached && (incoming === null && (cached.updatedAt > 0 || cached.tasks.length > 0) || incoming && sequenceOf(incoming) === sequenceOf(cached) && incoming.revision !== cached.revision && incoming.updatedAt < cached.updatedAt)) {
                draft = { plan: cached, base: cached, baseRevision: cached.revision, description: 'Recover a newer device copy' };
                this.adapter.storeDraft(draft);
                this.state = { ...this.state, draft, plan: cached };
            }
            this.adapter.storeConfirmed(incoming);
            if (draft && incoming?.revision === draft.plan.revision) {
                this.adapter.storeDraft(null);
                this.adapter.retireLegacy();
                this.state = { ...this.state, known: true, confirmed: incoming, plan: incoming, draft: null, remote: null, status: 'synced', error: '' };
            }
            else if (draft && revisionOf(incoming) !== draft.baseRevision && (!this.flight || incoming?.revision !== this.flight.revision)) {
                this.state = { ...this.state, known: true, confirmed: incoming, remote: incoming, status: 'conflict', error: 'conflict' };
            }
            else {
                this.state = { ...this.state, known: true, confirmed: incoming, plan: draft?.plan ?? incoming, remote: null, status: draft ? 'pending' : 'synced', error: '' };
            }
        }
        catch {
            this.state = { ...this.state, status: 'failed', error: 'storage-failed', blocked: true };
        }
        this.emit();
        if (!this.state.remote && this.state.status !== 'conflict')
            this.schedule();
    };
    begin = () => { if (!this.state.known || this.state.plan || this.state.blocked)
        return false; const plan = initialSmartPlan(this.uid); this.state = { ...this.state, plan }; this.emit(); return this.save(plan, 'Start plan setup'); };
    save = (next: SmartPlan, description = 'Edit plan'): boolean => {
        if (this.state.blocked || this.state.status === 'conflict' || next.userId !== this.uid || !this.state.plan || next.revision !== this.state.plan.revision || !validSmartPlan(next, this.uid))
            return false;
        if (!this.state.known && !this.state.confirmed)
            return false;
        const plan = clonePlan({ ...next, revision: this.adapter.id(), updatedAt: this.adapter.now() });
        const base = this.state.draft?.base ?? this.state.confirmed;
        const draft: PlanDraft = { plan, base: clonePlan(base), baseRevision: revisionOf(base), description };
        try {
            if (new TextEncoder().encode(JSON.stringify(plan)).length > 850000)
                throw new Error();
            this.adapter.storeDraft(draft);
        }
        catch {
            this.state = { ...this.state, status: 'failed', error: 'storage-failed' };
            this.emit();
            return false;
        }
        this.state = { ...this.state, plan, draft, status: this.adapter.readOnly ? 'device' : 'pending', error: '' };
        this.emit();
        this.schedule();
        return true;
    };
    private schedule() { if (this.timer)
        clearTimeout(this.timer); if (this.adapter.readOnly || !this.state.known || this.state.blocked || this.state.status === 'conflict' || !this.state.draft || this.flight)
        return; this.timer = setTimeout(() => { void this.flush(); }, 400); }
    flush = async () => {
        const draft = this.state.draft;
        if (!draft || this.flight || !this.state.known || this.state.blocked || this.state.status === 'conflict' || this.adapter.readOnly)
            return;
        this.flight = draft.plan;
        const operation = draft.plan;
        this.state = { ...this.state, status: 'saving', error: '' };
        this.emit();
        const timeout = setTimeout(() => { if (this.flight?.revision === operation.revision && this.state.draft) {
            this.state = { ...this.state, status: 'failed', error: 'save-timeout' };
            this.emit();
        } }, 20000);
        try {
            const saved = await this.adapter.commit(operation, draft.base, draft.description);
            if (this.state.status === 'conflict' && (this.state.confirmed === null || sequenceOf(this.state.confirmed) >= sequenceOf(saved)) && revisionOf(this.state.confirmed) !== saved.revision || sequenceOf(this.state.confirmed) > sequenceOf(saved)) {
                if (this.state.draft?.plan.revision === operation.revision && this.state.confirmed) {
                    this.adapter.storeDraft(null);
                    this.adapter.retireLegacy();
                    this.state = { ...this.state, plan: this.state.confirmed, draft: null, remote: null, status: 'synced', error: '' };
                }
                else if (this.state.draft) {
                    const recovery = { ...this.state.draft, base: saved, baseRevision: saved.revision };
                    this.adapter.storeDraft(recovery);
                    this.state = { ...this.state, draft: recovery, status: 'conflict', remote: this.state.confirmed, error: 'conflict' };
                }
                return;
            }
            this.adapter.storeConfirmed(saved);
            if (this.state.draft?.plan.revision === operation.revision) {
                this.adapter.storeDraft(null);
                this.adapter.retireLegacy();
                this.state = { ...this.state, confirmed: saved, plan: saved, draft: null, remote: null, known: true, status: 'synced', error: '' };
            }
            else if (this.state.draft) {
                const next = { ...this.state.draft, base: saved, baseRevision: saved.revision };
                this.adapter.storeDraft(next);
                this.state = { ...this.state, confirmed: saved, draft: next, known: true, status: 'pending' };
            }
        }
        catch (e) {
            if (e instanceof PlanConflict) {
                this.state = { ...this.state, confirmed: e.latest, remote: e.latest, known: true, status: 'conflict', error: 'conflict' };
            }
            else {
                this.state = { ...this.state, status: 'failed', error: 'save-failed' };
            }
        }
        finally {
            clearTimeout(timeout);
            this.flight = null;
            this.emit();
            if (this.state.status === 'pending')
                this.schedule();
        }
    };
    retry = () => { if (this.state.blocked)
        return; this.stop?.(); this.stop = null; this.listen(); if (this.state.known && this.state.status !== 'conflict')
        void this.flush(); };
    useSaved = () => { if (this.state.status !== 'conflict')
        return; try {
        if (this.state.draft)
            this.adapter.backup(this.state.draft);
        this.adapter.storeDraft(null);
        this.adapter.retireLegacy();
        this.state = { ...this.state, plan: this.state.confirmed, draft: null, remote: null, status: 'synced', error: '' };
        this.emit();
    }
    catch {
        this.state = { ...this.state, error: 'storage-failed', status: 'failed' };
        this.emit();
    } };
    applyMerged = (merged: SmartPlan) => { if (this.state.status !== 'conflict' || !this.state.draft)
        return false; try {
        this.adapter.backup(this.state.draft);
    }
    catch {
        return false;
    } const previous = this.state; this.state = { ...this.state, plan: { ...merged, revision: this.state.plan!.revision }, draft: null, remote: null, status: 'pending' }; const accepted = this.save(this.state.plan!, 'Resolve concurrent edits'); if (!accepted)
        this.state = previous; return accepted; };
    receiveDraft = (draft: PlanDraft | null) => {
        if (draft && (draft.plan.userId !== this.uid || draft.plan.revision === this.state.plan?.revision))
            return;
        if (!draft && !this.state.draft)
            return;
        this.state = { ...this.state, draft: this.state.draft || draft, remote: this.state.confirmed, status: 'conflict', error: 'tab-changed' };
        this.emit();
    };
}
type Resolution = Record<string, 'mine' | 'saved'>;
export function mergePlannerPlans(base: SmartPlan | null, mine: SmartPlan, saved: SmartPlan | null, choices: Resolution = {}) {
    if (!saved)
        return { plan: mine, conflicts: choices['plan:deleted'] === 'mine' ? [] : ['plan:deleted'] };
    const conflicts: string[] = [];
    const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const merge = (b: any, m: any, s: any, path: string): any => {
        if (equal(m, b))
            return s;
        if (equal(s, b) || equal(m, s))
            return m;
        if (Array.isArray(m) && Array.isArray(s) && [...(Array.isArray(b) ? b : []), ...m, ...s].every(v => v && typeof v === 'object' && (typeof v.id === 'string' || typeof v.taskId === 'string' && typeof v.start === 'number'))) {
            const key = (v: any) => v.id || `${v.taskId}:${v.start}:${v.end}`;
            const bm = new Map((b || []).map((v: any) => [key(v), v])), mm = new Map(m.map((v: any) => [key(v), v])), sm = new Map(s.map((v: any) => [key(v), v]));
            return [...new Set([...sm.keys(), ...mm.keys(), ...bm.keys()])].map(id => merge(bm.get(id), mm.get(id), sm.get(id), `${path}:${id}`)).filter(v => v !== undefined);
        }
        if (m && s && !Array.isArray(m) && !Array.isArray(s) && typeof m === 'object' && typeof s === 'object')
            return Object.fromEntries([...new Set([...Object.keys(s), ...Object.keys(m), ...Object.keys(b || {})])].map(key => [key, merge(b?.[key], m[key], s[key], `${path}:${key}`)]).filter(([, v]) => v !== undefined));
        if (!choices[path])
            conflicts.push(path);
        return choices[path] === 'mine' ? m : s;
    };
    const meta = ['revision', 'updatedAt', 'sequence', 'previousRevision', 'persistenceVersion', 'confirmedAt'];
    const clean = (p: SmartPlan | null) => p ? Object.fromEntries(Object.entries(p).filter(([k]) => !meta.includes(k))) : null;
    const value = merge(clean(base), clean(mine), clean(saved), 'plan');
    return { plan: { ...saved, ...value, revision: mine.revision } as SmartPlan, conflicts };
}
