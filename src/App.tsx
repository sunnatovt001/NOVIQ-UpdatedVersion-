/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/src/contexts/AuthContext";
import { Layout } from "@/src/components/Layout";
import { Landing } from "@/src/pages/Landing";
import { trackSiteVisit } from "@/src/lib/analytics";
import { Onboarding } from "@/src/components/Onboarding";
import { AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const LOGO_SRC = "/noviq-logo.jpeg";

const lazyPage = <T extends React.ComponentType<any>>(
  loader: () => Promise<Record<string, T>>,
  exportName: string,
) =>
  React.lazy(async () => {
    const module = await loader();
    return { default: module[exportName] };
  });

const Dashboard = lazyPage(() => import("@/src/pages/Dashboard"), "Dashboard");
const Planner = lazyPage(() => import("@/src/pages/Planner"), "Planner");
const Tutor = lazyPage(() => import("@/src/pages/Tutor"), "Tutor");
const Notes = lazyPage(() => import("@/src/pages/Notes"), "Notes");
const Flashcards = lazyPage(
  () => import("@/src/pages/Flashcards"),
  "Flashcards",
);
const Focus = lazyPage(() => import("@/src/pages/Focus"), "Focus");
const Community = lazyPage(() => import("@/src/pages/Community"), "Community");
const Analytics = lazyPage(() => import("@/src/pages/Analytics"), "Analytics");
const Admin = lazyPage(() => import("@/src/pages/Admin"), "Admin");
const Profile = lazyPage(() => import("@/src/pages/Profile"), "Profile");
const Pricing = lazyPage(() => import("@/src/pages/Pricing"), "Pricing");

const LoadingScreen = ({
  message = "Preparing your workspace",
}: {
  message?: string;
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0, scale: 0.98 }}
    transition={{ duration: 0.28, ease: "easeOut" }}
    className="fixed inset-0 z-[200] flex items-center justify-center bg-[#FAFAF8] text-[#111827]"
  >
    <div className="relative flex flex-col items-center">
      <motion.div
        animate={{ y: [0, -8, 0], scale: [1, 1.04, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <img
          src={LOGO_SRC}
          alt="Noviq logo"
          className="relative h-20 w-20 rounded-[2rem] border border-[#E5E7EB] object-cover shadow-[0_18px_50px_rgba(17,24,39,0.10)]"
        />
      </motion.div>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: 160 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="mt-8 h-1 overflow-hidden rounded-full bg-[#E5E7EB]"
      >
        <motion.div
          animate={{ x: [-120, 160] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          className="h-full w-20 rounded-full bg-[#3F7D58]"
        />
      </motion.div>
      <p className="mt-5 text-xs font-black uppercase tracking-[0.28em] text-[#6B7280]">
        {message}
      </p>
    </div>
  </motion.div>
);

const AppContent = () => {
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
    const requested = window.location.hash.replace(/^#\/?/, "");
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
    return (
      <AnimatePresence mode="wait">
        <LoadingScreen />
      </AnimatePresence>
    );
  }

  if (authError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#FAFAF8] p-6 text-[#111827]">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-center shadow-2xl">
          <AlertCircle className="mx-auto text-red-600" size={34} />
          <h1 className="mt-4 text-xl font-bold">
            Account access needs attention
          </h1>
          <p className="mt-3 text-sm leading-6 text-red-800">{authError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-red-700 px-4 py-2 font-semibold text-white"
          >
            Try again
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
            You have a friend invitation. Sign in with the invited email address
            to accept it.
          </p>
        )}
        <Landing />
      </>
    );
  }

  if (user && !profile) {
    return (
      <AnimatePresence mode="wait">
        <LoadingScreen message="Loading your profile" />
      </AnimatePresence>
    );
  }

  if (user && !hasCompletedOnboarding) {
    return (
      <Onboarding
        onComplete={async (answers) => {
          await completeOnboarding(answers);
        }}
      />
    );
  }

  const renderContent = () => {
    const props = { setActiveTab };
    switch (activeTab) {
      case "dashboard":
        return <Dashboard setActiveTab={setActiveTab} />;
      case "planner":
        return <Planner />;
      case "tutor":
        return <Tutor setActiveTab={setActiveTab} />;
      case "notes":
        return <Notes />;
      case "flashcards":
        return <Flashcards />;
      case "focus":
        return <Focus />;
      case "community":
        return <Community />;
      case "analytics":
        return <Analytics {...props} />;
      case "pricing":
        return <Pricing {...props} />;
      case "admin":
        return <Admin {...props} />;
      case "profile":
        return <Profile />;
      default:
        return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      <Suspense fallback={<LoadingScreen message="Loading page" />}>
        {renderContent()}
      </Suspense>
    </Layout>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
