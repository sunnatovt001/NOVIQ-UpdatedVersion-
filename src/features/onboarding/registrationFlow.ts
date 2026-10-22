const KEY = 'noviq:onboarding-registration';

// This marker is routing intent only. Firebase remains the completion authority.
export function setRegistrationOnboarding(uid: string | null) {
  try {
    if (uid) sessionStorage.setItem(KEY, uid);
    else sessionStorage.removeItem(KEY);
  } catch { /* The explicit onboarding route still works without storage. */ }
}

export function isRegistrationOnboarding(uid: string, hash: string) {
  if (hash === '#/onboarding') return true;
  try { return sessionStorage.getItem(KEY) === uid; } catch { return false; }
}
