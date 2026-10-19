import {useMembership} from '@/src/features/pro/MembershipContext';
import React from "react";
import { isMeaningfulSession } from "@/src/lib/activityEvidence";
import { useAuth } from "@/src/contexts/AuthContext";
import { TaskStarterModal } from "@/src/components/TaskStarterModal";
import { TodayDashboardView } from "@/src/components/Dashboard/TodayDashboardView";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { collection, doc, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { writeDocWithQueue, type SyncStatus } from "@/src/lib/offlineSync";
import { trackUserEvent } from "@/src/lib/analytics";
import { useUserActivityMetrics } from "@/src/lib/useUserActivityMetrics";
import { useLocale } from "@/src/contexts/LocaleContext";
import {
  getLocalDayKey,
  NOVIQ_XP,
  persistStudySession,
  XP_KEYS,
  type XpAward,
} from "@/src/lib/progress";
type DashboardStudySession = {
  id: string;
  userId: string;
  duration: number;
  subject: string;
  category: string;
  xpEarned: number;
  timestamp: string;
  syncStatus?: SyncStatus;
};
type NotebookNotePreview = {
  id: string;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
};
type DashboardMissionTask = {
  id: string;
  title: string;
  category: string;
  time: string;
  duration: number;
  status: "notStarted" | "inProgress" | "completed";
  done: boolean;
  source: "roadmap" | "planner";
  order: number;
};

const serializeDate = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  return "";
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type WeekdayLabel = (typeof WEEKDAY_LABELS)[number];

const getWeekdayLabel = (date: Date): WeekdayLabel =>
  date.toLocaleDateString("en-US", { weekday: "short" }) as WeekdayLabel;

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getWeekStart = (date: Date) => {
  const start = startOfLocalDay(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
};

const getDateForWeekday = (day: WeekdayLabel, baseDate: Date) => {
  const weekStart = getWeekStart(baseDate);
  const date = new Date(weekStart);
  date.setDate(weekStart.getDate() + WEEKDAY_LABELS.indexOf(day));
  return date;
};

const FreeDashboard = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const { profile, user } = useAuth();
  const { t } = useLocale();
  const [selectedTask, setSelectedTask] = React.useState<string | null>(null);
  const [dashboardNow, setDashboardNow] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState<WeekdayLabel>(() => getWeekdayLabel(new Date()));
  const [commandQuery, setCommandQuery] = React.useState("");
  const [studySessions, setStudySessions] = React.useState<DashboardStudySession[]>([]);
  const [notebookNotes, setNotebookNotes] = React.useState<NotebookNotePreview[]>([]);
  const [roadmapTasks, setRoadmapTasks] = React.useState<DashboardMissionTask[]>([]);
  const [plannerTasks, setPlannerTasks] = React.useState<DashboardMissionTask[]>([]);
  const [tasksLoading, setTasksLoading] = React.useState(true);
  const [tasksError, setTasksError] = React.useState("");
  const [feedState, setFeedState] = React.useState<Record<string, string>>({ sessions: "loading", notes: "loading" });
  const [feedRevision, setFeedRevision] = React.useState(0);
  const [tasksRevision, setTasksRevision] = React.useState(0);
  const [missionCelebrationOpen, setMissionCelebrationOpen] = React.useState(false);
  useBodyScrollLock(missionCelebrationOpen);

  React.useEffect(() => {
    const interval = window.setInterval(() => setDashboardNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const todayLabel = getWeekdayLabel(dashboardNow);
  const dashboardDayStamp = dashboardNow.toDateString();
  const dashboardToday = React.useMemo(() => startOfLocalDay(dashboardNow), [dashboardDayStamp]);

  React.useEffect(() => {
    setSelectedDay(todayLabel);
  }, [todayLabel]);

  const selectedDayDate = React.useMemo(() => getDateForWeekday(selectedDay, dashboardToday), [dashboardToday, selectedDay]);
  const activityMetrics = useUserActivityMetrics(user?.uid, { scopeDate: selectedDayDate });
  const libraryMetrics = useUserActivityMetrics(user?.uid);

  React.useEffect(() => {
    if (!user) {
      setStudySessions([]);
      setNotebookNotes([]);
      return undefined;
    }

    setFeedState({ sessions: "loading", notes: "loading" });
    const feedPending = new Set(["sessions", "notes"]);
    const feedSettled = (source: string, state = "ready") => { feedPending.delete(source); setFeedState(current => ({ ...current, [source]: state })); };
    const feedTimer = window.setTimeout(() => { for (const source of feedPending) feedSettled(source, "error"); }, 15000);
    const sessionsQuery = query(
      collection(db, "users", user.uid, "studySessions"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const unsubscribeSessions = onSnapshot(
      sessionsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const remoteSessions = snapshot.docs.map((doc) => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            userId: data.userId || user.uid,
            duration: Number(data.duration) || 0,
            subject: data.subject || "Study",
            category: String(data.category || data.type || ""),
            xpEarned: Number(data.xpEarned) || 0,
            timestamp: serializeDate(data.timestamp) || serializeDate(data.createdAt),
            syncStatus: data.syncStatus || "synced",
          } as DashboardStudySession;
        });

        if (!snapshot.metadata.fromCache) feedSettled("sessions");
        setStudySessions(remoteSessions.filter(isMeaningfulSession));
      },
      (error) => {
        console.warn("Cloud study session listener failed", error);
        feedSettled("sessions", "error");
      }
    );

    const notesQuery = query(collection(db, "users", user.uid, "notebookNotes"), orderBy("updatedAt", "desc"), limit(100));
    const unsubscribeNotes = onSnapshot(
      notesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!snapshot.metadata.fromCache) feedSettled("notes");
        setNotebookNotes(snapshot.docs.map((noteDoc) => {
          const data = noteDoc.data() as any;
          return {
            id: noteDoc.id,
            title: data.title || "Untitled note",
            content: data.content || "",
            createdAt: serializeDate(data.createdAt),
            updatedAt: serializeDate(data.updatedAt),
          };
        }));
      },
      (error) => {
        console.warn("Notebook notes listener failed", error);
        feedSettled("notes", "error");
      }
    );

    return () => {
      window.clearTimeout(feedTimer);
      unsubscribeSessions();
      unsubscribeNotes();
    };
  }, [user, feedRevision]);

  const handleTaskCompletion = async (taskId: string, sessionTime: number) => {
    const existingTask = roadmapTasks.find((task) => task.id === taskId);
    if (existingTask?.done) return;
    await completeRoadmapTask(taskId);

    if (!user) return;
    const completedAt = new Date();
    const dayKey = getLocalDayKey(completedAt);
    const targetSeconds = (profile?.dailyTargetMinutes || 30) * 60;
    const previousTodaySeconds = studySessions
      .filter((session) => new Date(session.timestamp).toDateString() === completedAt.toDateString())
      .reduce((total, session) => total + session.duration, 0);
    const nextTodaySeconds = previousTodaySeconds + sessionTime;
    const nextTasks = roadmapTasks.map((task) => (task.id === taskId ? { ...task, done: true } : task));
    const awards: XpAward[] = [
      { key: XP_KEYS.planFollowedDay(dayKey), xp: NOVIQ_XP.productivity.planFollowedDay },
    ];

    if (previousTodaySeconds < targetSeconds && nextTodaySeconds >= targetSeconds) {
      awards.push({ key: XP_KEYS.dailyGoal(dayKey), xp: NOVIQ_XP.daily.dailyGoal });
    }

    if (nextTasks.length > 0 && nextTasks.every((task) => task.done)) {
      awards.push({ key: XP_KEYS.allDailyTasksComplete(dayKey), xp: NOVIQ_XP.productivity.allDailyTasksComplete });
      awards.push({ key: XP_KEYS.dailyMissionComplete(dayKey), xp: NOVIQ_XP.productivity.dailyMissionComplete });
      if (!profile?.xpAwarded?.[XP_KEYS.dailyMissionComplete(dayKey)]) {
        setMissionCelebrationOpen(true);
      }
    }

    const xpEarned = NOVIQ_XP.learning.lessonComplete;
    const sessionData = {
      userId: user.uid,
      duration: sessionTime,
      subject: existingTask?.category || "Study",
      category: "focus" as const,
      xpEarned,
      timestamp: completedAt.toISOString(),
    };

    try {
      await persistStudySession(sessionData, profile, awards);
      await trackUserEvent(user.uid, "mission_task_completed", xpEarned + awards.reduce((total, award) => total + award.xp, 0), {
        taskId,
        durationSeconds: sessionTime,
      });
    } catch (error) {
      console.warn("Cloud study session sync failed", error);
    }
  };

  React.useEffect(() => {
    if (!user) {
      setRoadmapTasks([]);
      setPlannerTasks([]);
      setTasksLoading(false);
      return undefined;
    }

    setTasksLoading(true);
    setTasksError("");
    const pending = new Set(["roadmap", "planner"]);
    const taskTimer = window.setTimeout(() => { if (pending.size) { setTasksLoading(false); setTasksError("Saved tasks temporarily unavailable. Retry to refresh."); } }, 15000);
    const taskFailures = new Set<string>();
    const receivedTasks = (part: string) => { pending.delete(part); taskFailures.delete(part); setTasksLoading(pending.size > 0); if (!pending.size && !taskFailures.size) setTasksError(""); };
    const failedTasks = (part: string) => { receivedTasks(part); taskFailures.add(part); setTasksError("Saved mission tasks could not be refreshed. Your records are unchanged."); };

    const tasksQuery = query(
      collection(db, "users", user.uid, "roadmapTasks"),
      orderBy("order")
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.fromCache) return;
        const tasks = snapshot.docs.map((doc) => {
          const data = doc.data() as any;
          const rawStatus = String(data.status || "").toLowerCase();
          const status: DashboardMissionTask["status"] =
            rawStatus === "completed" || data.done === true
              ? "completed"
              : rawStatus === "inprogress" || rawStatus === "in_progress"
                ? "inProgress"
                : "notStarted";
          return {
            id: doc.id,
            title: data.title || data.label || "Study task",
            category: data.category || data.section || "Study",
            time: data.time || `${Number(data.duration || data.minutes || 0)} min`,
            duration: Number(data.duration || data.minutes || 0),
            status,
            done: status === "completed",
            source: "roadmap" as const,
            order: Number(data.order) || 0,
          };
        });

        setRoadmapTasks(tasks);
        receivedTasks("roadmap");
      },
      (error) => {
        console.warn("Cloud roadmap task listener failed", error);
        failedTasks("roadmap");
      }
    );

    const unsubscribePlanner = onSnapshot(
      doc(db, "users", user.uid, "planner", "state"),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.fromCache) return;
        const state = snapshot.exists() ? (snapshot.data() as any).state : null;
        const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
        const progress = state?.taskProgress && typeof state.taskProgress === "object" ? state.taskProgress : {};
        setPlannerTasks(tasks.map((task: any, index: number) => {
          const taskProgress = progress[task.id] || {};
          const rawStatus = String(taskProgress.status || "").toLowerCase();
          const status: DashboardMissionTask["status"] =
            rawStatus === "completed"
              ? "completed"
              : rawStatus === "in_progress" || rawStatus === "inprogress"
                ? "inProgress"
                : "notStarted";
          return {
            id: task.id || `planner-${index}`,
            title: task.label || task.title || "Planner task",
            category: task.section || task.category || task.kind || "Planner",
            time: task.scheduledWindow || `${Number(task.minutes || task.duration || 0)} min`,
            duration: Number(task.minutes || task.duration || 0),
            status,
            done: status === "completed",
            source: "planner" as const,
            order: index,
          };
        }));
        receivedTasks("planner");
      },
      (error) => {
        console.warn("Planner state listener failed", error);
        failedTasks("planner");
      }
    );

    return () => {
      window.clearTimeout(taskTimer);
      unsubscribe();
      unsubscribePlanner();
    };
  }, [user, tasksRevision]);

  const completeRoadmapTask = async (id: string) => {
    const existingTask = roadmapTasks.find((task) => task.id === id);

    setRoadmapTasks((prev) => prev.map((task) => (task.id === id ? { ...task, done: true, status: "completed" } : task)));

    if (!user || !existingTask) return;

    try {
      await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "roadmapTasks", id],
        data: {
          ...existingTask,
          done: true,
          status: "completed",
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        merge: true,
      });
    } catch (error) {
      console.warn("Updating roadmap task status failed", error);
    }
  };

  const firstName = profile?.displayName?.split(" ")[0] || t("today.student");
  const dashboardTasks = React.useMemo(
    () => [...roadmapTasks, ...plannerTasks].sort((a, b) => a.order - b.order),
    [plannerTasks, roadmapTasks]
  );
  const statValue = (metrics: typeof activityMetrics, value: string) => metrics.error ? "—" : metrics.loading ? t("today.loading") : value;
  const completedTaskCount = dashboardTasks.filter((task) => task.done).length;
  const taskTotalCount = dashboardTasks.length;
  const nextOpenTask = dashboardTasks.find((task) => !task.done);
  const dailyCompletion = taskTotalCount ? Math.round((completedTaskCount / taskTotalCount) * 100) : 0;
  const taskCompletionLabel = tasksError ? "—" : tasksLoading ? t("today.loading") : taskTotalCount ? `${dailyCompletion}%` : t("today.noMission");
  const dailyTargetMinutes = profile?.dailyTargetMinutes || 30;
  const focusMinutes = activityMetrics.focusMinutes;
  const focusTimeLabel =
    focusMinutes >= 60
      ? `${Math.floor(focusMinutes / 60)}h ${focusMinutes % 60 ? `${focusMinutes % 60}m` : ""}`.trim()
      : `${focusMinutes}m`;
  const focusTargetProgress = Math.min(100, Math.round((focusMinutes / Math.max(dailyTargetMinutes, 1)) * 100));
  const notesCount = libraryMetrics.notesCreated;
  const recentNotebookNotes = notebookNotes.slice(0, 5);
  const latestNotebookTitle = feedState.notes === "error" ? t("today.notesUnavailable") : feedState.notes === "loading" ? t("today.loadingNotes") : recentNotebookNotes[0]?.title || t("today.noNotes");
  const weeklyRhythm = ["M", "T", "W", "T", "F", "S", "S"].map((day, index) => {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    const dayDate = new Date(now);
    dayDate.setDate(now.getDate() - mondayOffset + index);
    const minutes = studySessions
      .filter((session) => new Date(session.timestamp).toDateString() === dayDate.toDateString())
      .reduce((total, session) => total + Math.round(session.duration / 60), 0);
    return {
      day,
      level: minutes > 0 ? Math.min(100, Math.max(8, Math.round((minutes / Math.max(dailyTargetMinutes, 1)) * 100))) : 0,
    };
  });
  const runCommand = (query = commandQuery) => {
    const normalized = query.toLowerCase();
    if (["flash", "deck", "card", "kart", "карточ"].some((keyword) => normalized.includes(keyword))) {
      setActiveTab("flashcards");
    } else if (["note", "summar", "qayd", "konspekt", "замет", "конспект"].some((keyword) => normalized.includes(keyword))) {
      setActiveTab("notes");
    } else if (["tutor", "ask", "ai", "so‘ra", "sora", "тьютор", "спрос"].some((keyword) => normalized.includes(keyword))) {
      setActiveTab("tutor");
    } else if (["plan", "reja", "план"].some((keyword) => normalized.includes(keyword))) {
      setActiveTab("planner");
    } else {
      setActiveTab("tutor");
    }
    setCommandQuery("");
  };

  return (
      <>
        {selectedTask && roadmapTasks.find((task) => task.id === selectedTask) && (
          <TaskStarterModal
            task={roadmapTasks.find((task) => task.id === selectedTask)!}
            onClose={() => setSelectedTask(null)}
            onComplete={async (sessionTime) => {
              await handleTaskCompletion(selectedTask, sessionTime);
              setSelectedTask(null);
            }}
          />
        )}

        <AnimatePresence>
          {missionCelebrationOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="noviq-modal-backdrop z-[210]"
            >
              <div className="noviq-modal-positioner noviq-modal-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className="noviq-modal-panel rounded-[1.5rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6 text-center text-[var(--noviq-text)]"
                >
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F7F1] text-[#237A5C]">
                    <CheckCircle2 size={23} aria-hidden="true" />
                  </span>
                  <h2 className="mt-4 text-2xl font-bold tracking-tight">{t("today.completeTitle")}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--noviq-muted)]">
                    {t("today.completeBody")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setMissionCelebrationOpen(false)}
                    className="today-primary-button mt-5 min-h-11 w-full rounded-xl px-4 text-sm font-semibold"
                  >
                    {t("today.continue")}
                  </button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <TodayDashboardView
          firstName={firstName}
          tasks={dashboardTasks}
          tasksLoading={tasksLoading}
          tasksError={tasksError}
          completedTaskCount={completedTaskCount}
          taskCompletionLabel={taskCompletionLabel}
          nextTask={nextOpenTask}
          focusTimeLabel={statValue(activityMetrics, focusTimeLabel)}
          focusTargetProgress={activityMetrics.loading || activityMetrics.error ? 0 : focusTargetProgress}
          dailyTargetMinutes={dailyTargetMinutes}
          notesCount={notesCount}
          latestNotebookTitle={latestNotebookTitle}
          dueCardsLabel={statValue(libraryMetrics, t("today.cardsDue", { count: libraryMetrics.dueCards }))}
          weeklyRhythm={weeklyRhythm}
          sessionsReady={feedState.sessions === "ready"}
          commandQuery={commandQuery}
          statsUnavailable={Boolean(activityMetrics.error || libraryMetrics.error)}
          recentUnavailable={Object.values(feedState).includes("error")}
          onCommandChange={setCommandQuery}
          onRunCommand={() => runCommand()}
          onOpenTask={(task) => task.source === "roadmap" ? setSelectedTask(task.id) : setActiveTab("planner")}
          onNavigate={setActiveTab}
          onRetryStatistics={() => {
            activityMetrics.retry();
            libraryMetrics.retry();
          }}
          onRetryTasks={() => setTasksRevision((value) => value + 1)}
          onRetryRecent={() => setFeedRevision((value) => value + 1)}
        />
      </>
  );
};

const IntelligenceDashboard=React.lazy(()=>import('@/src/features/pro/ProHub').then(m=>({default:m.ProHub})));
export const Dashboard=(props:{setActiveTab:(tab:string)=>void})=>{const {access}=useMembership();return access.entitled?<React.Suspense fallback={<div role="status">NOVIQ PRO…</div>}><IntelligenceDashboard/></React.Suspense>:<FreeDashboard {...props}/>;};
