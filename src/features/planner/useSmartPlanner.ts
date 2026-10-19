import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { isReadOnlyAudit } from '@/src/lib/auditMode';
import { loadLocalDataStrict, saveLocalData } from '@/src/lib/localStore';
import { writeDocWithQueue } from '@/src/lib/offlineSync';
import { getPlannerRepository, plannerDraftKey } from './plannerCloud';
import { type PlanDraft } from './plannerPersistence';
import { type SmartPlan, type FocusReceipt } from './smartPlannerModel';
export { smartPlanKey } from './plannerCloud';
export const focusReceiptKey = (uid: string) => `noviq:${uid}:plannerFocus:v2`;
export const focusContextKey = (uid: string) => `noviq:${uid}:plannerFocusContext:v2`;
export type PlannerFocusContext = {
    taskId: string;
    title: string;
    subject: string;
};
const noUser = { plan: null, confirmed: null, draft: null, remote: null, known: false, status: 'loading' as const, error: '', blocked: true };
const noSubscribe = () => () => { };
export function useSmartPlanner(uid?: string) {
    const repository = useMemo(() => uid ? getPlannerRepository(uid) : null, [uid]);
    const state = useSyncExternalStore(repository?.subscribe || noSubscribe, repository?.snapshot || (() => noUser));
    const [receipts, setReceipts] = useState<FocusReceipt[]>([]), [receiptError, setReceiptError] = useState(false);
    useEffect(() => {
        setReceipts([]);
        setReceiptError(false);
        if (!uid || !repository)
            return;
        const disconnect = repository.connect();
        let active = true;
        const read = () => { try {
            const rows = loadLocalDataStrict<FocusReceipt[]>(focusReceiptKey(uid), []);
            if (!Array.isArray(rows))
                throw new Error();
            return rows.filter(r => r && typeof r.id === 'string' && typeof r.taskId === 'string' && Number.isFinite(r.seconds) && r.seconds > 0 && Number.isFinite(r.timestamp));
        }
        catch {
            setReceiptError(true);
            return [];
        } };
        setReceipts(read());
        const stop = onSnapshot(query(collection(db, 'users', uid, 'planner'), where('kind', '==', 'focusReceipt')), snapshot => { if (!active)
            return; try {
            const byId = new Map(read().map(r => [r.id, r]));
            snapshot.docs.forEach(d => { const r = d.data(); if (r.kind === 'focusReceipt' && typeof r.taskId === 'string' && Number.isFinite(r.seconds) && r.seconds > 0 && Number.isFinite(r.timestamp))
                byId.set(d.id, { id: d.id, taskId: r.taskId, seconds: r.seconds, timestamp: r.timestamp, verified: r.verified === true }); });
            const merged = [...byId.values()];
            saveLocalData(focusReceiptKey(uid), merged);
            setReceipts(merged);
        }
        catch {
            setReceiptError(true);
        } }, () => { if (active)
            setReceiptError(true); });
        const refresh = () => { if (active)
            setReceipts(read()); };
        const storage = (event: StorageEvent) => { if (event.key === plannerDraftKey(uid)) {
            try {
                repository.receiveDraft(loadLocalDataStrict<PlanDraft | null>(event.key, null));
            }
            catch {
                setReceiptError(true);
            }
        } refresh(); };
        window.addEventListener('noviq:offline-sync', refresh);
        window.addEventListener('storage', storage);
        window.addEventListener('online', repository.retry);
        return () => { active = false; disconnect(); stop(); window.removeEventListener('noviq:offline-sync', refresh); window.removeEventListener('storage', storage); window.removeEventListener('online', repository.retry); };
    }, [uid, repository]);
    const owned = state.plan?.userId === uid ? state.plan : null;
    return { plan: owned, confirmed: state.confirmed, receipts: owned ? receipts : [], status: state.status, error: !!state.error || receiptError, errorCode: state.error, blocked: state.blocked, remote: state.remote, conflict: state.status === 'conflict', known: state.known, draft: state.draft,
        save: (next: SmartPlan, description?: string) => repository?.save(next, description) || false, begin: () => repository?.begin() || false, retry: () => repository?.retry(), acceptRemote: () => repository?.useSaved(), applyMerged: (p: SmartPlan) => repository?.applyMerged(p) || false };
}
/** Attribution only: no new XP or second Focus session. */
export function recordPlannerFocus(uid: string, id: string, seconds: number, timestamp: number, verified: boolean, context: PlannerFocusContext | null) {
    if (!context || seconds <= 0 || !Number.isFinite(seconds))
        return;
    const receipt: FocusReceipt = { id: `focus-${id}`, taskId: context.taskId, seconds, timestamp, verified };
    const previous = loadLocalDataStrict<FocusReceipt[]>(focusReceiptKey(uid), []);
    saveLocalData(focusReceiptKey(uid), [receipt, ...previous.filter(r => r.id !== receipt.id)]);
    if (!isReadOnlyAudit)
        void writeDocWithQueue({ userId: uid, path: ['users', uid, 'planner', receipt.id], data: { ...receipt, kind: 'focusReceipt' }, merge: false }).catch(() => undefined);
}
