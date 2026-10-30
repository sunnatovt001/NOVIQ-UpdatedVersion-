// All accounts use the same calendar boundary, including the admin view.
export const visitDay = (at = Date.now()) => Math.floor((at + 18_000_000) / 86_400_000);
type Visits = { visitStreak?: unknown; bestVisitStreak?: unknown; lastVisitDay?: unknown };
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : 0;
export function visitStreaks(data: Visits | null | undefined, at = Date.now()) {
  const gap = visitDay(at) - Number(data?.lastVisitDay);
  const stored = count(data?.visitStreak);
  // A current streak is visible only after a confirmed visit today.
  // Keep the stored run so a visit later today can continue yesterday�s sequence.
  return { current: gap === 0 ? stored : 0, best: Math.max(stored, count(data?.bestVisitStreak)) };
}
export function nextVisit(data: Visits, at = Date.now()) {
  const day = visitDay(at);
  const current = Number(data.lastVisitDay) === day ? count(data.visitStreak)
    : Number(data.lastVisitDay) === day - 1 ? count(data.visitStreak) + 1 : 1;
  return { visitStreak: current, bestVisitStreak: Math.max(current, count(data.bestVisitStreak)), lastVisitDay: day };
}
