import React from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { ProgressRing } from "@/src/components/Dashboard/ProgressRing";
import { TaskStarterModal } from "@/src/components/TaskStarterModal";
import { motion, AnimatePresence } from "motion/react";
import { 
  Flame, 
  Target, 
  CheckCircle2, 
  Clock, 
  Brain,
  ArrowUpRight,
  BookOpen,
  Sparkles,
  Search,
  Command,
  Zap,
  X
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { collection, doc, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { writeDocWithQueue, type SyncStatus } from "@/src/lib/offlineSync";
import { trackUserEvent } from "@/src/lib/analytics";
import { useUserActivityMetrics } from "@/src/lib/useUserActivityMetrics";
import {
  getLocalDayKey,
  NOVIQ_XP,
  persistStudySession,
  XP_KEYS,
  type XpAward,
} from "@/src/lib/progress";
import { isPro } from "@/src/lib/subscription";

type JournalEntry = { id: string; title: string; content: string; createdAt: string; syncStatus?: SyncStatus };
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

const makeClientId = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

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

type TrendDirection = "up" | "down" | "neutral";

const getTrendDirection = (trend?: string): TrendDirection => {
  const normalized = trend?.trim() || "";
  if (normalized.startsWith("-")) return "down";
  if (normalized.startsWith("+")) return "up";
  return "neutral";
};

const MiniSparkline = ({ direction, seed = 0 }: { direction: TrendDirection; seed?: number }) => {
  const tone =
    direction === "down"
      ? {
          stroke: "#fb7185",
          fill: "rgba(251, 113, 133, 0.13)",
          glow: "rgba(251, 113, 133, 0.3)",
          rail: "rgba(251, 113, 133, 0.14)",
        }
      : direction === "up"
        ? {
            stroke: "#34d399",
            fill: "rgba(52, 211, 153, 0.13)",
            glow: "rgba(52, 211, 153, 0.3)",
            rail: "rgba(52, 211, 153, 0.14)",
          }
        : {
            stroke: "#22d3ee",
            fill: "rgba(34, 211, 238, 0.11)",
            glow: "rgba(34, 211, 238, 0.25)",
            rail: "rgba(34, 211, 238, 0.13)",
          };

  const values = Array.from({ length: 9 }, (_, index) => {
    const drift = direction === "down" ? 72 - index * 5.8 : direction === "up" ? 30 + index * 6 : 50;
    const wave = ((seed + index * 11) % 13) - 6;
    return Math.max(16, Math.min(86, drift + wave));
  });
  const points = values.map((value, index) => `${4 + index * 12},${92 - value}`).join(" ");
  const area = `M${points.replaceAll(" ", " L")} L100,92 L4,92 Z`;

  return (
    <div className="relative h-10 w-20 opacity-80 transition duration-300 group-hover:opacity-100">
      <div className="absolute inset-0 rounded-2xl blur-xl" style={{ backgroundColor: tone.glow }} />
      <svg viewBox="0 0 104 96" className="relative h-full w-full overflow-visible">
        <path d="M4 78 H100" stroke={tone.rail} strokeWidth="1.5" strokeDasharray="4 5" />
        <path d="M4 52 H100" stroke={tone.rail} strokeWidth="1.5" strokeDasharray="4 5" />
        <path d={area} fill={tone.fill} />
        <polyline
          points={points}
          fill="none"
          stroke={tone.stroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={4 + (values.length - 1) * 12} cy={92 - values[values.length - 1]} r="4.5" fill={tone.stroke} />
      </svg>
    </div>
  );
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  trend?: string;
  color: string;
  accentColor: string;
}

const StatCard = ({ icon: Icon, label, value, trend, color, accentColor }: StatCardProps) => {
  const trendDirection = getTrendDirection(trend);
  const trendClass =
    trendDirection === "down"
      ? "border-rose-400/25 bg-rose-400/10 text-rose-300"
      : trendDirection === "up"
        ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
        : "border-cyan-400/25 bg-cyan-400/10 text-cyan-300";

  return (
    <div className="dashboard-card group rounded-[1.75rem] p-6">
      <div className={cn("absolute -right-5 -top-5 h-24 w-24 rounded-full blur-[46px] opacity-[0.12]", accentColor)} />
      <div className="relative z-10 mb-4 flex items-start justify-between gap-4">
        <div className={cn("rounded-2xl p-3 text-white shadow-lg shadow-slate-950/20 ring-1 ring-white/10", color)}>
          <Icon size={20} className="opacity-90" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {trend && (
            <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-black", trendClass)}>
              {trend}
            </span>
          )}
          <MiniSparkline direction={trendDirection} seed={label.length * 3} />
        </div>
      </div>
      <p className="relative z-10 mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="relative z-10 font-display text-3xl font-black tracking-tight text-white">{value}</p>
    </div>
  );
};

export const Dashboard = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const { profile, user } = useAuth();
  const [selectedTask, setSelectedTask] = React.useState<string | null>(null);
  const [dashboardNow, setDashboardNow] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState<WeekdayLabel>(() => getWeekdayLabel(new Date()));
  const [journalOpen, setJournalOpen] = React.useState(false);
  const [journalTitle, setJournalTitle] = React.useState("Study Journal Entry");
  const [journalInput, setJournalInput] = React.useState("");
  const [commandQuery, setCommandQuery] = React.useState("");
  const [selectedPrompt, setSelectedPrompt] = React.useState<string | null>(null);
  const [recentJournals, setRecentJournals] = React.useState<JournalEntry[]>([]);
  const [studySessions, setStudySessions] = React.useState<DashboardStudySession[]>([]);
  const [notebookNotes, setNotebookNotes] = React.useState<NotebookNotePreview[]>([]);
  const [roadmapTasks, setRoadmapTasks] = React.useState<DashboardMissionTask[]>([]);
  const [plannerTasks, setPlannerTasks] = React.useState<DashboardMissionTask[]>([]);
  const [journalStatus, setJournalStatus] = React.useState<string>("");
  const [missionCelebrationOpen, setMissionCelebrationOpen] = React.useState(false);
  useBodyScrollLock(missionCelebrationOpen || journalOpen);

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
  const selectedDayStamp = selectedDayDate.toDateString();
  const selectedDayIsFuture = selectedDayDate.getTime() > dashboardToday.getTime();
  const activityMetrics = useUserActivityMetrics(user?.uid, { scopeDate: selectedDayDate });

  React.useEffect(() => {
    if (!user) {
      setRecentJournals([]);
      setStudySessions([]);
      setNotebookNotes([]);
      return undefined;
    }

    const journalsQuery = query(
      collection(db, "users", user.uid, "journals"),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const unsubscribeJournals = onSnapshot(
      journalsQuery,
      (snapshot) => {
        const remoteJournals = snapshot.docs.map((doc) => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            title: data.title,
            content: data.content,
            createdAt: serializeDate(data.createdAt),
            syncStatus: data.syncStatus || "synced",
          };
        });

        setRecentJournals(remoteJournals);
      },
      (error) => {
        console.warn("Cloud journal listener failed", error);
        setRecentJournals([]);
      }
    );

    const sessionsQuery = query(
      collection(db, "users", user.uid, "studySessions"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const unsubscribeSessions = onSnapshot(
      sessionsQuery,
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

        setStudySessions(remoteSessions);
      },
      (error) => {
        console.warn("Cloud study session listener failed", error);
        setStudySessions([]);
      }
    );

    const notesQuery = query(collection(db, "users", user.uid, "notebookNotes"), orderBy("updatedAt", "desc"), limit(100));
    const unsubscribeNotes = onSnapshot(
      notesQuery,
      (snapshot) => {
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
        setNotebookNotes([]);
      }
    );

    return () => {
      unsubscribeJournals();
      unsubscribeSessions();
      unsubscribeNotes();
    };
  }, [user]);

  const handlePromptCard = (title: string, suggestion: string) => {
    setSelectedPrompt(title);
    setJournalTitle(title);
    setJournalInput(suggestion);
    setJournalOpen(true);
  };

  const handleSaveJournal = async () => {
    if (!user || !journalInput.trim()) {
      setJournalStatus("Please add a study note before saving.");
      return;
    }

    const entry: JournalEntry = {
      id: makeClientId("journal"),
      title: journalTitle,
      content: journalInput.trim(),
      createdAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    setJournalInput("");
    setJournalOpen(false);
    setJournalStatus("Saving study note...");

    try {
      await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "journals", entry.id],
        data: {
          title: journalTitle,
          content: entry.content,
          createdAt: entry.createdAt,
        },
        merge: true,
      });
      setJournalStatus("Study note saved.");
    } catch (error) {
      console.warn("Cloud journal sync failed", error);
      setJournalStatus("Study note could not be saved. Please try again.");
    }
  };

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
      return undefined;
    }

    const tasksQuery = query(
      collection(db, "users", user.uid, "roadmapTasks"),
      orderBy("order")
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
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
      },
      (error) => {
        console.warn("Cloud roadmap task listener failed", error);
        setRoadmapTasks([]);
      }
    );

    const unsubscribePlanner = onSnapshot(
      doc(db, "users", user.uid, "planner", "state"),
      (snapshot) => {
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
      },
      (error) => {
        console.warn("Planner state listener failed", error);
        setPlannerTasks([]);
      }
    );

    return () => {
      unsubscribe();
      unsubscribePlanner();
    };
  }, [user]);

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

  const firstName = profile?.displayName?.split(" ")[0] || "Student";
  const dashboardTasks = React.useMemo(
    () => [...roadmapTasks, ...plannerTasks].sort((a, b) => a.order - b.order),
    [plannerTasks, roadmapTasks]
  );
  const progressXp = activityMetrics.xp;
  const completedTaskCount = activityMetrics.tasksDone;
  const taskTotalCount = selectedDayIsFuture ? 0 : completedTaskCount;
  const pendingTaskCount: number = 0;
  const nextOpenTask = dashboardTasks.find((task) => !task.done);
  const dailyCompletion = taskTotalCount ? Math.round((completedTaskCount / taskTotalCount) * 100) : 0;
  const dailyTargetMinutes = profile?.dailyTargetMinutes || 30;
  const focusSessions = studySessions.filter((session) => session.category === "focus" || session.subject.toLowerCase().includes("focus"));
  const selectedDaySessions = selectedDayIsFuture
    ? []
    : focusSessions.filter((session) => new Date(session.timestamp).toDateString() === selectedDayStamp);
  const focusMinutes = activityMetrics.focusMinutes;
  const focusTimeLabel =
    focusMinutes >= 60
      ? `${Math.floor(focusMinutes / 60)}h ${focusMinutes % 60 ? `${focusMinutes % 60}m` : ""}`.trim()
      : `${focusMinutes}m`;
  const focusTargetProgress = Math.min(100, Math.round((focusMinutes / Math.max(dailyTargetMinutes, 1)) * 100));
  const notesCount = activityMetrics.notesCreated;
  const recentNotebookNotes = notebookNotes.slice(0, 5);
  const latestNotebookTitle = recentNotebookNotes[0]?.title || "No notebook notes yet";
  const notebookActivityCount = activityMetrics.notesCreated + activityMetrics.sourcesUploaded + activityMetrics.notebookMessages;
  const hasRealActivity =
    activityMetrics.focusMinutes > 0 ||
    activityMetrics.tasksDone > 0 ||
    notebookActivityCount > 0 ||
    activityMetrics.tutorMessages > 0 ||
    activityMetrics.decksCreated > 0 ||
    activityMetrics.flashcardsCreated > 0 ||
    activityMetrics.xp > 0;
  const reviewRate = taskTotalCount ? dailyCompletion : 0;
  const retentionBoost = hasRealActivity
    ? Math.min(100, Math.round((Math.min(notesCount, 10) / 10) * 35 + Math.min(completedTaskCount, 10) * 4 + focusTargetProgress * 0.25))
    : 0;
  const revisionVelocity = hasRealActivity
    ? Math.min(100, Math.round(focusTargetProgress * 0.45 + Math.min(completedTaskCount, 10) * 5 + Math.min(notesCount, 10) * 2))
    : 0;
  const predictiveMastery = hasRealActivity ? Math.min(100, Math.round((dailyCompletion + retentionBoost + revisionVelocity) / 3)) : 0;
  const examReadinessScore = activityMetrics.examReadiness;
  const activePro = isPro(profile);
  const successProbability = hasRealActivity ? Math.min(96, Math.round(examReadinessScore * 0.72 + dailyCompletion * 0.18 + focusTargetProgress * 0.1)) : 0;
  const improvedProbability = hasRealActivity ? Math.min(98, successProbability + Math.max(1, Math.round((100 - revisionVelocity) * 0.08))) : 0;
  const weakAreas = dashboardTasks
    .filter((task) => !task.done)
    .slice(0, 3)
    .map((task) => ({
      label: task.category,
      score: Math.max(1, 100 - dailyCompletion),
      task: task.title,
    }));
  const studyPulseScore = hasRealActivity
    ? Math.min(100, Math.round(focusTargetProgress * 0.35 + reviewRate * 0.25 + retentionBoost * 0.2 + revisionVelocity * 0.2))
    : 0;
  const retentionGap = Math.max(0, reviewRate - retentionBoost);
  const targetCardCount = notesCount > 0 ? Math.min(20, pendingTaskCount * 5 + notesCount * 3) : 0;
  const focusWindowLabel = selectedDaySessions[0]
    ? new Date(selectedDaySessions[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "No focus sessions yet";
  const taskStatusLabel = (status: DashboardMissionTask["status"]) =>
    status === "completed" ? "Completed" : status === "inProgress" ? "In progress" : "Not started";
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
  const recommendedSequence = nextOpenTask
    ? [{ step: "01", label: nextOpenTask.title, time: nextOpenTask.time || `${nextOpenTask.duration} min` }]
    : notesCount > 0
      ? [{ step: "01", label: "Generate cards from latest note", time: targetCardCount ? `${targetCardCount} cards` : "Ready" }]
      : [];

  const runCommand = (query = commandQuery) => {
    const normalized = query.toLowerCase();
    if (normalized.includes("flash") || normalized.includes("deck") || normalized.includes("card")) {
      setActiveTab("flashcards");
    } else if (normalized.includes("note") || normalized.includes("summar")) {
      setActiveTab("notes");
    } else if (normalized.includes("tutor") || normalized.includes("ask") || normalized.includes("ai")) {
      setActiveTab("tutor");
    } else if (normalized.includes("plan")) {
      setActiveTab("planner");
    } else {
      setActiveTab("tutor");
    }
    setCommandQuery("");
  };

  return (
    <div className="dashboard-shell space-y-7 pb-16">
      {/* TaskStarterModal */}
      {selectedTask && roadmapTasks.find((t) => t.id === selectedTask) && (
        <TaskStarterModal
          task={roadmapTasks.find((t) => t.id === selectedTask)!}
          onClose={() => setSelectedTask(null)}
          onComplete={async (sessionTime) => {
            await handleTaskCompletion(selectedTask!, sessionTime);
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
            transition={{ duration: 0.2 }}
            className="noviq-modal-backdrop z-[210]"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {Array.from({ length: 28 }, (_, index) => (
                <span
                  key={index}
                  className="confetti-piece"
                  style={{
                    left: `${(index * 37) % 100}%`,
                    animationDelay: `${(index % 7) * 0.12}s`,
                    backgroundColor: ["#3F7D58", "#6EE7A8", "#F59E0B", "#60A5FA"][index % 4],
                  }}
                />
              ))}
            </div>
            <div className="noviq-modal-positioner noviq-modal-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="noviq-modal-panel CustomScrollbar relative rounded-[2rem] border border-[#E5E7EB] bg-white p-7 text-center text-[#111827] shadow-[0_30px_90px_rgba(17,24,39,0.18)]"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0FDF4] text-3xl">
                🎉
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-tight">Daily Mission Completed</h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAF8] p-4">
                  <p className="text-2xl font-black text-[#3F7D58]">+500</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">XP</p>
                </div>
                <div className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAF8] p-4">
                  <p className="text-2xl font-black text-[#3F7D58]">+1</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">Day Streak</p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-[#6B7280]">
                Momentum saved. Keep tomorrow's mission small, focused, and consistent.
              </p>
              <button
                type="button"
                onClick={() => setMissionCelebrationOpen(false)}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#3F7D58] px-5 text-sm font-black text-white transition hover:bg-[#2F6145]"
              >
                Continue
              </button>
            </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {journalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="noviq-modal-backdrop z-50"
          >
            <div className="noviq-modal-positioner noviq-modal-lg">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="noviq-modal-panel CustomScrollbar dashboard-panel relative rounded-[2.5rem] p-6 shadow-2xl sm:p-8"
            >
              <button
                onClick={() => setJournalOpen(false)}
                aria-label="Close study log"
                className="absolute top-6 right-6 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition"
              >
                <X size={20} className="text-slate-300" />
              </button>
              <div className="space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-cyan-300 font-black">Study Log</p>
                  <h2 className="mt-3 text-3xl font-black text-white">{selectedPrompt || journalTitle}</h2>
                  <p className="mt-2 text-sm text-slate-400">Save the summary of your study session and keep progress aligned to your subjects.</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-[0.26em] text-slate-500 mb-2">Title</label>
                    <input
                      value={journalTitle}
                      onChange={(e) => setJournalTitle(e.target.value)}
                      className="premium-input rounded-3xl px-5 py-4"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-[0.26em] text-slate-500 mb-2">Notes</label>
                    <textarea
                      value={journalInput}
                      onChange={(e) => setJournalInput(e.target.value)}
                      rows={8}
                      className="premium-input resize-none rounded-3xl px-5 py-4"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => setJournalOpen(false)}
                    className="btn-secondary w-full rounded-3xl px-6 py-4 sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveJournal}
                    className="btn-primary w-full rounded-3xl px-6 py-4 sm:w-auto"
                  >
                    Save Study Note
                  </button>
                </div>
                {journalStatus && <p className="text-sm text-emerald-300">{journalStatus}</p>}
              </div>
            </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="mb-10 space-y-6">
        <div className="dashboard-panel rounded-[2.75rem] p-6 md:p-8">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="dashboard-kicker">Hi, {firstName}</p>
            <h1 className="max-w-4xl font-display text-4xl font-black tracking-tight text-white md:text-6xl">
              AI exam command center
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              Plan, review, ask AI, and keep your study momentum in one focused operating workspace.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                runCommand();
              }}
              className="dashboard-command mt-5 flex max-w-3xl flex-col gap-3 rounded-[1.65rem] p-2 transition sm:flex-row sm:items-center"
            >
              <div className="flex min-h-14 flex-1 items-center gap-3 px-3">
                <Search size={20} className="text-cyan-200" />
                <input
                  value={commandQuery}
                  onChange={(event) => setCommandQuery(event.target.value)}
                  placeholder="Which exam target are you working on today?"
                  className="w-full bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-600"
                />
              </div>
              <button
                type="submit"
                className="btn-primary min-h-12 rounded-[1.25rem] px-5"
              >
                <Command size={16} />
                Run
              </button>
            </form>
            <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
              {[
                { label: "Daily progress", value: `${dailyCompletion}%`, icon: Target },
                { label: "Reviews pending", value: `${pendingTaskCount}`, icon: Brain },
                { label: "Focus points", value: `${progressXp}`, icon: Zap },
              ].map((item) => (
                <div key={item.label} className="dashboard-card rounded-2xl p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{item.label}</span>
                    <item.icon size={15} className="text-cyan-300" />
                  </div>
                  <p className="text-2xl font-black text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
              <div className="flex flex-wrap items-center gap-2">
            {WEEKDAY_LABELS.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  'px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition',
                  selectedDay === day
                    ? 'bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-300/20'
                    : 'border border-white/10 bg-white/[0.05] text-slate-400 hover:border-cyan-300/30 hover:bg-white/[0.09] hover:text-white'
                )}
              >
                {day}
              </button>
            ))}
          </div>
          </div>
        </div>

        {(activityMetrics.loading || activityMetrics.error) && (
          <div
            className={cn(
              "rounded-[1.5rem] border px-5 py-4 text-sm font-bold",
              activityMetrics.error
                ? "border-red-400/25 bg-red-500/10 text-red-200"
                : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
            )}
          >
            {activityMetrics.error
              ? `Live stats sync issue: ${activityMetrics.error}`
              : "Loading live stats from your study sessions, notebooks, and progress history..."}
          </div>
        )}

        <div className="dashboard-panel rounded-[2rem] p-6 md:p-7">
          <div className="relative z-10 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-300">Pro Intelligence</p>
                <span className={cn(
                  "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
                  activePro ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-300" : "border-white/10 bg-white/[0.05] text-slate-400"
                )}>
                  {activePro ? "Active" : "Real data only"}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Weakness Intelligence and Success Probability</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Noviq Pro uses mistakes, reviews, writing, and speaking practice to decide what you should study next.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="dashboard-card rounded-[1.5rem] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Target Score</p>
                <p className="mt-3 text-3xl font-black text-white">{profile?.goals?.[0] || profile?.onboardingAnswers?.mainGoal || "Not set"}</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">Taken from your profile and onboarding data.</p>
              </div>
              <div className="dashboard-card rounded-[1.5rem] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Success Probability</p>
                <p className="mt-3 text-3xl font-black text-white">{successProbability}%</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {hasRealActivity
                    ? `Completing open mission tasks could raise this to ${improvedProbability}%.`
                    : "Not enough activity yet. Complete your first session."}
                </p>
              </div>
            </div>

            <div className="xl:col-span-2 grid gap-3 md:grid-cols-3">
              {weakAreas.length > 0 ? (
                weakAreas.map((area, index) => (
                  <div key={`${area.label}-${index}`} className="dashboard-card rounded-[1.5rem] p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Weak Area {index + 1}</p>
                    </div>
                    <p className="mt-3 text-xl font-black text-white">{area.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{area.task}</p>
                  </div>
                ))
              ) : (
                <div className="dashboard-card rounded-[1.5rem] p-5 md:col-span-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Weak Areas</p>
                  <p className="mt-3 text-xl font-black text-white">Not enough activity yet</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Complete real mission tasks or study sessions to surface weak topics.</p>
                </div>
              )}
            </div>

            {!activePro && (
              <div className="xl:col-span-2 flex flex-col gap-3 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold leading-6 text-slate-200">
                  Core exam prep remains free. Pro unlocks deeper AI diagnostics when you are ready.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("pricing")}
                  className="btn-primary shrink-0 rounded-2xl px-5 py-3"
                >
                  View Pro
                  <ArrowUpRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1.3fr] gap-6">
          <div className="dashboard-panel relative rounded-[2.5rem] p-8 shadow-2xl shadow-blue-950/20 [--glow-x:18%] [--glow-y:0%]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_90%_20%,rgba(34,211,238,0.12),transparent_28%)]" />
            <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:56px_56px]" />
            <div className="relative z-10 space-y-8">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-cyan-300 font-black">
                <span className="block h-6 w-1 rounded-full bg-cyan-300" />
                Smart workspace
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl md:text-4xl font-black text-white">Capture progress without breaking flow</h2>
                <p className="max-w-xl text-sm text-slate-300">Save lesson notes, AI summaries, and key wins into the same activity stream.</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => setActiveTab('planner')}
                  className="btn-primary rounded-3xl px-6 py-4"
                >
                  Create Next Plan
                </button>
                <button
                  onClick={() => setActiveTab('notes')}
                  className="btn-secondary rounded-3xl px-6 py-4"
                >
                  Review Notes
                </button>
              </div>
              <div className="dashboard-card space-y-4 rounded-[2rem] p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Recent study notes</p>
                    <h3 className="text-lg font-bold text-white">Journal Highlights</h3>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Synced</span>
                </div>
                {recentNotebookNotes.length > 0 ? (
                  <div className="space-y-3">
                    {recentNotebookNotes.map((entry) => (
                      <div key={entry.id} className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 transition hover:border-cyan-300/20 hover:bg-white/[0.08]">
                        <p className="text-sm font-bold text-white">{entry.title}</p>
                        <p className="mt-2 text-xs text-slate-400 line-clamp-2">{entry.content}</p>
                        <p className="mt-3 text-[10px] uppercase tracking-[0.24em] text-slate-500">{entry.updatedAt || entry.createdAt ? new Date(entry.updatedAt || entry.createdAt || "").toLocaleDateString() : "No date"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No notes yet. Create your first notebook.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {[
              { title: 'Review Notes', description: 'Summarize the key concepts from your latest lessons.', tag: 'Review', color: 'from-blue-500 to-cyan-400', icon: BookOpen, action: () => setActiveTab('notes') },
              { title: 'Plan Next Session', description: 'Set your next study target with clear goals.', tag: 'Planner', color: 'from-violet-500 to-blue-500', icon: Target, action: () => setActiveTab('planner') },
              { title: 'Practice Recall', description: 'Quiz yourself on what you practiced without notes.', tag: 'Revision', color: 'from-emerald-400 to-cyan-400', icon: Brain, action: () => { setSelectedPrompt('Practice Recall'); setJournalTitle('Practice Recall'); setJournalInput('Write the main idea behind one exam topic from memory.'); setJournalOpen(true); } },
            ].map((item) => (
              <button
                key={item.title}
                onClick={item.action}
                className="dashboard-card group rounded-[2rem] p-6 text-left"
              >
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.24em] text-slate-500">{item.tag}</p>
                    <h3 className="mt-3 text-lg font-bold text-white">{item.title}</h3>
                  </div>
                  <div className={cn('h-11 w-11 rounded-3xl bg-gradient-to-br', item.color, 'shadow-lg shadow-slate-950/20 flex items-center justify-center')}>
                    <item.icon size={18} className="text-white" />
                  </div>
                </div>
                <p className="text-sm leading-6 text-slate-400">{item.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Stats - Clean Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        <StatCard icon={Clock} label="Focus Time" value={focusTimeLabel} trend={`${focusTargetProgress >= 50 ? "+" : ""}${focusTargetProgress}%`} color="bg-blue-500" accentColor="bg-blue-400" />
        <StatCard icon={CheckCircle2} label="Tasks Done" value={`${activityMetrics.tasksDone}`} trend={`${dailyCompletion >= 50 ? "+" : ""}${dailyCompletion}%`} color="bg-purple-500" accentColor="bg-purple-400" />
        <StatCard icon={Brain} label="Notes Created" value={`${activityMetrics.notesCreated}`} trend={activityMetrics.notesCreated > 0 ? `+${activityMetrics.notesCreated * 10}%` : "0%"} color="bg-pink-500" accentColor="bg-pink-400" />
        <StatCard icon={Sparkles} label="Tutor Questions" value={`${activityMetrics.tutorMessages}`} trend={activityMetrics.tutorMessages > 0 ? `+${activityMetrics.tutorMessages * 5}%` : "0%"} color="bg-emerald-500" accentColor="bg-emerald-400" />
        <StatCard icon={Target} label="Exam Readiness" value={`${examReadinessScore}%`} trend={`${examReadinessScore >= 50 ? "+" : "-"}${Math.abs(examReadinessScore - 50)}%`} color="bg-cyan-500" accentColor="bg-cyan-400" />
      </div>

      {/* Daily Study Momentum */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="dashboard-panel rounded-[2.5rem] p-8">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300 font-black">Daily Progress</p>
              <h3 className="mt-3 text-3xl font-black text-white">Study Momentum</h3>
            </div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Premium</span>
          </div>
          <div className="space-y-6">
            {[
              { title: 'Active Study Time', value: focusTimeLabel, detail: `${selectedDaySessions.length} study session${selectedDaySessions.length === 1 ? "" : "s"} logged on ${selectedDay}` },
              { title: 'Review Rate', value: `${reviewRate}%`, detail: taskTotalCount ? `${completedTaskCount} of ${taskTotalCount} real mission tasks completed` : "No mission created yet" },
              { title: 'Retention Boost', value: `${retentionBoost}%`, detail: 'Estimated from notes, reviews, and focus time' },
            ].map((item) => (
              <div key={item.title} className="dashboard-card rounded-3xl p-5">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <p className="text-sm font-semibold text-slate-300">{item.title}</p>
                  <p className="text-lg font-black text-white">{item.value}</p>
                </div>
                <p className="text-[11px] text-slate-500">{item.detail}</p>
              </div>
            ))}

            <div className="rounded-[1.75rem] border border-cyan-300/15 bg-cyan-300/10 p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Highest leverage</p>
                  <h4 className="mt-2 text-lg font-black text-white">Retention is lagging review rate</h4>
                </div>
                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                  Gap {retentionGap}%
                </span>
              </div>
              <p className="text-sm leading-6 text-slate-400">
                Review coverage is solid, but memory retention is lower. Convert the last study note into recall cards before adding new content.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                <button
                  onClick={() => setActiveTab("flashcards")}
                  className="btn-primary min-h-11 rounded-2xl px-4 py-3 text-xs"
                >
                  Build recall cards
                </button>
                <button
                  onClick={() => setActiveTab("notes")}
                  className="btn-secondary min-h-11 rounded-2xl px-4 py-3 text-xs"
                >
                  Open notes
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              {[
                { label: "Next task", value: nextOpenTask?.title || "No mission yet", action: nextOpenTask ? "Continue the next real mission task." : "Create your study plan to unlock task guidance." },
                { label: "Best source", value: latestNotebookTitle, action: notesCount > 0 ? "Use it as flashcard input." : "Create your first notebook before generating cards." },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-sm font-black text-white">{item.value}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.action}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 grid gap-6">
          <div className="dashboard-panel rounded-[2.5rem] p-8 [--glow-x:88%] [--glow-y:8%]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-black">Weekly sprint</p>
                <h3 className="mt-3 text-3xl font-black text-white">Your exam prep streak</h3>
              </div>
              <div className="rounded-3xl bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-blue-300 font-black">
                {activityMetrics.streak} day{activityMetrics.streak === 1 ? "" : "s"}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Card Review', progress: reviewRate },
                { label: 'Concept Practice', progress: dailyCompletion },
                { label: 'Quiz Readiness', progress: examReadinessScore },
                { label: 'Session Consistency', progress: focusTargetProgress },
              ].map((item) => (
                <div key={item.label} className="dashboard-card rounded-3xl p-5">
                  <p className="text-sm font-bold text-white mb-3">{item.label}</p>
                  <div className="mb-3 h-3 overflow-hidden rounded-full border border-white/10 bg-white/10">
                    <div className="dashboard-progress h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${item.progress}%` }} />
                  </div>
                  <p className="text-[11px] text-slate-400">{item.progress}% of today’s premium target</p>
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-panel rounded-[2.5rem] p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-black">Focus roadmap</p>
                <h3 className="mt-3 text-3xl font-black text-white">Daily mastery loop</h3>
              </div>
              <div className="rounded-full bg-blue-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-blue-300 font-black">Today</div>
            </div>
            <div className="space-y-4">
              {dashboardTasks.length > 0 ? (
                dashboardTasks.slice(0, 3).map((item) => (
                  <div key={`${item.source}-${item.id}`} className="dashboard-card flex items-center justify-between gap-4 rounded-3xl p-5">
                    <div>
                      <p className="text-sm font-bold text-white">{item.title}</p>
                      <p className="text-[11px] text-slate-500">{item.time || `${item.duration} min`} / {item.source}</p>
                    </div>
                    <span className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]",
                      item.status === "completed" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" :
                      item.status === "inProgress" ? "bg-amber-500/15 text-amber-300 border border-amber-500/20" :
                      "bg-slate-700/80 text-slate-300 border border-white/10"
                    )}>
                      {taskStatusLabel(item.status)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="dashboard-card rounded-3xl p-5">
                  <p className="text-sm font-bold text-white">No mission created yet.</p>
                  <p className="mt-2 text-sm text-slate-400">Create your first study mission.</p>
                  <button onClick={() => setActiveTab("planner")} className="btn-secondary mt-4 min-h-10 rounded-xl px-4 py-2 text-xs">
                    Create mission
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left: Sprint & Tasks */}
        <div className="xl:col-span-7 space-y-8">
          {/* Current Sprint Section */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="dashboard-panel rounded-[2.5rem] p-8 md:p-10"
          >
            {/* Top Label */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-cyan-400 rounded-full" />
              <h2 className="text-lg font-black text-white uppercase tracking-[0.25em]">Current Sprint</h2>
            </div>

            {/* Tasks List */}
            <div className="space-y-4">
              {dashboardTasks.length > 0 ? (
                dashboardTasks.map((task, index) => (
                  <motion.div
                    key={`${task.source}-${task.id}`}
                    whileHover={{ x: 4 }}
                    className="dashboard-card group cursor-pointer rounded-[1.5rem] p-5"
                  >
                    <div className="flex items-start gap-5">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 transition-all",
                        task.done
                          ? "bg-slate-700/50 border border-slate-600/30 text-slate-500"
                          : "bg-blue-500/15 border border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/20"
                      )}>
                        {index + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-bold text-white transition-all mb-1",
                          task.done && "opacity-50 line-through"
                        )}>
                          {task.title}
                        </p>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                          {task.time} / {taskStatusLabel(task.status)}
                        </p>
                      </div>

                      <div className="flex-shrink-0">
                        {!task.done ? (
                          <button
                            onClick={() => task.source === "roadmap" ? setSelectedTask(task.id) : setActiveTab("planner")}
                            className="btn-primary min-h-10 whitespace-nowrap rounded-xl px-6 py-2.5 text-xs uppercase tracking-wider"
                          >
                            {task.source === "roadmap" ? "Start" : "Open"}
                          </button>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
                            <CheckCircle2 size={20} className="text-emerald-400" />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="dashboard-card rounded-[1.5rem] p-6">
                  <p className="font-bold text-white">No mission created yet. Create your first study mission.</p>
                  <button onClick={() => setActiveTab("planner")} className="btn-primary mt-5 min-h-11 rounded-xl px-5 py-3 text-xs uppercase tracking-wider">
                    Create mission
                  </button>
                </div>
              )}
            </div>
          </motion.section>

          {/* AI Synthesis Card */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="dashboard-panel group rounded-[2.5rem] p-8 md:p-10 [--glow-x:92%] [--glow-y:0%]"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-[80px] -mr-20 -mt-20 group-hover:scale-150 transition-transform duration-1000" />
            
            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="w-1 h-5 bg-blue-500 rounded-full" />
              <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.25em]">AI Insight</h3>
            </div>
            
            <p className="text-base font-medium leading-relaxed text-slate-200 mb-6 relative z-10">
              {hasRealActivity
                ? nextOpenTask
                  ? `Your next real mission task is "${nextOpenTask.title}".`
                  : "All visible mission tasks are completed."
                : "Not enough activity yet. Complete your first session."}
            </p>

            <div className="flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/30 flex items-center justify-center">
                <Brain size={16} className="text-blue-400" />
              </div>
              <span className="text-xs text-slate-400 font-black uppercase tracking-widest">Saidamin AI</span>
            </div>
          </motion.section>

          <div className="grid gap-6 lg:grid-cols-2">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="dashboard-panel rounded-[2.5rem] p-7 [--glow-x:15%] [--glow-y:0%]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.12),transparent_32%)]" />
              <div className="relative z-10">
                <div className="mb-7 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Focus map</p>
                    <h3 className="mt-2 text-2xl font-black text-white">Weekly rhythm</h3>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-cyan-200">
                    <Flame size={19} />
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {weeklyRhythm.map((item, index) => (
                    <div key={`${item.day}-${index}`} className="space-y-2 text-center">
                      <div className="flex h-24 items-end rounded-2xl border border-white/10 bg-white/[0.035] p-1.5 shadow-inner shadow-slate-950/40">
                        <div
                          className="w-full rounded-xl bg-gradient-to-t from-blue-600 to-cyan-300 shadow-lg shadow-cyan-500/10"
                          style={{ height: `${item.level}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.day}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-4">
                  <p className="text-sm font-bold text-white">Best focus window: {focusWindowLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Use this slot for review-heavy tasks and tutor follow-ups.</p>
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="dashboard-panel rounded-[2.5rem] p-7 [--glow-x:85%] [--glow-y:0%]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(59,130,246,0.14),transparent_34%)]" />
              <div className="relative z-10">
                <div className="mb-7 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">Forecast</p>
                    <h3 className="mt-2 text-2xl font-black text-white">Exam forecast</h3>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-blue-200">
                    <Target size={19} />
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { label: "Recall stability", value: retentionBoost, color: "from-cyan-400 to-blue-500" },
                    { label: "Review pressure", value: taskTotalCount ? Math.round((pendingTaskCount / Math.max(taskTotalCount, 1)) * 100) : 0, color: "from-violet-400 to-blue-500" },
                    { label: "Session confidence", value: focusTargetProgress, color: "from-emerald-300 to-cyan-400" },
                  ].map((item) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.18em]">
                        <span className="text-slate-500">{item.label}</span>
                        <span className="text-white">{item.value}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full border border-white/10 bg-white/[0.05]">
                        <div className={cn("dashboard-progress h-full rounded-full bg-gradient-to-r", item.color)} style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setActiveTab("planner")}
                  className="btn-secondary mt-7 w-full rounded-2xl px-5 py-4"
                >
                  Optimize plan
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </motion.section>
          </div>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="dashboard-panel flex min-h-[520px] flex-col justify-between rounded-[2.5rem] p-8 [--glow-x:18%] [--glow-y:0%]"
          >
            <div className="relative z-10">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Review focus</p>
                  <h3 className="mt-3 max-w-2xl text-3xl font-black tracking-tight text-white">Today’s highest-value study move</h3>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                    {nextOpenTask
                      ? `Continue "${nextOpenTask.title}" from your real mission.`
                      : notesCount > 0
                        ? "Your latest notebook note can be used for review cards."
                        : "Not enough activity yet. Complete your first session."}
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-200">
                  <Sparkles size={20} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { label: "Focus", value: "Recall first", detail: "Do not open a new topic until one review pass is done." },
                  { label: "Input", value: latestNotebookTitle, detail: notesCount > 0 ? "Use the freshest note as the flashcard source." : "No notebook source is available yet." },
                  { label: "Win condition", value: targetCardCount ? `${targetCardCount} cards` : "No cards yet", detail: notesCount > 0 ? "Enough to raise revision velocity without overloading." : "Generate flashcards from a real note first." },
                ].map((item) => (
                  <div key={item.label} className="dashboard-card rounded-[1.5rem] p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
                    <p className="mt-3 text-xl font-black text-white">{item.value}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-slate-950/50 p-5">
                <div className="mb-4 flex items-center justify-between text-xs font-black uppercase tracking-[0.2em]">
                  <span className="text-slate-500">Recommended sequence</span>
                  <span className="text-cyan-300">{recommendedSequence.length ? "Ready" : "Empty"}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {recommendedSequence.length > 0 ? (
                    recommendedSequence.map((item) => (
                      <div key={item.step} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">{item.step}</p>
                        <p className="mt-2 text-sm font-black text-white">{item.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.time}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:col-span-3">
                      <p className="text-sm font-black text-white">No sequence yet</p>
                      <p className="mt-1 text-xs text-slate-500">Create a mission or notebook note to generate a real next action.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-7 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setActiveTab("flashcards")}
                className="btn-primary rounded-2xl px-5 py-4"
              >
                Generate flashcards
                <ArrowUpRight size={16} />
              </button>
              <button
                onClick={() => setActiveTab("notes")}
                className="btn-secondary rounded-2xl px-5 py-4"
              >
                Open source notes
                <BookOpen size={16} />
              </button>
            </div>
          </motion.section>

        </div>

        {/* Right: AI Queue & Progress */}
        <div className="xl:col-span-5 space-y-8">
          {/* Study Pulse Summary */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="dashboard-panel rounded-[2.5rem] p-8 [--glow-x:80%] [--glow-y:0%]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.12),transparent_32%)]" />
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-cyan-300 font-black">
                <span className="block h-6 w-1 rounded-full bg-cyan-300" />
                Study Pulse
              </div>
              <div className="space-y-2">
                <p className="text-5xl font-black text-white">{studyPulseScore}</p>
                <p className="text-sm text-slate-400 max-w-lg">Track your focus, recall, and confidence from the latest study session.</p>
              </div>

              <div className="grid gap-4">
                {[
                  { label: 'Focus', value: focusTargetProgress, color: 'bg-cyan-400' },
                  { label: 'Recall', value: reviewRate, color: 'bg-blue-500' },
                  { label: 'Preparedness', value: examReadinessScore, color: 'bg-emerald-400' },
                  { label: 'Confidence', value: retentionBoost, color: 'bg-violet-500' },
                ].map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-slate-500">
                      <span>{item.label}</span>
                      <span>{item.value}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
                      <div className={cn('dashboard-progress h-full rounded-full', item.color)} style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setSelectedPrompt(null);
                  setJournalTitle("New Study Journal");
                  setJournalInput("");
                  setJournalOpen(true);
                }}
                className="btn-primary mt-4 w-full rounded-3xl py-4"
              >
                Add Study Log
              </button>
            </div>
          </motion.section>

          {/* AI Study Queue */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="dashboard-panel rounded-[2.5rem] p-8 shadow-2xl [--glow-x:18%] [--glow-y:10%]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_90%_0%,rgba(34,211,238,0.12),transparent_28%)]" />

            <div className="relative z-10 mb-7 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">AI study queue</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-white">Next best actions</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Prioritized actions based on your progress, notes, and pending reviews.
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-200 shadow-lg shadow-cyan-500/10">
                <Sparkles size={22} />
              </div>
            </div>

            <div className="relative z-10 grid gap-3">
              {[
                {
                  title: "Ask Noviq Tutor",
                  detail: "Clarify the weakest topic before you review.",
                  icon: Brain,
                  action: () => setActiveTab("tutor"),
                },
                {
                  title: "Generate flashcards",
                  detail: "Turn today’s notes into quick recall cards.",
                  icon: BookOpen,
                  action: () => setActiveTab("flashcards"),
                },
                {
                  title: "Review pending tasks",
                  detail: `${pendingTaskCount} focused item${pendingTaskCount === 1 ? "" : "s"} waiting in your sprint.`,
                  icon: CheckCircle2,
                  action: () => setActiveTab("planner"),
                },
              ].map((item) => (
                <button
                  key={item.title}
                  onClick={item.action}
                  className="dashboard-card group flex items-center gap-4 rounded-[1.5rem] p-4 text-left"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/70 text-cyan-200">
                    <item.icon size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-white">{item.title}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-500">{item.detail}</p>
                  </div>
                  <ArrowUpRight size={17} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-cyan-200" />
                </button>
              ))}
            </div>

            <button
              onClick={() => setActiveTab("tutor")}
              className="btn-primary relative z-10 mt-6 min-h-13 w-full rounded-[1.35rem] px-5 py-4"
            >
              <Sparkles size={17} />
              Open Noviq Tutor
            </button>

            {/* Status Indicator */}
            <p className={cn(
              "relative z-10 mt-4 text-xs font-black uppercase tracking-[0.25em] transition-all duration-500",
              "text-cyan-300"
            )}>
              {hasRealActivity ? "AI queue ready" : "Waiting for real activity"}
            </p>
          </motion.section>

          {/* Exam Readiness Progress */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="dashboard-panel rounded-[2.5rem] p-10 [--glow-x:50%] [--glow-y:0%]"
          >
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-8">Exam Readiness</h2>

            {/* Progress Ring */}
            <div className="flex justify-center mb-10">
              <div className="relative">
                <ProgressRing progress={examReadinessScore} size={160} strokeWidth={10} color="#3b82f6" showValue={false} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-4xl font-black font-display text-white">{examReadinessScore}</p>
                  <p className="text-xs font-bold text-blue-400 mt-1">{examReadinessScore > 0 ? "REAL DATA" : "NO DATA"}</p>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="space-y-4">
              {[
                { label: "Predictive Mastery", score: predictiveMastery },
                { label: "Revision Velocity", score: revisionVelocity },
                { label: "Retention Rate", score: retentionBoost },
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                    <span className="text-slate-400">{item.label}</span>
                    <span className="text-white">{item.score}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full border border-white/5 bg-slate-800/50">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.score}%` }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="dashboard-progress h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-7 rounded-[1.75rem] border border-amber-300/20 bg-amber-300/10 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200">Weakest lever</p>
                  <h4 className="mt-2 text-lg font-black text-white">
                    {hasRealActivity ? "Lowest real metric needs attention" : "Not enough activity yet"}
                  </h4>
                </div>
                <span className="rounded-full border border-amber-300/20 bg-slate-950/45 px-3 py-1 text-xs font-black text-amber-200">
                  {revisionVelocity}%
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {hasRealActivity
                  ? (nextOpenTask ? `Continue "${nextOpenTask.title}" to improve this metric.` : "Create a new mission task to keep readiness moving.")
                  : "Complete your first focus session or mission task to calculate readiness."}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <button
                  onClick={() => setActiveTab("flashcards")}
                  className="btn-primary min-h-11 rounded-2xl px-4 py-3 text-xs"
                >
                  Start review sprint
                </button>
                <button
                  onClick={() => setActiveTab("planner")}
                  className="btn-secondary min-h-11 rounded-2xl px-4 py-3 text-xs"
                >
                  Schedule review
                </button>
              </div>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
};
