import { isRecord } from './studyHttp.mjs';
export const mutableProfileKeys = ['displayName','photoURL','onboarded','onboardingAnswers','onboardingCompleted','onboarding','onboardingCompletedAt','goals','currentLevel','showActionButtons','settings'];
const goals = ['Prepare for IELTS','Prepare for SAT','Prepare for HSK','Reach a CEFR level','Improve school grades','Prepare for university entrance','Stay consistent with exam prep'];
const profiles = ['High school student','University student','IELTS learner','SAT learner','HSK learner','CEFR learner','University entrance candidate'];
const challenges = ['Staying consistent','Procrastination','Distractions','Organizing study materials','Time management','Remembering information','Exam anxiety'];
export function validProfilePatch(patch, current, now) {
  if (!isRecord(patch) || Object.keys(patch).some(k => !mutableProfileKeys.includes(k))) return false;
  const next = { ...current, ...patch };
  if ('onboardingCompleted' in next && typeof next.onboardingCompleted !== 'boolean') return false;
  if (current.onboardingCompleted === true && next.onboardingCompleted !== true) return false;
  if (next.onboardingCompleted === true) {
    const form = next.onboarding, time = next.onboardingCompletedAt;
    if (!isRecord(form) || Object.keys(form).length !== 3 || !goals.includes(form.goal) ||
        !profiles.includes(form.profile) || !challenges.includes(form.challenge) ||
        !(time instanceof Date) || !Number.isFinite(time.getTime()) || time > now) return false;
  }
  return true;
}
export function dailyVisitPatch(profile, now) {
  const today = Math.floor((now.getTime() + 18000000) / 86400000);
  const previous = profile.visitStreak ?? 0, best = profile.bestVisitStreak ?? 0;
  if (![previous,best].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid visit state.');
  const expected = profile.lastVisitDay === today ? previous : profile.lastVisitDay === today-1 ? previous+1 : 1;
  return { visitStreak: expected, bestVisitStreak: Math.max(best,expected), lastVisitDay:today,lastVisitAt:now };
}
