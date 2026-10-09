import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { useCommunityPresence } from "@/src/lib/useCommunityPresence";
import { isReadOnlyAudit, isLocalAi } from "@/src/lib/auditMode";
import {
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  Timer,
  Calendar,
  Layers,
  Users,
  User,
  BarChart3,
  LogOut,
  Sparkles,
  Menu,
  X,
  ChevronRight,
  Flame,
  Bell,
  CreditCard,
  Moon,
  Sun,
  ChevronsLeft,
  ChevronsRight,
  Languages,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { getAppErrorMessage } from "@/src/lib/errors";
import { calculateLevelName, getLocalDayKey } from "@/src/lib/progress";
import { FloatingTutor } from "@/src/components/FloatingTutor";
import { SyncRecovery } from "@/src/components/SyncRecovery";
import type { UserProfile } from "@/src/types";
import {
  getNotificationPreferences,
  shouldShowPreferenceNotification,
  type NotificationPreferenceKey,
} from "@/src/lib/preferences";
import { useLocale, type AppLocale } from "@/src/contexts/LocaleContext";

interface SidebarItemProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: (id: string) => void;
}

const SidebarItem = ({ id, icon, label, active, collapsed, onClick }: SidebarItemProps) => (
  <button
    onClick={() => onClick(id)}
    aria-current={active ? "page" : undefined}
    aria-label={label}
    title={collapsed ? label : undefined}
    className={cn(
      "group relative flex w-full items-center gap-4 rounded-2xl border px-5 py-3.5 transition-[background-color,border-color,color] duration-150",
      collapsed && "lg:mx-auto lg:h-[3.25rem] lg:w-[3.25rem] lg:justify-center lg:gap-0 lg:px-0 lg:py-0",
      active 
        ? "border-[#3F7D58]/25 bg-[#F0FDF4] text-[#2F6145]" 
        : "border-transparent text-[#6B7280] hover:border-[#E5E7EB] hover:bg-white hover:text-[#111827]"
    )}
  >
    <div className={cn(
      "transition-transform duration-150", 
      active ? "scale-110 text-[#3F7D58]" : "group-hover:scale-110 group-hover:text-[#3F7D58]"
    )}>
      {icon}
    </div>
    <span className={cn(
      "text-sm font-bold tracking-tight transition-transform duration-150",
      active ? "translate-x-1" : "group-hover:translate-x-1",
      collapsed && "lg:hidden"
    )}>
      {label}
    </span>
    
    {active && !collapsed ? (
      <motion.div 
        layoutId="active-pill"
        className="ml-auto h-1.5 w-1.5 rounded-full bg-[#3F7D58]"
      />
    ) : !collapsed ? (
      <ChevronRight size={14} className="ml-auto -translate-x-2 text-[#9CA3AF] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
    ) : (
      <span className={cn("absolute right-1.5 hidden h-1.5 w-1.5 rounded-full lg:block", active ? "bg-[#3F7D58]" : "bg-transparent")} />
    )}
  </button>
);

const LOGO_SRC = "/noviq-logo.jpeg";
type AppTheme = "light" | "dark";

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "streak" | "reminder" | "review" | "ai" | "system";
  read: boolean;
  preference?: NotificationPreferenceKey;
  createdAt?: { toMillis?: () => number };
}

const notificationIconClass: Record<AppNotification["type"], string> = {
  streak: "bg-amber-50 text-amber-600",
  reminder: "bg-[#F0FDF4] text-[#3F7D58]",
  review: "bg-[#F0FDF4] text-[#3F7D58]",
  ai: "bg-[#F0FDF4] text-[#3F7D58]",
  system: "bg-slate-100 text-slate-600",
};

const formatNotificationTime = (notification: AppNotification) => {
  const timestamp = notification.createdAt?.toMillis?.();
  if (!timestamp) return "Now";

  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};

const todayKey = () => getLocalDayKey();

const parseProfileDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dayDistanceFromToday = (value?: string | null) => {
  const parsed = parseProfileDate(value);
  if (!parsed) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const parsedStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.round((todayStart.getTime() - parsedStart.getTime()) / 86400000);
};

const nextMomentumMilestone = (streak: number) => {
  if (streak < 7) return 7;
  if (streak < 14) return 14;
  if (streak < 30) return 30;
  return Math.ceil((streak + 1) / 30) * 30;
};

const getMomentumState = (
  profile: UserProfile | null | undefined,
  translate: ReturnType<typeof useLocale>["t"],
) => {
  if (!profile) {
    return {
      message: translate("shell.momentumLoading"),
      progress: 0,
      caption: translate("shell.today"),
    };
  }

  const streak = Math.max(0, Math.round(Number(profile.streak) || 0));
  const milestone = nextMomentumMilestone(streak);
  const lastStudyKey = profile.lastStudySessionAt ? getLocalDayKey(profile.lastStudySessionAt) : "";
  const completedToday = lastStudyKey === getLocalDayKey();
  const daysSinceStudy = dayDistanceFromToday(profile.lastStudySessionAt || profile.lastActive);
  const progress = streak > 0 ? Math.min(100, Math.max(8, Math.round((streak / milestone) * 100))) : 0;

  if (completedToday) {
    return {
      message: streak > 1
        ? translate("shell.momentumLocked", { streak })
        : translate("shell.momentumStarted"),
      progress: Math.max(progress, 18),
      caption: translate("shell.daysProgress", { current: Math.max(streak, 1), target: milestone }),
    };
  }

  if (streak > 0 && (daysSinceStudy === 0 || daysSinceStudy === 1)) {
    return {
      message: translate("shell.protectStreak", { streak }),
      progress,
      caption: translate("shell.daysProgress", { current: streak, target: milestone }),
    };
  }

  if (daysSinceStudy !== null && daysSinceStudy > 1) {
    return {
      message: translate("shell.cleanStart"),
      progress: 0,
      caption: translate("shell.daysProgress", { current: 0, target: 7 }),
    };
  }

  return {
    message: translate("shell.startFirstSession"),
    progress: 0,
    caption: translate("shell.daysProgress", { current: 0, target: 7 }),
  };
};

export const Layout: React.FC<{ 
  children: React.ReactNode; 
  activeTab: string; 
  setActiveTab: (tab: string) => void;
}> = ({ children, activeTab, setActiveTab }) => {
  const { profile, signOut, user } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const presenceError = useCommunityPresence(user?.uid);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("noviq-sidebar") === "collapsed";
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const pushedNotificationIdsRef = useRef<Set<string>>(new Set());
  const momentum = useMemo(
    () => getMomentumState(profile, t),
    [profile, t],
  );
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("noviq-theme") === "dark" ? "dark" : "light";
  });
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const firstName = profile?.displayName?.split(" ")[0] || "Student";
  const levelName = profile?.levelName || calculateLevelName(profile?.xp || 0);
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => shouldShowPreferenceNotification(profile, notification)),
    [notifications, profile?.settings]
  );
  const unreadCount = useMemo(
    () => visibleNotifications.filter((notification) => !notification.read).length,
    [visibleNotifications]
  );
  const isDarkTheme = theme === "dark";

  const primaryMenuItems = [
    { id: "dashboard", label: t("nav.today"), shortLabel: t("nav.today"), icon: <LayoutDashboard size={20} /> },
    { id: "planner", label: t("nav.planner"), shortLabel: t("nav.plan"), icon: <Calendar size={20} /> },
    { id: "tutor", label: t("nav.tutor"), shortLabel: t("nav.tutor"), icon: <MessageSquare size={20} /> },
    { id: "notes", label: t("nav.library"), shortLabel: t("nav.library"), icon: <BookOpen size={20} /> },
    { id: "focus", label: t("nav.focus"), shortLabel: t("nav.focus"), icon: <Timer size={20} /> },
  ];
  const secondaryMenuItems = [
    { id: "flashcards", label: t("nav.flashcards"), icon: <Layers size={20} /> },
    { id: "community", label: t("nav.community"), icon: <Users size={20} /> },
    { id: "analytics", label: t("nav.progress"), icon: <BarChart3 size={20} /> },
    { id: "pricing", label: t("nav.plans"), icon: <CreditCard size={20} /> },
    ...(profile?.isAdmin ? [{ id: "admin", label: t("nav.admin"), icon: <Users size={20} /> }] : []),
    { id: "profile", label: t("nav.profile"), icon: <User size={20} /> },
  ];

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkTheme);
    window.localStorage.setItem("noviq-theme", theme);
  }, [isDarkTheme, theme]);

  useEffect(() => {
    window.localStorage.setItem("noviq-sidebar", isSidebarCollapsed ? "collapsed" : "expanded");
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!user) return undefined;

    const notificationsQuery = query(
      collection(db, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setNotifications(
          snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })) as AppNotification[]
        );
      },
      (error) => {
        console.warn(getAppErrorMessage(error));
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user || !profile || isReadOnlyAudit) return;

    const seedDailyNotifications = async () => {
      const key = todayKey();
      const notificationPreferences = getNotificationPreferences(profile);
      const notificationsRef = collection(db, "users", user.uid, "notifications");
      const dailyRef = doc(notificationsRef, `daily-${key}`);
      const reminderRef = doc(notificationsRef, `study-reminder-${key}`);
      const reviewRef = doc(notificationsRef, `deck-review-${key}`);
      const aiRef = doc(notificationsRef, "ai-tutor-stability-update");
      const systemRef = doc(notificationsRef, "notebook-sources-update");

      const createIfMissing = async (
        targetRef: ReturnType<typeof doc>,
        payload: Omit<AppNotification, "id" | "createdAt">
      ) => {
        const snapshot = await getDoc(targetRef);
        if (!snapshot.exists()) {
          await setDoc(targetRef, { ...payload, createdAt: serverTimestamp() });
        }
      };

      if (notificationPreferences.dailyStreakSummary) {
        await createIfMissing(dailyRef, {
          type: "streak",
          preference: "dailyStreakSummary",
          title: "Daily progress check",
          body: `Current streak: ${profile.streak || 0}. Complete one focused session to keep momentum.`,
          read: false,
        });
      }

      if (notificationPreferences.studyReminders) {
        await createIfMissing(reminderRef, {
          type: "reminder",
          preference: "studyReminders",
          title: "Study reminder",
          body: `Your daily target is ${profile.dailyTargetMinutes || 30} minutes. Plan one session for today.`,
          read: false,
        });
      }

      if (notificationPreferences.studyReminders) {
        try {
          const decksSnapshot = await getDocs(collection(db, "users", user.uid, "decks"));
          let dueCount = 0;
          await Promise.all(
            decksSnapshot.docs.map(async (deckDoc) => {
              const cardsSnapshot = await getDocs(collection(db, "users", user.uid, "decks", deckDoc.id, "cards"));
              dueCount += cardsSnapshot.docs.filter((cardDoc) => {
                const dueAt = String(cardDoc.data().dueAt || "");
                return dueAt && new Date(dueAt).getTime() <= Date.now();
              }).length;
            })
          );

          if (dueCount > 0) {
            await createIfMissing(reviewRef, {
              type: "review",
              preference: "studyReminders",
              title: "Deck reviews due",
              body: `${dueCount} flashcards are ready for spaced repetition review.`,
              read: false,
            });
          }
        } catch (error) {
          console.warn("Could not seed deck review notification", error);
        }
      }

      if (notificationPreferences.aiSourcePreviews) {
        await createIfMissing(aiRef, {
          type: "ai",
          preference: "aiSourcePreviews",
          title: "Noviq Tutor upgraded",
          body: "Tutor now uses exam goals, chat memory, files, images, PDFs, DOCX, and TXT to coach the next score move.",
          read: false,
        });

        await createIfMissing(systemRef, {
          type: "system",
          preference: "aiSourcePreviews",
          title: "Notebook Engine is live",
          body: "Notebook now turns sources into evidence, exam traps, recall drills, flashcards, knowledge graphs, and source-grounded next actions.",
          read: false,
        });
      }
    };

    seedDailyNotifications().catch((error) => console.warn(getAppErrorMessage(error)));
  }, [profile, user]);

  useEffect(() => {
    if (!visibleNotifications.length || pushPermission !== "granted") return;
    const latest = visibleNotifications[0];
    const timestamp = latest.createdAt?.toMillis?.() || 0;
    if (latest.read || Date.now() - timestamp > 5000 || pushedNotificationIdsRef.current.has(latest.id)) return;
    pushedNotificationIdsRef.current.add(latest.id);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => registration.showNotification(latest.title, { body: latest.body, icon: LOGO_SRC }))
        .catch(() => new Notification(latest.title, { body: latest.body, icon: LOGO_SRC }));
    } else {
      new Notification(latest.title, { body: latest.body, icon: LOGO_SRC });
    }
  }, [visibleNotifications, pushPermission]);

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  const requestPushPermission = async () => {
    if (typeof Notification === "undefined") return;
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("/noviq-sw.js");
    }
    const permission = await Notification.requestPermission();
    setPushPermission(permission);

    if (permission === "granted" && user) {
      await addDoc(collection(db, "users", user.uid, "notifications"), {
        type: "system",
        title: "Push notifications enabled",
        body: "Noviq can now show browser notifications for reminders and study updates.",
        read: false,
        createdAt: serverTimestamp(),
      });
    }
  };

  const markNotificationRead = async (notification: AppNotification) => {
    if (!user || notification.read) return;
    await updateDoc(doc(db, "users", user.uid, "notifications", notification.id), {
      read: true,
      readAt: serverTimestamp(),
    });
  };

  const markAllRead = async () => {
    if (!user) return;
    await Promise.all(
      visibleNotifications
        .filter((notification) => !notification.read)
        .map((notification) =>
          updateDoc(doc(db, "users", user.uid, "notifications", notification.id), {
            read: true,
            readAt: serverTimestamp(),
          })
        )
    );
  };

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const renderThemeToggleButton = () => (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-[#E5E7EB] bg-white text-[#6B7280] transition-all hover:border-[#3F7D58] hover:bg-[#F0FDF4] hover:text-[#111827]"
      aria-label={
        isDarkTheme ? t("shell.switchLight") : t("shell.switchDark")
      }
      title={isDarkTheme ? "Light theme" : "Dark theme"}
    >
      {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );

  const notificationDropdown = (
    <AnimatePresence>
      {notificationsOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          className="noviq-popover-viewport absolute right-0 top-[calc(100%+0.75rem)] z-[500] flex max-h-[min(72vh,520px)] w-[min(92vw,420px)] flex-col overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white text-[#111827] shadow-[0_28px_90px_rgba(17,24,39,0.22)]"
        >
          <div className="flex items-center justify-between border-b border-[#E5E7EB] p-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#111827]">{t("shell.notifications")}</h3>
              <p className="mt-1 text-xs text-[#6B7280]">{unreadCount} unread updates</p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#6B7280] transition hover:border-[#3F7D58] hover:bg-[#F0FDF4] hover:text-[#111827]"
            >
              Mark all read
            </button>
          </div>

          <div className="CustomScrollbar flex-1 overflow-y-auto p-3">
            {visibleNotifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => markNotificationRead(notification)}
                className={cn(
                  "mb-2 flex w-full gap-3 rounded-2xl border p-3 text-left transition",
                  notification.read
                    ? "border-transparent bg-[#FAFAF8] opacity-70 hover:opacity-100"
                    : "border-[#3F7D58]/20 bg-[#F0FDF4]"
                )}
              >
                <span className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", notificationIconClass[notification.type])}>
                  <Bell size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#111827]">{notification.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#6B7280]">{notification.body}</span>
                  <span className="mt-2 block text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                    {formatNotificationTime(notification)}
                  </span>
                </span>
                {!notification.read && <span className="mt-2 h-2 w-2 rounded-full bg-[#3F7D58]" />}
              </button>
            ))}

            {visibleNotifications.length === 0 && (
              <div className="p-8 text-center">
                <Bell className="mx-auto text-[#9CA3AF]" size={28} />
                <p className="mt-3 text-sm font-bold text-[#111827]">{t("shell.noNotifications")}</p>
              </div>
            )}
          </div>

          <div className="border-t border-[#E5E7EB] p-3">
            <button
              type="button"
              onClick={requestPushPermission}
              className="w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-bold text-[#111827] transition hover:border-[#3F7D58] hover:bg-[#F0FDF4]"
            >
              {pushPermission === "granted" ? t("shell.pushEnabled") : t("shell.enablePush")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className={cn("noviq-app relative flex h-screen overflow-hidden font-sans", isDarkTheme && "dark")}>
      <div className="app-bg pointer-events-none fixed inset-0 -z-20 overflow-hidden" />

      {/* Mobile Top Nav */}
      <header className="app-mobile-header fixed left-0 right-0 top-0 z-[100] flex h-[calc(5rem+env(safe-area-inset-top))] items-center justify-between border-b border-[#E5E7EB] bg-white/90 px-5 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3">
          <img
            src={LOGO_SRC}
            alt="Noviq logo"
            className="h-11 w-11 rounded-2xl border border-[#E5E7EB] object-cover"
          />
          <h1 className="font-display text-2xl font-black tracking-tighter text-[#111827]">Noviq</h1>
        </div>
        <div className="flex items-center gap-2">
          {renderThemeToggleButton()}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="app-icon-button flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white text-[#111827] transition-transform active:scale-90"
            aria-label={isMobileMenuOpen ? t("shell.closeMenu") : t("shell.openMenu")}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Sidebar - Desktop & Tablet */}
      <aside className={cn(
        "app-sidebar fixed inset-y-0 left-0 z-[130] flex w-72 flex-col border-r border-[#E5E7EB] bg-[#FAFAF8]/96 shadow-[12px_0_40px_rgba(17,24,39,0.04)] transition-transform duration-200 ease-out lg:relative lg:z-[110] lg:translate-x-0",
        isSidebarCollapsed ? "lg:w-24" : "lg:w-72",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className={cn(
          "flex items-center justify-between p-10 lg:pt-10",
          isSidebarCollapsed && "lg:flex-col lg:gap-4 lg:px-4 lg:py-8"
        )}>
          <button 
            onClick={() => window.open('https://noviq.uz', '_blank')}
            className={cn(
              "flex items-center gap-4 hover:opacity-80 transition-opacity group",
              isSidebarCollapsed && "lg:justify-center lg:gap-0"
            )}
            title="Noviq"
          >
            <img
              src={LOGO_SRC}
              alt="Noviq logo"
              className={cn(
                "h-14 w-14 rounded-[1.25rem] border border-[#E5E7EB] object-cover transition-transform group-hover:rotate-3",
                isSidebarCollapsed && "lg:h-12 lg:w-12 lg:rounded-2xl"
              )}
            />
            <h1 className={cn("font-display text-3xl font-black tracking-tighter text-[#111827]", isSidebarCollapsed && "lg:hidden")}>
              Noviq
            </h1>
          </button>

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            className="app-sidebar-collapse hidden h-10 w-10 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white text-[#6B7280] transition hover:border-[#3F7D58] hover:bg-[#F0FDF4] hover:text-[#111827] lg:flex"
            aria-label={
              isSidebarCollapsed
                ? t("shell.expandSidebar")
                : t("shell.collapseSidebar")
            }
            title={
              isSidebarCollapsed
                ? t("shell.expandSidebar")
                : t("shell.collapseSidebar")
            }
          >
            {isSidebarCollapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
          </button>
          
          <button className="text-[#6B7280] lg:hidden" onClick={() => setIsMobileMenuOpen(false)} aria-label={t("shell.closeMenu")}>
            <X size={24} />
          </button>
        </div>

        <nav aria-label={t("shell.workspaceNavigation")} className={cn(
          "CustomScrollbar flex-1 space-y-2 overflow-y-auto px-6 py-4",
          isSidebarCollapsed && "lg:px-4"
        )}>
          {!isSidebarCollapsed && (
            <p className="px-5 pb-1 text-xs font-semibold text-[#9CA3AF]">{t("shell.workspace")}</p>
          )}
          {primaryMenuItems.map((item) => (
            <SidebarItem
              key={item.id}
              id={item.id}
              label={item.label}
              icon={item.icon}
              active={activeTab === item.id}
              collapsed={isSidebarCollapsed}
              onClick={handleTabChange}
            />
          ))}
          <div className="my-4 border-t border-[#E5E7EB]" />
          {!isSidebarCollapsed && (
            <p className="px-5 pb-1 text-xs font-semibold text-[#9CA3AF]">{t("shell.more")}</p>
          )}
          {secondaryMenuItems.map((item) => (
            <SidebarItem
              key={item.id}
              id={item.id}
              label={item.label}
              icon={item.icon}
              active={activeTab === item.id}
              collapsed={isSidebarCollapsed}
              onClick={handleTabChange}
            />
          ))}
        </nav>

        <div className={cn("space-y-3 p-8", isSidebarCollapsed && "lg:px-4 lg:pb-6")}>
          <div
            className={cn(
              "app-sidebar-card group hidden rounded-2xl border border-[#E5E7EB] bg-white p-5 transition-[border-color] duration-150 hover:border-[#3F7D58]/30 lg:block",
              isSidebarCollapsed && "lg:flex lg:h-[3.25rem] lg:w-[3.25rem] lg:items-center lg:justify-center lg:p-0"
            )}
            title={isSidebarCollapsed ? momentum.message : undefined}
          >
            <div className={cn("flex items-center gap-2 mb-3", isSidebarCollapsed && "lg:mb-0 lg:gap-0")}>
               <Sparkles className="text-[#3F7D58]" size={14} />
               <p className={cn("text-[10px] font-black uppercase tracking-[0.3em] text-[#3F7D58]", isSidebarCollapsed && "lg:hidden")}>{t("shell.momentum")}</p>
            </div>
            <p className={cn("text-xs font-medium leading-relaxed text-[#6B7280] transition-colors group-hover:text-[#111827]", isSidebarCollapsed && "lg:hidden")}>{momentum.message}</p>
            <p className={cn("mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#94A3B8]", isSidebarCollapsed && "lg:hidden")}>{momentum.caption}</p>
            <div className={cn("mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]", isSidebarCollapsed && "lg:hidden")}>
              <div className="h-full rounded-full bg-[#3F7D58] transition-all duration-500" style={{ width: `${momentum.progress}%` }} />
            </div>
          </div>
          
          <label
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 text-[#6B7280]",
              isSidebarCollapsed && "lg:hidden",
            )}
          >
            <Languages size={17} aria-hidden="true" />
            <span className="sr-only">{t("shell.language")}</span>
            <select
              aria-label={t("shell.language")}
              value={locale}
              onChange={(event) =>
                setLocale(event.target.value as AppLocale)
              }
              className="min-h-11 min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
            >
              <option value="en">English</option>
              <option value="uz">O‘zbekcha</option>
              <option value="ru">Русский</option>
            </select>
          </label>

          <button 
            onClick={signOut}
            className={cn(
              "flex w-full items-center gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4 text-[10px] font-black uppercase tracking-[0.22em] text-[#6B7280] transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600",
              isSidebarCollapsed && "lg:mx-auto lg:h-[3.25rem] lg:w-[3.25rem] lg:justify-center lg:gap-0 lg:px-0 lg:py-0"
            )}
            aria-label={t("shell.signOut")}
            title={isSidebarCollapsed ? t("shell.signOut") : undefined}
          >
            <LogOut size={16} />
            <span className={cn(isSidebarCollapsed && "lg:hidden")}>{t("shell.signOut")}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative flex flex-1 flex-col overflow-hidden pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] lg:pb-0 lg:pt-0">
        <div className="app-main-surface pointer-events-none absolute inset-0 rounded-[2rem] border border-[#E5E7EB] bg-white/45" />
        {activeTab !== "dashboard" && <header className={cn("relative z-[300] hidden shrink-0 items-center justify-between lg:flex", activeTab === "tutor" ? "h-20 px-5" : "h-28 px-10 xl:px-14")}>
          <div className="space-y-1">
            <h2 className="group flex items-center gap-3 text-3xl font-bold leading-none tracking-tight text-[#111827]">
                {t("shell.greeting")}, {firstName}
            </h2>
            <p className="text-sm font-medium tracking-wide text-[#6B7280]">
               {t("shell.readyPrefix")} <span className="font-bold text-[#3F7D58]">{t("shell.ready")}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-8">
            <div className="flex gap-8">
               <div className="text-right">
                  <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-[#9CA3AF]">{levelName}</p>
                  <p className="text-xl font-bold leading-none text-[#111827]">{(profile?.xp || 0).toLocaleString()}</p>
               </div>
               <div className="text-right">
                   <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-[#9CA3AF]">{t("shell.currentStreak")}</p>
                  <div className="flex items-center gap-2 justify-end">
                     <Flame size={16} className="text-orange-500 animate-pulse" />
                     <p className="text-xl font-bold text-orange-500 leading-none">{profile?.streak || 0}</p>
                  </div>
               </div>
            </div>

            <div className="mx-2 h-10 w-px bg-[#E5E7EB]" />

            <div className="flex items-center gap-5 translate-y-1">
               {renderThemeToggleButton()}
               <div className="relative z-[400]">
                 <button
                   onClick={() => setNotificationsOpen((current) => !current)}
                   className="relative flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-[#E5E7EB] bg-white text-[#6B7280] transition-all hover:border-[#3F7D58] hover:bg-[#F0FDF4] hover:text-[#111827]"
                    aria-label={t("shell.notifications")}
                 >
                   <Bell size={18} />
                   {unreadCount > 0 && (
                     <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#3F7D58] px-1 text-[10px] font-black text-white">
                       {Math.min(9, unreadCount)}
                     </span>
                   )}
                 </button>
                 {notificationDropdown}
               </div>
               <button 
                 aria-label="Open profile"
                 onClick={() => setActiveTab('profile')}
                 className="group relative h-14 w-14 overflow-hidden rounded-[1.25rem] border border-[#E5E7EB] bg-white transition-all duration-300 hover:scale-105 hover:border-[#3F7D58]"
               >
                 <img src={profile?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&hairColor=2c1b18&skinColor=f8d25c"} alt="Avatar" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                 <div className="absolute inset-0 bg-[#3F7D58]/0 transition-colors group-hover:bg-[#3F7D58]/10" />
               </button>
            </div>
          </div>
        </header>}

        <div data-page-scroll className={cn("CustomScrollbar relative min-h-0 min-w-0 flex-1", activeTab === "tutor" || activeTab === "notes" ? "flex flex-col overflow-hidden p-2 sm:p-3 lg:p-4" : "overflow-y-auto p-5 md:p-8 lg:px-10 xl:px-14")}>
          <div className="app-content-surface pointer-events-none absolute inset-0 rounded-[2rem] border border-[#E5E7EB] bg-white/35" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className={cn("mx-auto relative z-10 w-full", activeTab === "tutor" || activeTab === "notes" ? "flex min-h-0 flex-1 flex-col" : "max-w-[1600px]")}
            >
              <SyncRecovery />
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
        
        {/* Mobile Floating Nav Overlay */}
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-[105] bg-[#111827]/35 backdrop-blur-sm lg:hidden"
          />
        )}
        {isReadOnlyAudit && <p role="status" className="audit-mode-notice relative z-10 shrink-0 px-4 py-1 text-xs">{isLocalAi ? t("audit.localAi") : t("audit.readOnly")}</p>}
        {activeTab === "community" && presenceError && <p role="status" className="relative z-10 shrink-0 bg-amber-50 px-4 py-1 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">{presenceError}</p>}
        {activeTab !== "tutor" && <FloatingTutor activeTab={activeTab} />}
      </main>

      <nav aria-label="Primary navigation" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-[120] grid grid-cols-5 border-t px-2 pt-2 lg:hidden">
        {primaryMenuItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabChange(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
                active ? "bg-[#F0FDF4] text-[#2F6145]" : "text-[#6B7280]",
              )}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="max-w-full truncate">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
