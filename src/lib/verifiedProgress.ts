import { httpsCallable } from './callable';
import { functions } from './firebase';
import { isReadOnlyAudit } from './auditMode';

export type XpReceipt = { eventId?: string; xpDelta: number; sourceXp?: number; bonusXp?: number; status: string; capReached?: boolean; duration?: number; recordedDuration?: number; totalXp?: number; level?: number; unlocked?: string[] };
const pending = new Map<string, Promise<unknown>>();
export const updateStudySessionState = (sessionId: string, state: 'pause' | 'resume' | 'heartbeat') => {
  if (isReadOnlyAudit) return Promise.resolve();
  const prior = pending.get(sessionId) || Promise.resolve();
  const call = prior.catch(() => undefined).then(() => httpsCallable(functions, 'updateStudySessionState')({ sessionId, state }));
  pending.set(sessionId, call);
  void call.finally(() => { if (pending.get(sessionId) === call) pending.delete(sessionId); }).catch(() => undefined);
  return call;
};
export const checkInProgress = async (): Promise<void> => { if (!isReadOnlyAudit) await httpsCallable(functions, 'checkInProgress')({}); };
export const setDailyGoalTarget = (minutes: number) => httpsCallable(functions, 'updateDailyGoalTarget')({ minutes });
export const startRecallSession = async (session: { id: string; deckId: string; cardIds: string[]; mode: string }) => {
  const response = await httpsCallable<unknown, { proofId: string }>(functions, 'startRecallSession')({ ...session, sessionId: session.id });
  return response.data.proofId;
};
export const submitRecallAttempt = async (proofId: string, cardId: string, answer: string) =>
  (await httpsCallable<unknown, XpReceipt>(functions, 'submitRecallAttempt')({ proofId, cardId, answer })).data;
