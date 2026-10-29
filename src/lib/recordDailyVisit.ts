import { doc, runTransaction, serverTimestamp } from '@/src/lib/dataStore';
import { db } from './firebase';
import { nextVisit, visitDay } from './visitStreak';

export async function recordDailyVisit(uid: string) {
  const ref = doc(db, 'users', uid);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    if (data.lastVisitDay === visitDay()) return;
    transaction.update(ref, { ...nextVisit(data), lastVisitAt: serverTimestamp() });
  });
}
