/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/src/contexts/AuthContext";
import { useLocale } from "@/src/contexts/LocaleContext";
import { getAppCopy } from "@/src/features/auth/appCopy";
import { AppLoadingScreen } from "@/src/features/auth/AppLoadingScreen";
import { getAccountErrorMessage } from "@/src/features/auth/accountErrors";
import { RoutePage } from "@/src/components/RoutePage";
import { Landing } from "@/src/pages/Landing";
import { trackSiteVisit } from "@/src/lib/analytics";
import type { OnboardingAnswers } from "@/src/components/Onboarding";
import { AlertCircle } from "lucide-react";
const loadMongoBackendCheck = () => import('@/src/features/auth/MongoBackendCheck');
const loadLayout = () => import("@/src/components/Layout");
const loadOnboarding = () => import("@/src/components/Onboarding");

const pageLoaders: Record<string, () => Promise<Record<string, any>>> = {
  Dashboard: () => import("@/src/pages/Dashboard"), Planner: () => import("@/src/pages/Planner"),
  Tutor: () => import("@/src/pages/Tutor"), Notes: () => import("@/src/pages/Notes"),
  Flashcards: () => import("@/src/pages/Flashcards"), Focus: () => import("@/src/pages/Focus"),
  Community: () => import("@/src/pages/Community"), Analytics: () => import("@/src/pages/Analytics"),
  Admin: () => import("@/src/pages/Admin"), Profile: () => import("@/src/pages/Profile"), Pricing: () => import("@/src/pages/Pricing"),
};

const AppContent = () => {
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
  ];
  const readTab = () => {
    const requested = (window.location.hash || window.location.pathname).replace(/^#?\/?/, "").replace(/\/$/, "");
    if (validTabs.includes(requested)) return requested;
    return new URLSearchParams(window.location.search).has("invite")
      ? "community"
      : "dashboard";
  };
  const [activeTab, updateActiveTab] = useState(readTab);
  const setActiveTab = useCallback((tab: string) => {
    window.location.hash = `/${tab}`;
    updateActiveTab(tab);
  }, []);
  useEffect(() => {
    const onNavigate = () => updateActiveTab(readTab());
    window.addEventListener("hashchange", onNavigate);
    return () => window.removeEventListener("hashchange", onNavigate);
  }, []);

  useEffect(() => {
    if (loading) return;

    const pageName = user ? activeTab || "dashboard" : "landing";
    trackSiteVisit(pageName, user?.uid).catch(() => undefined);
  }, [activeTab, loading, user]);

  const hasCompletedOnboarding = Boolean(
    profile?.onboarded &&
      profile.onboardingAnswers?.mainGoal &&
      profile.onboardingAnswers?.userType &&
      profile.onboardingAnswers?.struggle,
  );

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

  if (user && !hasCompletedOnboarding) {
    return (
      <RoutePage loader={loadOnboarding} name="Onboarding" pageProps={{
        onComplete: async (answers: OnboardingAnswers) => {
          await completeOnboarding(answers);
        },
      }} />
    );
  }

  const pageName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
  const name = pageLoaders[pageName] ? pageName : "Dashboard";
  return (
    <RoutePage loader={loadLayout} name="Layout" pageProps={{ activeTab, setActiveTab,
      children: <RoutePage key={name} loader={pageLoaders[name]} name={name} pageProps={{ setActiveTab }} />,
    }} />
  );
};

export default function App() {
  if (window.location.pathname === '/backend-check') return <RoutePage loader={loadMongoBackendCheck} name="MongoBackendCheck" />;
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
