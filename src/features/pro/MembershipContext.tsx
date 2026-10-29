import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { auth } from '@/src/lib/firebaseAuth';
import { isReadOnlyAudit, useLocalMembership } from '@/src/lib/auditMode';
import config from '../../../functions/pro-config.json';
import type { SubscriptionState } from '@/src/types';
import { membershipFailure, type MembershipFailure } from './membershipFailure';

export type Access = {
  state: string; entitled: boolean; trialEligible: boolean;
  trialStartedAt: string | null; trialEndsAt: string | null;
  currentPeriodEnd: string | null; serverNow: number;
  quotas: typeof config.quotas.free;
  usage?: { dayKey?: string; total?: number; counts?: Record<string, number> };
  billing?: { recurring: boolean; providersConfigured: boolean };
};

// Cached plan display only; paid API requests still require server authorization.
export function displayAccess(s: SubscriptionState | undefined, now = Date.now()): Access {
  const trial = s?.status === 'trialing', end = Date.parse((trial ? s?.trialEndsAt || s?.currentPeriodEnd : s?.currentPeriodEnd) || '');
  const entitled = s?.plan === 'pro' && ['active', 'trialing'].includes(s.status) && end > now;
  return { state: entitled ? trial ? 'PRO_TRIAL' : s?.cancelAtPeriodEnd ? 'PRO_CANCEL_SCHEDULED' : 'PRO_ACTIVE' : s?.status === 'past_due' ? 'PRO_PAST_DUE' : s?.plan === 'pro' || s?.trialStartedAt || s?.status === 'expired' ? 'PRO_EXPIRED' : 'FREE', entitled, trialEligible: config.features.trial && !s?.trialUsed && !s?.trialStartedAt && s?.plan !== 'pro', trialStartedAt: s?.trialStartedAt || null, trialEndsAt: s?.trialEndsAt || null, currentPeriodEnd: s?.currentPeriodEnd || null, serverNow: now, quotas: config.quotas[entitled ? 'pro' : 'free'] };
}

export async function membershipCall<T = Access>(name: string, data: unknown = {}): Promise<T> {
  if (isReadOnlyAudit) throw new Error('Read-only audit');
  if (useLocalMembership && name === 'getMembershipStatus') {
    const user = auth.currentUser;
    if (!user) throw Object.assign(new Error('Sign in required'),{code:'functions/unauthenticated'});
    const response = await fetch('/__local-membership',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:'{}',signal:AbortSignal.timeout(25000)});
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error('Membership verification failed'),{code:`functions/${result.error||'unavailable'}`});
    return result as T;
  }
  const [{ httpsCallable }, { functions }] = await Promise.all([import('@/src/lib/callable'), import('@/src/lib/firebase')]);
  return (await httpsCallable<unknown, T>(functions, name, { timeout: name === 'getMembershipStatus' ? 8000 : 130000 })(data)).data;
}

type Value = {
  access: Access; busy: boolean; error: boolean; available: boolean; failure: MembershipFailure | null;
  refresh: () => Promise<void>; start: () => Promise<void>; cancel: () => Promise<void>;
  now: number; cinematic: boolean; setCinematic: (value: boolean) => void;
};
const Context = createContext<Value | null>(null);
const premiumStates = new Set(['PRO_ACTIVE', 'PRO_TRIAL', 'PRO_CANCEL_SCHEDULED']);

// Firestore maps are unordered. A profile usage write can deliver identical
// subscription fields in a different order; that is not an entitlement change.
export function membershipSourceKey(uid: string | undefined, subscription: SubscriptionState | undefined) {
  return JSON.stringify([uid, subscription || null], (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  });
}

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth(), uid = user?.uid;
  const sourceKey = membershipSourceKey(uid, profile?.subscription);
  const latest = useRef({ uid, sourceKey }); latest.current = { uid, sourceKey };
  const [snapshot, setSnapshot] = useState<{ uid: string; sourceKey: string; value: Access } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [tick, setTick] = useState(Date.now());
  const [failure, setFailure] = useState<MembershipFailure | null>(null);
  const sequence = useRef(0), mutation = useRef(false);
  const anchor = useRef<{ server: number; mono: number } | null>(null);
  const accept = (value: Access, id: string, key: string) => {
    if (latest.current.uid !== id || latest.current.sourceKey !== key) return;
    if (!value || !Number.isFinite(value.serverNow) || typeof value.entitled !== 'boolean' || !value.quotas) throw Object.assign(new Error('Invalid membership response'), { code: 'invalid-response' });
    anchor.current = { server: value.serverNow, mono: performance.now() };
    setSnapshot({ uid: id, sourceKey: key, value }); setTick(value.serverNow);
  };
  const refresh = async () => {
    if (!uid || mutation.current) return;
    const id = uid, key = sourceKey, request = ++sequence.current;
    // Keep Free usable during retries after an unavailable membership service.
    try {
      const value = await membershipCall<Access>('getMembershipStatus');
      if (request === sequence.current && !mutation.current && latest.current.uid === id && latest.current.sourceKey === key) {
        accept(value, id, key); setError(false); setFailure(null);
      }
    } catch (cause) {
      if (latest.current.uid === id && request === sequence.current) { const reason = membershipFailure(cause, navigator.onLine); if (reason !== 'unavailable' && reason !== 'offline') setSnapshot(null); setError(true); setFailure(reason); }
    }
  };
  useEffect(() => {
    anchor.current = null; mutation.current = false; sequence.current++;
    setSnapshot(null); setBusy(false); setError(false); setFailure(null);
    const timer = setInterval(() => setTick(anchor.current ? anchor.current.server + performance.now() - anchor.current.mono : Date.now()), 1000);
    return () => clearInterval(timer);
  }, [uid]);
  useEffect(() => {
    void refresh();
    const visible = () => {
      if (document.hidden) return;
      // Revalidate in the background. Clearing a verified same-account snapshot
      // unmounts AppContent, dropping Tutor drafts and in-flight AI replies.
      // Expiry still advances immediately; every premium API checks entitlement.
      setTick(anchor.current ? anchor.current.server + performance.now() - anchor.current.mono : Date.now());
      void refresh();
    };
    const reconnect = () => { void refresh(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', reconnect);
    return () => { sequence.current++; document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', reconnect); };
  }, [uid, sourceKey]);
  const current = snapshot && snapshot.uid === uid && snapshot.sourceKey === sourceKey ? snapshot.value : null;
  const end = current?.state === 'PRO_TRIAL'
    ? Math.min(Date.parse(current.trialEndsAt || ''), Date.parse(current.currentPeriodEnd || ''))
    : Date.parse(current?.currentPeriodEnd || '');
  const entitled = !!current?.entitled && premiumStates.has(current.state) && Number.isFinite(end) && end > tick;
  const projection = displayAccess(profile?.uid === uid ? profile?.subscription : undefined, tick);
  const savedPremiumAppearance = !current && error && (failure === 'unavailable' || failure === 'offline') && profile?.uid === uid && projection.entitled;
  const access: Access = current
    ? { ...current, entitled, ...(current.entitled && !entitled ? { state: 'PRO_EXPIRED', quotas: config.quotas.free } : {}) }
    : { ...projection, entitled: false, state: 'VERIFYING', quotas: config.quotas.free };
  const action = async (name: string, data: unknown = {}) => {
    if (!uid || mutation.current) return;
    const id = uid; mutation.current = true; sequence.current++; setBusy(true); setError(false); setFailure(null);
    try {
      const value = await membershipCall<Access>(name, data);
      if (latest.current.uid !== id) return;
      accept(value, id, latest.current.sourceKey);
    } catch (cause) {
      if (latest.current.uid === id) { setError(true); setFailure(membershipFailure(cause, navigator.onLine)); }
      throw cause;
    } finally {
      if (latest.current.uid === id) { mutation.current = false; setBusy(false); }
    }
  };
  return <Context.Provider value={{ access, busy, error, failure, available: !!current, refresh,
    start: () => action('startProTrial', { acceptTerms: true }), cancel: () => action('cancelProRenewal'),
    now: tick, cinematic: entitled || savedPremiumAppearance, setCinematic: () => {} }}>{children}</Context.Provider>;
}
export const useMembership = () => {
  const value = useContext(Context);
  if (!value) throw new Error('MembershipProvider is required');
  return value;
};
