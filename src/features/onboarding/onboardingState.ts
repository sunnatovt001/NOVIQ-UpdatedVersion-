import type { UserProfile } from '@/src/types';
import { onboardingOptionValue } from './onboardingCopy';

export type OnboardingAnswers = { mainGoal: string; userType: string; struggle: string };
export const emptyOnboardingAnswers = (): OnboardingAnswers => ({ mainGoal: '', userType: '', struggle: '' });

// Explicit new flags win. Previously completed profiles keep their existing
// access even though they predate the new schema; no migration write is needed.
export function hasCompletedOnboarding(profile: Pick<UserProfile, 'onboardingCompleted' | 'onboarded'> | null | undefined) {
  return profile?.onboardingCompleted === true || (profile?.onboardingCompleted === undefined && profile?.onboarded === true);
}


export function validOnboardingAnswers(answers: OnboardingAnswers) {
  return ['mainGoal', 'userType', 'struggle'].every((key, step) =>
    Array.from({ length: 7 }, (_, option) => onboardingOptionValue(step, option)).includes(answers?.[key as keyof OnboardingAnswers]));
}

export function legacyOnboardingProfilePatch(answers: OnboardingAnswers) {
  if (!validOnboardingAnswers(answers)) throw new Error('Choose one valid answer for every step.');
  return { onboarded: true, onboardingAnswers: { ...answers }, goals: [answers.mainGoal] };
}

export function onboardingProfilePatch(answers: OnboardingAnswers, completedAt: unknown) {
  return {
    ...legacyOnboardingProfilePatch(answers),
    onboardingCompleted: true,
    onboarding: { goal: answers.mainGoal, profile: answers.userType, challenge: answers.struggle },
    onboardingCompletedAt: completedAt,
  };
}

export function initialOnboardingAnswers(profile: UserProfile | null): OnboardingAnswers {
  return {
    mainGoal: profile?.onboarding?.goal || profile?.onboardingAnswers?.mainGoal || '',
    userType: profile?.onboarding?.profile || profile?.onboardingAnswers?.userType || '',
    struggle: profile?.onboarding?.challenge || profile?.onboardingAnswers?.struggle || '',
  };
}
