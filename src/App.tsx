import { SyncNotice } from '@/src/features/progression/SyncNotice';
import { writePagePath } from '@/src/lib/navigation';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/src/contexts/AuthContext";
import { useLocale } from "@/src/contexts/LocaleContext";
import { getAppCopy } from "@/src/features/auth/appCopy";
import { AppLoadingScreen } from "@/src/features/auth/AppLoadingScreen";
import { getAccountErrorMessage } from "@/src/features/auth/accountErrors";
import { prepareRoutePage, RoutePage } from "@/src/components/RoutePage";
import { transitionRoute } from '@/src/lib/routeTransition';
import {useMembership} from '@/src/features/pro/MembershipContext';
import {useProCopy} from '@/src/features/pro/proCopy';
import {MembershipProvider} from '@/src/features/pro/MembershipContext';
import {membershipFailureMessage} from '@/src/features/pro/membershipFailure';
import { Landing } from "@/src/pages/Landing";
import { trackSiteVisit } from "@/src/lib/analytics";
import type { OnboardingAnswers } from "@/src/components/Onboarding";
import { hasCompletedOnboarding, initialOnboardingAnswers } from '@/src/features/onboarding/onboardingState';
import { isRegistrationOnboarding, setRegistrationOnboarding } from '@/src/features/onboarding/registrationFlow';
import { AlertCircle } from "lucide-react";
const loadMongoBackendCheck = () => import('@/src/features/auth/MongoBackendCheck');
const loadFreeLayout = () => import('@/src/features/free/FreeLayout');
const loadLayout = () => import("@/src/components/Layout");
const loadOnboarding = () => import("@/src/components/Onboarding");

const pageLoaders: Record<string, () => Promise<Record<string, any>>> = {
  Dashboard: () => import("@/src/pages/Dashboard"), Planner: () => import("@/src/features/planner/PlannerRoute"),
  Tutor: () => import("@/src/pages/Tutor"), Notes: () => import("@/src/pages/Notes"),
  Flashcards: () => import("@/src/pages/Flashcards"), Focus: () => import("@/src/pages/Focus"),
  Community: () => import("@/src/pages/Community"), Analytics: () => import("@/src/pages/Analytics"),
  Admin: () => import("@/src/pages/Admin"), Profile: () => import("@/src/pages/Profile"), Pricing: () => import("@/src/pages/Pricing"),
};

const freePageLoaders: Record<string, () => Promise<Record<string, any>>> = {
  Dashboard: () => import('@/src/features/free/FreeDashboard'),
  Planner: () => import('@/src/features/free/FreePlanner'),
  Flashcards: () => import('@/src/features/free/FreeFlashcards'),
  Focus: () => import('@/src/features/free/FreeFocus'),
  Notes: () => import('@/src/features/free/FreeNotes'),
  Tutor: () => import('@/src/features/free/FreeTutor'),
  Analytics: () => import('@/src/features/free/FreeAnalytics'),
  Pricing: () => import('@/src/features/free/FreePricing'),
};

const AppContent = () => {
  const membership = useMembership(), proCopy = useProCopy();
  const { locale } = useLocale();
  const copy = getAppCopy(locale);
  const { user, profile, loading, authError, completeOnboarding } = useAuth();
  const validTabs = [
    "dashboard",
    "planner",
    "tutor",
    "notes",
    "flashcards",
    "focus",
    "community",
    "analytics",
    "pricing",
    "admin",
    "profile",
    "onboarding",
  ];
  const readTab = () => {
    const requested = (window.location.pathname).replace(/^#?\/?/, "").replace(/\/$/, "");
    if (validTabs.includes(requested)) return requested;
    return new URLSearchParams(window.location.search).has("invite")
      ? "community"
      : "landing";
  };
  const [activeTab, updateActiveTab] = useState(readTab);
  const activeTabRef = useRef(activeTab), navigationId = useRef(0);
  activeTabRef.current = activeTab;
  const navigate = useCallback(async (tab: string, changePath: boolean) => {
    if (tab === activeTabRef.current) {
      navigationId.current++;
      delete document.documentElement.dataset.routePending;
      if (changePath) writePagePath(tab);
      return;
    }
    const id = ++navigationId.current;
    document.documentElement.dataset.routePending = tab;
    const pageName = tab.charAt(0).toUpperCase() + tab.slice(1);
    const loader = !membership.cinematic && freePageLoaders[pageName] || pageLoaders[pageName];
    if (loader) {
      try { await prepareRoutePage(loader, pageName); }
      catch { /* The route boundary provides the existing retry controls. */ }
    }
    if (id !== navigationId.current) return;
    delete document.documentElement.dataset.routePending;
    transitionRoute(() => {
      if (id !== navigationId.current) return;
      activeTabRef.current = tab;
      if (changePath) writePagePath(tab);
      updateActiveTab(tab);
    });
  }, [membership.cinematic, user?.uid]);
  const setActiveTab = useCallback((tab: string) => { void navigate(tab, true); }, [navigate]);
  useEffect(() => {
    const onNavigate = () => { void navigate(readTab(), false); };
    window.addEventListener("popstate", onNavigate);
    return () => window.removeEventListener("popstate", onNavigate);
  }, [navigate]);
  useEffect(() => () => {
    navigationId.current++;
    delete document.documentElement.dataset.routePending;
  }, [membership.cinematic, user?.uid]);

  // Login and membership updates can cancel a route that is still preloading.
  // The URL may already say /dashboard, so no second navigation event will arrive.
  // Resume that destination once authentication has settled.
  useEffect(() => {
    if (!user || loading) return;
    const requested = readTab();
    if (requested !== 'landing' && requested !== activeTabRef.current) {
      void navigate(requested, false);
    }
  }, [user?.uid, loading, navigate, activeTab]);

  useEffect(() => {
    if (loading) return;

    const pageName = user ? activeTab || "dashboard" : "landing";
    trackSiteVisit(pageName, user?.uid).catch(() => undefined);
  }, [activeTab, loading, user]);

  const needsOnboarding = Boolean(user && !hasCompletedOnboarding(profile) && isRegistrationOnboarding(user.uid, window.location.pathname));

  // The public homepage remains reachable even when an account is signed in.
  if (activeTab === 'landing') return <Landing />;

  if (loading) {
    return <AppLoadingScreen />;
  }

  if (authError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#FAFAF8] p-6 text-[#111827]">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-center shadow-2xl">
          <AlertCircle className="mx-auto text-red-600" size={34} />
          <h1 className="mt-4 text-xl font-bold">
            {copy.accountTitle}
          </h1>
          <p className="mt-3 text-sm leading-6 text-red-800">{getAccountErrorMessage(authError, locale)}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-red-700 px-4 py-2 font-semibold text-white"
          >
            {copy.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {new URLSearchParams(window.location.search).has("invite") && (
          <p
            role="status"
            className="bg-blue-50 px-6 py-4 text-center text-sm text-blue-900"
          >
            {copy.invitation}
          </p>
        )}
        <Landing />
      </>
    );
  }

  if (user && !profile) {
    return <AppLoadingScreen message={copy.profileLoading} />;
  }

  if (user && needsOnboarding) {
    return (
      <RoutePage key={`onboarding:${user.uid}`} loader={loadOnboarding} name="Onboarding" pageProps={{
        initialAnswers: initialOnboardingAnswers(profile),
        onComplete: async (answers: OnboardingAnswers) => {
          await completeOnboarding(answers);
          setRegistrationOnboarding(null);
          if (window.location.pathname !== '/dashboard') setActiveTab('dashboard');
        },
      }} />
    );
  }

  // Verification failure must not take the user's existing Free tools offline.
  // Premium access still requires the provider's authenticated server response.
  if (!membership.available && !membership.error) {
    return <AppLoadingScreen message={proCopy.loading}/>;
  }
  const premium = membership.cinematic;
  const pageName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
  const name = pageLoaders[pageName] ? pageName : "Dashboard";
  return (
      <RoutePage key={`${user.uid}:${premium ? 'pro' : 'free'}`} loader={premium ? loadLayout : loadFreeLayout} name="Layout" pageProps={{ activeTab, setActiveTab,
        children: <>
          {!membership.available && membership.error && <SyncNotice message={membershipFailureMessage(membership.failure, locale)} onRefresh={() => void membership.refresh()}/>}
          <RoutePage key={name} loader={!premium && freePageLoaders[name] ? freePageLoaders[name] : pageLoaders[name]} name={name} pageProps={{ setActiveTab }} />
        </>,
      }} />
  );
};

export default function App() {
  if (import.meta.env.VITE_ENABLE_MONGO_STAGING === 'true' && window.location.pathname === '/backend-check') return <RoutePage loader={loadMongoBackendCheck} name="MongoBackendCheck" />;
  return (
    <AuthProvider>
      <MembershipProvider><AppContent /></MembershipProvider>
    </AuthProvider>
  );
}
