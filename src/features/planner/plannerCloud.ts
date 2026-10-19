import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { isReadOnlyAudit } from '@/src/lib/auditMode';
import { loadLocalDataStrict, saveLocalData } from '@/src/lib/localStore';
import { getQueuedOperation, retirePlannerQueue } from '@/src/lib/offlineSync';
import { validSmartPlan, type SmartPlan } from './smartPlannerModel';
import { PlannerRepository, PlanConflict, clonePlan, revisionOf, sequenceOf, type PlanDraft } from './plannerPersistence';
export const smartPlanKey = (uid: string) => `noviq:${uid}:smartPlanner:v2`;
export const plannerDraftKey = (uid: string) => `noviq:${uid}:plannerDraft:v3`;
export type PlanRevision = {
    id: string;
    createdAt: number;
    description: string;
    plan: SmartPlan;
};
const repositories = new Map<string, PlannerRepository>();
const path = (uid: string) => ['users', uid, 'planner', 'smart-v2'];
export async function commitPlannerPlan(uid: string, next: SmartPlan, base: SmartPlan | null, description: string) {
    if (isReadOnlyAudit)
        throw new Error('Read-only audit');
    if (!validSmartPlan(next, uid))
        throw new Error('Invalid plan');
    const target = doc(db, ...path(uid) as [
        string,
        ...string[]
    ]);
    return runTransaction(db, async (transaction) => {
        const document = await transaction.get(target);
        const current = document.exists() ? document.data() as SmartPlan : null;
        if (current && !validSmartPlan(current, uid))
            throw new Error('Invalid saved plan');
        // A retried operation that the server already accepted is a no-op.
        if (current?.revision === next.revision)
            return current;
        if (revisionOf(current) !== revisionOf(base))
            throw new PlanConflict(current);
        const committed: SmartPlan = { ...clonePlan(next), persistenceVersion: 3, previousRevision: revisionOf(base), sequence: sequenceOf(current) + 1, ...(next.ready ? { confirmedAt: current?.confirmedAt || Date.now() } : {}) };
        if (current?.ready || current?.completedOnboardingAt) {
            transaction.set(doc(db, 'users', uid, 'plannerHistory', next.revision), { id: next.revision, userId: uid, createdAt: Date.now(), description: description.slice(0, 200), plan: clonePlan(current) });
        }
        // A single aggregate document keeps sessions/tasks/preferences atomic. CAS protects every replacement.
        transaction.set(target, committed);
        return committed;
    }, { maxAttempts: 3 });
}
export function getPlannerRepository(uid: string) {
    let repository = repositories.get(uid);
    if (repository)
        return repository;
    repository = new PlannerRepository(uid, {
        loadConfirmed: () => loadLocalDataStrict<SmartPlan | null>(smartPlanKey(uid), null),
        loadDraft: () => loadLocalDataStrict<PlanDraft | null>(plannerDraftKey(uid), null),
        loadLegacy: () => { const queued = getQueuedOperation('set', path(uid)); return queued && queued.status !== 'synced' ? queued.data as unknown as SmartPlan : null; },
        storeConfirmed: plan => saveLocalData(smartPlanKey(uid), plan),
        storeDraft: draft => saveLocalData(plannerDraftKey(uid), draft),
        backup: draft => { const key = `noviq:${uid}:plannerRecovery:v3`; const old = loadLocalDataStrict<PlanDraft[]>(key, []); if (!Array.isArray(old))
            throw new Error('Invalid recovery record'); saveLocalData(key, [draft, ...old].slice(0, 5)); },
        listen: (next, error) => onSnapshot(doc(db, ...path(uid) as [
            string,
            ...string[]
        ]), { includeMetadataChanges: true }, s => next({ plan: s.exists() ? s.data() as SmartPlan : null, fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites }), error),
        commit: (next, base, description) => commitPlannerPlan(uid, next, base, description),
        retireLegacy: () => retirePlannerQueue(uid), now: () => Date.now(), id: () => crypto.randomUUID(), readOnly: isReadOnlyAudit
    });
    repositories.set(uid, repository);
    return repository;
}
export async function loadPlanRevisions(uid: string) {
    const snapshot = await getDocs(query(collection(db, 'users', uid, 'plannerHistory'), orderBy('createdAt', 'desc'), limit(12)));
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id } as PlanRevision)).filter(r => Number.isFinite(r.createdAt) && typeof r.description === 'string' && validSmartPlan(r.plan, uid));
}
