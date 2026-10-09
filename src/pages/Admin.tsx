import React, { useEffect, useMemo, useState } from "react";
import { collection, collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Brain,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  FileText,
  Filter,
  Layers,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db, functions } from "@/src/lib/firebase";
import { useAuth } from "@/src/contexts/AuthContext";
import { cn } from "@/src/lib/utils";
import { useUserActivityMetrics } from "@/src/lib/useUserActivityMetrics";
import { ClientErrorMonitor } from "@/src/components/ClientErrorMonitor";

type RangeKey = "today" | "7d" | "30d";
type PlanFilter = "all" | "free" | "pro";
type ActivityFilter = "all" | "online" | "active_today" | "inactive_7d";

type DataKey =
  | "users"
  | "trusted"
  | "studySessions"
  | "progressEvents"
  | "notebookNotes"
  | "notebookMessages"
  | "tutorMessages"
  | "decks"
  | "analyticsEvents"
  | "subscriptionRequests"
  | "subscriptionCheckouts";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Date | null;
  lastActive: Date | null;
  currentLevel: string;
  goals: string[];
  onboardingAnswers?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

type AdminRecord = {
  id: string;
  userId: string;
  kind: string;
  date: Date | null;
  path: string;
  data: Record<string, any>;
};

type TrustedProgress = {
  xp: number;
  level: number;
  levelName: string;
  streak: number;
  totalStudySeconds: number;
  lastActive: Date | null;
  lastStudySessionAt: Date | null;
  updatedAt: Date | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  goal: string;
  currentLevel: string;
  targetLevel: string;
  plan: "free" | "pro";
  planStatus: string;
  lastActive: Date | null;
  online: boolean;
  streak: number;
  totalStudySeconds: number;
  raw: AdminUser;
};

const DATA_KEYS: DataKey[] = [
  "users",
  "trusted",
  "studySessions",
  "progressEvents",
  "notebookNotes",
  "notebookMessages",
  "tutorMessages",
  "decks",
  "analyticsEvents",
  "subscriptionRequests",
  "subscriptionCheckouts",
];

const RANGE_OPTIONS: { id: RangeKey; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

const MAX_ADMIN_DOCS = 1500;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const makeLoadState = (value: boolean) =>
  DATA_KEYS.reduce(
    (state, key) => ({
      ...state,
      [key]: value,
    }),
    {} as Record<DataKey, boolean>
  );

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const candidate = value as { toDate?: () => Date; toMillis?: () => number; seconds?: number };
  if (typeof candidate.toDate === "function") {
    const parsed = candidate.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof candidate.toMillis === "function") {
    const parsed = new Date(candidate.toMillis());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof candidate.seconds === "number") {
    const parsed = new Date(candidate.seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const pickDate = (data: Record<string, any>, fields: string[]) => {
  for (const field of fields) {
    const date = toDate(data[field]);
    if (date) return date;
  }
  return null;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getRangeStart = (range: RangeKey) => {
  const today = startOfToday();
  if (range === "today") return today;
  return addDays(today, range === "7d" ? -6 : -29);
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const isWithinRange = (date: Date | null, rangeStart: Date) => Boolean(date && date.getTime() >= rangeStart.getTime());

const formatDateTime = (date: Date | null) =>
  date ? date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unknown";

const formatDateOnly = (date: Date | null) =>
  date ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Unknown";

const formatStudyTime = (seconds: number) => {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);

const getLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const percent = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : "N/A");

const getRecordUserId = (document: any, data: Record<string, any>) =>
  String(data.userId || document.ref.parent.parent?.id || "");

const mapCollectionGroupDocs = (snapshot: any, kind: string, dateFields: string[]) =>
  snapshot.docs
    .map((document: any) => {
      const data = document.data() as Record<string, any>;
      return {
        id: document.id,
        userId: getRecordUserId(document, data),
        kind,
        date: pickDate(data, dateFields),
        path: document.ref.path,
        data,
      } as AdminRecord;
    })
    .filter((record: AdminRecord) => record.userId);

const getPlan = (user: AdminUser): "free" | "pro" => {
  const subscription = user.subscription || {};
  const plan = String(subscription.plan || "free");
  const status = String(subscription.status || "active");
  return plan === "pro" && ["active", "trialing"].includes(status) ? "pro" : "free";
};

const getPlanStatus = (user: AdminUser) => String(user.subscription?.status || "active");

const getGoal = (user: AdminUser) =>
  user.goals[0] ||
  String(user.onboardingAnswers?.mainGoal || "") ||
  "Not set";

const getTargetLevel = (user: AdminUser) =>
  String(
    user.settings?.targetLevel ||
      user.settings?.targetScore ||
      user.raw.targetLevel ||
      user.raw.targetScore ||
      "Not set"
  );

const getActivityLabel = (record: AdminRecord) => {
  if (record.kind === "studySessions") {
    return `Study session: ${record.data.subject || "Study"}`;
  }
  if (record.kind === "progressEvents") {
    return `Progress event: ${record.data.type || record.id}`;
  }
  if (record.kind === "analyticsEvents") {
    return `Analytics: ${record.data.eventType || "event"}`;
  }
  if (record.kind === "tutorMessages") {
    return `Tutor message: ${record.data.role || "message"}`;
  }
  if (record.kind === "notebookMessages") {
    return `Notebook message: ${record.data.role || "message"}`;
  }
  if (record.kind === "notebookNotes") {
    return `Notebook note: ${record.data.title || "Untitled"}`;
  }
  if (record.kind === "decks") {
    return `Deck: ${record.data.title || "Untitled deck"}`;
  }
  return record.kind;
};

const extractWeakTopics = (user: AdminUser, progressEvents: AdminRecord[]) => {
  const topics = new Set<string>();
  const addValue = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => topics.add(item));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(addValue);
      return;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      addValue(record.weakTopics);
      addValue(record.weaknessTag);
      addValue(record.weakArea);
      addValue(record.weakAreas);
      addValue(record.weaknesses);
      addValue(record.tag);
      addValue(record.section);
    }
  };

  addValue(user.onboardingAnswers?.struggle);
  addValue(user.settings?.weakTopics);
  progressEvents.forEach((event) => addValue(event.data));
  return Array.from(topics).slice(0, 10);
};

const EmptyState = ({ message }: { message: string }) => (
  <div className="admin-soft-surface rounded-[1.35rem] border border-dashed p-6 text-sm text-[var(--admin-muted)]">
    {message}
  </div>
);

type MetricTone = "indigo" | "cyan" | "green" | "amber" | "rose";

const metricToneClasses: Record<MetricTone, { icon: string; surface: string }> = {
  indigo: { icon: "text-indigo-600", surface: "bg-indigo-50 dark:bg-indigo-400/10" },
  cyan: { icon: "text-cyan-600", surface: "bg-cyan-50 dark:bg-cyan-400/10" },
  green: { icon: "text-emerald-600", surface: "bg-emerald-50 dark:bg-emerald-400/10" },
  amber: { icon: "text-amber-600", surface: "bg-amber-50 dark:bg-amber-400/10" },
  rose: { icon: "text-rose-600", surface: "bg-rose-50 dark:bg-rose-400/10" },
};

const MetricCard = ({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  bg,
  tone = "cyan",
  trend,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ElementType;
  accent?: string;
  bg?: string;
  tone?: MetricTone;
  trend?: string;
  className?: string;
  valueClassName?: string;
}) => (
  <div className={cn("admin-metric-card rounded-[1.45rem] border p-5", className)}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--admin-muted)]">{label}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <p className={cn("font-display text-3xl font-bold tracking-[-0.04em] text-[var(--admin-heading)]", valueClassName)}>{value}</p>
          {trend && (
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
              <ArrowUpRight size={11} />
              {trend}
            </span>
          )}
        </div>
        {detail && <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{detail}</p>}
      </div>
      <div className={cn("rounded-2xl p-3", bg || metricToneClasses[tone].surface)}>
        <Icon size={21} strokeWidth={2.1} className={accent || metricToneClasses[tone].icon} />
      </div>
    </div>
  </div>
);

const StatusBadge = ({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "good" | "warn" | "danger" | "info" | "neutral";
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em]",
      tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
        : tone === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
          : tone === "danger"
            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
            : tone === "info"
              ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-200"
              : "border-[var(--admin-border)] bg-[var(--admin-soft)] text-[var(--admin-body)]"
    )}
  >
    {children}
  </span>
);

const Section = ({
  title,
  eyebrow,
  children,
  action,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) => (
  <section className={cn("admin-panel rounded-[1.75rem] border p-5 sm:p-6", className)}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow && <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-300">{eyebrow}</p>}
        <h3 className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-[var(--admin-heading)]">{title}</h3>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const AdminChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className="mt-2 space-y-1">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-5 text-xs">
            <span className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-bold text-slate-900 dark:text-white">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Admin = ({ setActiveTab }: { setActiveTab?: (t: string) => void }) => {
  const { profile, isAdmin } = useAuth();
  const [dateRange, setDateRange] = useState<RangeKey>("7d");
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [goalFilter, setGoalFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [selectedUserId, setSelectedUserId] = useState("");
  const selectedUserMetrics = useUserActivityMetrics(selectedUserId || null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trustedRecords, setTrustedRecords] = useState<AdminRecord[]>([]);
  const [studySessions, setStudySessions] = useState<AdminRecord[]>([]);
  const [progressEvents, setProgressEvents] = useState<AdminRecord[]>([]);
  const [notebookNotes, setNotebookNotes] = useState<AdminRecord[]>([]);
  const [notebookMessages, setNotebookMessages] = useState<AdminRecord[]>([]);
  const [tutorMessages, setTutorMessages] = useState<AdminRecord[]>([]);
  const [decks, setDecks] = useState<AdminRecord[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<AdminRecord[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<AdminRecord[]>([]);
  const [subscriptionCheckouts, setSubscriptionCheckouts] = useState<AdminRecord[]>([]);
  const [loadState, setLoadState] = useState<Record<DataKey, boolean>>(makeLoadState(false));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [grantEmail, setGrantEmail] = useState("");
  const [grantStatus, setGrantStatus] = useState("");
  const [isGranting, setIsGranting] = useState(false);
  const [showDataWarnings, setShowDataWarnings] = useState(false);

  useEffect(() => {
    if (!isAdmin) return undefined;

    setLoadState(makeLoadState(true));
    setErrors({});

    const markLoaded = (key: DataKey) => setLoadState((current) => ({ ...current, [key]: false }));
    const markError = (key: DataKey, error: unknown) => {
      setErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : String(error),
      }));
      markLoaded(key);
    };

    const unsubscribers = [
      onSnapshot(
        query(collection(db, "users"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setUsers(
            snapshot.docs.map((document) => {
              const data = document.data() as Record<string, any>;
              return {
                id: document.id,
                email: String(data.email || ""),
                displayName: String(data.displayName || data.email || "Student"),
                photoURL: data.photoURL || "",
                createdAt: pickDate(data, ["createdAt", "created_at"]),
                lastActive: pickDate(data, ["lastActive", "lastStudySessionAt", "updatedAt"]),
                currentLevel: String(data.currentLevel || data.levelName || "Unknown"),
                goals: Array.isArray(data.goals) ? data.goals.map(String) : [],
                onboardingAnswers: data.onboardingAnswers || {},
                subscription: data.subscription || { plan: "free", status: "active" },
                settings: data.settings || {},
                raw: data,
              };
            })
          );
          markLoaded("users");
        },
        (error) => markError("users", error)
      ),
      onSnapshot(
        query(collectionGroup(db, "trusted"), orderBy("updatedAt", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setTrustedRecords(mapCollectionGroupDocs(snapshot, "trusted", ["updatedAt", "lastActive"]));
          markLoaded("trusted");
        },
        (error) => markError("trusted", error)
      ),
      onSnapshot(
        query(collectionGroup(db, "studySessions"), orderBy("timestamp", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setStudySessions(mapCollectionGroupDocs(snapshot, "studySessions", ["timestamp", "createdAt"]));
          markLoaded("studySessions");
        },
        (error) => markError("studySessions", error)
      ),
      onSnapshot(
        query(collectionGroup(db, "progressEvents"), orderBy("createdAt", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setProgressEvents(mapCollectionGroupDocs(snapshot, "progressEvents", ["createdAt", "processedAt"]));
          markLoaded("progressEvents");
        },
        (error) => markError("progressEvents", error)
      ),
      onSnapshot(
        query(collectionGroup(db, "notebookNotes"), orderBy("updatedAt", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setNotebookNotes(mapCollectionGroupDocs(snapshot, "notebookNotes", ["updatedAt", "createdAt"]));
          markLoaded("notebookNotes");
        },
        (error) => markError("notebookNotes", error)
      ),
      onSnapshot(
        query(collectionGroup(db, "notebookMessages"), orderBy("createdAt", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setNotebookMessages(mapCollectionGroupDocs(snapshot, "notebookMessages", ["createdAt"]));
          markLoaded("notebookMessages");
        },
        (error) => markError("notebookMessages", error)
      ),
      onSnapshot(
        query(collectionGroup(db, "tutorMessages"), orderBy("createdAt", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setTutorMessages(mapCollectionGroupDocs(snapshot, "tutorMessages", ["createdAt"]));
          markLoaded("tutorMessages");
        },
        (error) => markError("tutorMessages", error)
      ),
      onSnapshot(
        query(collectionGroup(db, "decks"), orderBy("updatedAt", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setDecks(mapCollectionGroupDocs(snapshot, "decks", ["updatedAt", "createdAt"]));
          markLoaded("decks");
        },
        (error) => markError("decks", error)
      ),
      onSnapshot(
        query(collection(db, "analyticsEvents"), orderBy("createdAt", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setAnalyticsEvents(
            snapshot.docs
              .map((document) => {
                const data = document.data() as Record<string, any>;
                return {
                  id: document.id,
                  userId: String(data.userId || ""),
                  kind: "analyticsEvents",
                  date: pickDate(data, ["createdAt", "processedAt"]),
                  path: document.ref.path,
                  data,
                } as AdminRecord;
              })
              .filter((record) => record.userId)
          );
          markLoaded("analyticsEvents");
        },
        (error) => markError("analyticsEvents", error)
      ),
      onSnapshot(
        query(collectionGroup(db, "subscriptionRequests"), orderBy("createdAt", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setSubscriptionRequests(mapCollectionGroupDocs(snapshot, "subscriptionRequests", ["createdAt", "serverReceivedAt"]));
          markLoaded("subscriptionRequests");
        },
        (error) => markError("subscriptionRequests", error)
      ),
      onSnapshot(
        query(collectionGroup(db, "subscriptionCheckouts"), orderBy("createdAt", "desc"), limit(MAX_ADMIN_DOCS)),
        (snapshot) => {
          setSubscriptionCheckouts(mapCollectionGroupDocs(snapshot, "subscriptionCheckouts", ["createdAt", "serverReceivedAt", "verifiedAt"]));
          markLoaded("subscriptionCheckouts");
        },
        (error) => markError("subscriptionCheckouts", error)
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [isAdmin]);

  const trustedByUser = useMemo(() => {
    const map = new Map<string, TrustedProgress>();
    trustedRecords.forEach((record) => {
      if (record.id !== "progress") return;
      map.set(record.userId, {
        xp: Number(record.data.xp) || 0,
        level: Number(record.data.level) || 1,
        levelName: String(record.data.levelName || "Novice Student"),
        streak: Number(record.data.streak) || 0,
        totalStudySeconds: Number(record.data.totalStudySeconds) || 0,
        lastActive: toDate(record.data.lastActive),
        lastStudySessionAt: toDate(record.data.lastStudySessionAt),
        updatedAt: toDate(record.data.updatedAt),
      });
    });
    return map;
  }, [trustedRecords]);

  const allActivityRecords = useMemo(
    () => [
      ...analyticsEvents,
      ...studySessions,
      ...progressEvents,
      ...notebookNotes,
      ...notebookMessages,
      ...tutorMessages,
      ...decks,
      ...subscriptionRequests,
      ...subscriptionCheckouts,
    ],
    [
      analyticsEvents,
      decks,
      notebookMessages,
      notebookNotes,
      progressEvents,
      studySessions,
      subscriptionCheckouts,
      subscriptionRequests,
      tutorMessages,
    ]
  );

  const lastActivityByUser = useMemo(() => {
    const latest = new Map<string, Date>();
    const apply = (userId: string, date: Date | null) => {
      if (!userId || !date) return;
      const current = latest.get(userId);
      if (!current || date.getTime() > current.getTime()) latest.set(userId, date);
    };

    users.forEach((user) => {
      apply(user.id, trustedByUser.get(user.id)?.lastActive || user.lastActive);
    });
    allActivityRecords.forEach((record) => apply(record.userId, record.date));
    return latest;
  }, [allActivityRecords, trustedByUser, users]);

  const rows = useMemo<UserRow[]>(() => {
    const now = Date.now();
    return users.map((user) => {
      const trusted = trustedByUser.get(user.id);
      const lastActive = lastActivityByUser.get(user.id) || trusted?.lastActive || user.lastActive;
      return {
        id: user.id,
        name: user.displayName || "Student",
        email: user.email || "Unknown",
        goal: getGoal(user),
        currentLevel: user.currentLevel || trusted?.levelName || "Unknown",
        targetLevel: getTargetLevel(user),
        plan: getPlan(user),
        planStatus: getPlanStatus(user),
        lastActive,
        online: Boolean(lastActive && now - lastActive.getTime() <= ONLINE_WINDOW_MS),
        streak: trusted?.streak ?? (Number(user.raw.streak) || 0),
        totalStudySeconds: trusted?.totalStudySeconds ?? (Number(user.raw.totalStudySeconds) || 0),
        raw: user,
      };
    });
  }, [lastActivityByUser, trustedByUser, users]);

  const goalOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.goal).filter(Boolean))).sort(), [rows]);
  const rangeStart = useMemo(() => getRangeStart(dateRange), [dateRange]);
  const today = useMemo(() => startOfToday(), []);
  const sevenDaysAgo = useMemo(() => addDays(startOfToday(), -6), []);
  const thirtyDaysAgo = useMemo(() => addDays(startOfToday(), -29), []);

  const activeUserIdsSince = (start: Date) => {
    const ids = new Set<string>();
    allActivityRecords.forEach((record) => {
      if (isWithinRange(record.date, start)) ids.add(record.userId);
    });
    rows.forEach((row) => {
      if (isWithinRange(row.lastActive, start)) ids.add(row.id);
    });
    return ids;
  };

  const activeInSelectedRange = activeUserIdsSince(rangeStart);
  const activeToday = activeUserIdsSince(today);
  const activeThisWeek = activeUserIdsSince(sevenDaysAgo);
  const activeThisMonth = activeUserIdsSince(thirtyDaysAgo);
  const onlineUsers = rows.filter((row) => row.online);
  const freeUsers = rows.filter((row) => row.plan === "free");
  const proUsers = rows.filter((row) => row.plan === "pro");
  const cancelledSubscriptions = rows.filter((row) => ["canceled", "cancelled"].includes(row.planStatus) || row.raw.subscription?.cancelAtPeriodEnd);
  const pendingSubscriptionDocs = [...subscriptionRequests, ...subscriptionCheckouts].filter((record) => {
    const status = String(record.data.status || record.data.serverStatus || record.data.verificationStatus || "").toLowerCase();
    return status === "pending" || status.includes("waiting") || status.includes("received");
  });
  const createdKnownUsers = rows.filter((row) => row.raw.createdAt);
  const newUsersToday = rows.filter((row) => row.raw.createdAt && isSameDay(row.raw.createdAt, today));

  const filteredRows = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        !searchTerm ||
        row.name.toLowerCase().includes(searchTerm) ||
        row.email.toLowerCase().includes(searchTerm) ||
        row.goal.toLowerCase().includes(searchTerm) ||
        row.id.toLowerCase().includes(searchTerm);
      const matchesPlan = planFilter === "all" || row.plan === planFilter;
      const matchesGoal = goalFilter === "all" || row.goal === goalFilter;
      const matchesActivity =
        activityFilter === "all" ||
        (activityFilter === "online" && row.online) ||
        (activityFilter === "active_today" && activeToday.has(row.id)) ||
        (activityFilter === "inactive_7d" && !activeThisWeek.has(row.id));
      return matchesSearch && matchesPlan && matchesGoal && matchesActivity;
    });
  }, [activeThisWeek, activeToday, activityFilter, goalFilter, planFilter, rows, search]);

  const selectedUser = rows.find((row) => row.id === selectedUserId);
  const selectedUserRecords = useMemo(
    () => allActivityRecords.filter((record) => record.userId === selectedUserId),
    [allActivityRecords, selectedUserId]
  );

  const selectedStudySessions = studySessions.filter((record) => record.userId === selectedUserId);
  const selectedProgressEvents = progressEvents.filter((record) => record.userId === selectedUserId);
  const selectedNotes = notebookNotes.filter((record) => record.userId === selectedUserId);
  const selectedDecks = decks.filter((record) => record.userId === selectedUserId);
  const selectedTutorMessages = tutorMessages.filter((record) => record.userId === selectedUserId);
  const selectedNotebookMessages = notebookMessages.filter((record) => record.userId === selectedUserId);
  const selectedSubscriptionRequests = subscriptionRequests.filter((record) => record.userId === selectedUserId);
  const selectedSubscriptionCheckouts = subscriptionCheckouts.filter((record) => record.userId === selectedUserId);
  const selectedTrusted = selectedUser ? trustedByUser.get(selectedUser.id) : undefined;
  const selectedWeakTopics = selectedUser ? extractWeakTopics(selectedUser.raw, selectedProgressEvents) : [];

  const selectedRangeSessions = studySessions.filter((record) => isWithinRange(record.date, rangeStart));
  const selectedRangeProgressEvents = progressEvents.filter((record) => isWithinRange(record.date, rangeStart));
  const selectedRangeAnalyticsEvents = analyticsEvents.filter((record) => isWithinRange(record.date, rangeStart));
  const selectedRangeTutorMessages = tutorMessages.filter((record) => isWithinRange(record.date, rangeStart));
  const selectedRangeNotebookMessages = notebookMessages.filter((record) => isWithinRange(record.date, rangeStart));
  const selectedRangeNotes = notebookNotes.filter((record) => isWithinRange(record.date, rangeStart));
  const selectedRangeDecks = decks.filter((record) => isWithinRange(record.date, rangeStart));

  const missionCompletionUsers = new Set(
    selectedRangeProgressEvents
      .filter((record) => {
        const awards = record.data.awards;
        const keys = Array.isArray(awards)
          ? awards.map((award: any) => (typeof award === "string" ? award : award?.key))
          : awards && typeof awards === "object"
            ? Object.keys(awards)
            : [];
        return keys.some((key) => String(key).includes("daily-mission-complete") || String(key).includes("all-daily-tasks"));
      })
      .map((record) => record.userId)
  );

  const averageStudyMinutes =
    activeInSelectedRange.size > 0
      ? Math.round(
          selectedRangeSessions.reduce((total, record) => total + (Number(record.data.duration) || 0), 0) /
            60 /
            activeInSelectedRange.size
        )
      : 0;

  const featureUsage = [
    {
      label: "Tutor",
      value:
        selectedRangeAnalyticsEvents.filter((record) => String(record.data.eventType || "").includes("tutor")).length +
        selectedRangeTutorMessages.length,
    },
    {
      label: "Notebook",
      value:
        selectedRangeAnalyticsEvents.filter((record) => String(record.data.eventType || "").includes("notebook")).length +
        selectedRangeNotebookMessages.length +
        selectedRangeNotes.length,
    },
    {
      label: "Planner",
      value: selectedRangeAnalyticsEvents.filter((record) => String(record.data.eventType || "").includes("planner")).length,
    },
    {
      label: "Decks",
      value:
        selectedRangeAnalyticsEvents.filter((record) => {
          const eventType = String(record.data.eventType || "");
          return eventType.includes("deck") || eventType.includes("flashcard") || eventType.includes("card_review");
        }).length + selectedRangeDecks.length,
    },
    {
      label: "Focus Zone",
      value:
        selectedRangeAnalyticsEvents.filter((record) => String(record.data.eventType || "").includes("focus")).length +
        selectedRangeSessions.filter((record) => record.data.category === "focus").length,
    },
  ];
  const mostUsedFeature = [...featureUsage].sort((a, b) => b.value - a.value)[0];
  const tutorMessagesToday = tutorMessages.filter((record) => record.date && isSameDay(record.date, today)).length;
  const notebookMessagesToday = notebookMessages.filter((record) => record.date && isSameDay(record.date, today)).length;
  const aiErrors = selectedRangeAnalyticsEvents.filter((record) => {
    const eventType = String(record.data.eventType || "").toLowerCase();
    return eventType.includes("error") || Boolean(record.data.error);
  }).length;

  const retentionRate = (day: 1 | 7) => {
    const eligible = rows.filter((row) => row.raw.createdAt && row.raw.createdAt.getTime() <= addDays(today, -day).getTime());
    if (!eligible.length) return "N/A";
    const retained = eligible.filter((row) => {
      if (!row.raw.createdAt) return false;
      const targetDay = addDays(row.raw.createdAt, day);
      return allActivityRecords.some((record) => record.userId === row.id && record.date && isSameDay(record.date, targetDay));
    });
    return percent(retained.length, eligible.length);
  };

  const latestWebhookStatus =
    subscriptionCheckouts
      .slice()
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))[0]?.data.verificationStatus || "Placeholder";

  const verifiedRevenue = subscriptionCheckouts
    .filter((record) => String(record.data.status || record.data.verificationStatus || "").toLowerCase().includes("verified"))
    .reduce((total, record) => total + (Number(record.data.amount) || 0), 0);

  const totalAiInteractions = selectedRangeTutorMessages.length + selectedRangeNotebookMessages.length;
  const proConversion = rows.length ? Math.round((proUsers.length / rows.length) * 100) : 0;
  const activeUserRate = rows.length ? Math.round((activeToday.size / rows.length) * 100) : 0;
  const rangeLabel = RANGE_OPTIONS.find((option) => option.id === dateRange)?.label || "7 days";

  const activityTrend = useMemo(() => {
    if (dateRange === "today") {
      const buckets = Array.from({ length: 8 }, (_, index) => ({
        label: `${String(index * 3).padStart(2, "0")}:00`,
        events: 0,
        users: new Set<string>(),
      }));

      allActivityRecords.forEach((record) => {
        if (!record.date || !isSameDay(record.date, today)) return;
        const bucket = Math.min(7, Math.floor(record.date.getHours() / 3));
        buckets[bucket].events += 1;
        buckets[bucket].users.add(record.userId);
      });

      rows.forEach((row) => {
        if (!row.lastActive || !isSameDay(row.lastActive, today)) return;
        buckets[Math.min(7, Math.floor(row.lastActive.getHours() / 3))].users.add(row.id);
      });

      return buckets.map((bucket) => ({
        label: bucket.label,
        events: bucket.events,
        users: bucket.users.size,
      }));
    }

    const dayCount = dateRange === "7d" ? 7 : 30;
    const buckets = Array.from({ length: dayCount }, (_, index) => {
      const date = addDays(today, index - (dayCount - 1));
      return {
        key: getLocalDateKey(date),
        label: date.toLocaleDateString([], { month: "short", day: "numeric" }),
        events: 0,
        users: new Set<string>(),
      };
    });
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    allActivityRecords.forEach((record) => {
      if (!record.date) return;
      const bucket = byKey.get(getLocalDateKey(record.date));
      if (!bucket) return;
      bucket.events += 1;
      bucket.users.add(record.userId);
    });

    rows.forEach((row) => {
      if (!row.lastActive) return;
      byKey.get(getLocalDateKey(row.lastActive))?.users.add(row.id);
    });

    return buckets.map((bucket) => ({
      label: bucket.label,
      events: bucket.events,
      users: bucket.users.size,
    }));
  }, [allActivityRecords, dateRange, rows, today]);

  const planDistribution = [
    { name: "Pro", value: proUsers.length, color: "#4F46E5" },
    { name: "Free", value: freeUsers.length, color: "#22C7D9" },
  ];

  const featureChartData = featureUsage.map((feature, index) => ({
    ...feature,
    fill: ["#4F46E5", "#22C7D9", "#F59E0B", "#10B981", "#F43F5E"][index],
  }));
  const hasFeatureUsage = featureChartData.some((feature) => feature.value > 0);

  const paymentRows = [
    {
      label: "Active subscriptions",
      value: proUsers.length,
      detail: `${proConversion}% of all accounts`,
      tone: "good" as const,
    },
    {
      label: "Pending requests",
      value: pendingSubscriptionDocs.length,
      detail: "Needs operational follow-up",
      tone: pendingSubscriptionDocs.length ? ("warn" as const) : ("neutral" as const),
    },
    {
      label: "Cancelled",
      value: cancelledSubscriptions.length,
      detail: "Cancelled or cancel-at-period-end",
      tone: cancelledSubscriptions.length ? ("danger" as const) : ("neutral" as const),
    },
  ];

  const grantAdminAccess = async () => {
    if (!grantEmail.trim()) {
      setGrantStatus("Enter a valid email address.");
      return;
    }

    setIsGranting(true);
    setGrantStatus("");

    try {
      const grantAdmin = httpsCallable<{ email: string }, { ok: boolean; uid: string; email: string }>(
        functions,
        "grantAdminByEmail"
      );
      const result = await grantAdmin({ email: grantEmail.trim() });
      setGrantStatus(`Admin access granted to ${result.data.email}.`);
      setGrantEmail("");
    } catch (error) {
      console.warn(error);
      setGrantStatus("Could not grant admin access. Try again.");
    } finally {
      setIsGranting(false);
    }
  };

  const isLoading = Object.values(loadState).some(Boolean);
  const errorEntries = Object.entries(errors).filter(([, value]) => value);

  if (!isAdmin) {
    return (
      <div className="admin-dashboard">
        <div className="admin-panel rounded-[1.75rem] border p-10 text-center">
          <ShieldCheck className="mx-auto text-slate-600" size={38} />
          <h2 className="mt-5 text-3xl font-bold text-white">Admin access required</h2>
          <p className="mt-4 text-slate-400">This control center is available only to accounts with the admin role.</p>
        </div>
      </div>
    );
  }

  if (selectedUser) {
    const recentActivity = selectedUserRecords
      .slice()
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
      .slice(0, 12);

    return (
      <div className="admin-dashboard space-y-7 pb-24">
        <header className="admin-hero flex flex-col gap-5 rounded-[2rem] border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => setSelectedUserId("")}
              className="admin-secondary-button mb-4 inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-extrabold transition"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-indigo-600 dark:text-indigo-300">User Detail</p>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-[-0.05em] text-[var(--admin-heading)]">{selectedUser.name}</h2>
            <p className="mt-2 text-sm text-[var(--admin-muted)]">{selectedUser.email} / {selectedUser.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={selectedUser.online ? "good" : "neutral"}>{selectedUser.online ? "Online" : "Offline"}</StatusBadge>
            <StatusBadge tone={selectedUser.plan === "pro" ? "good" : "neutral"}>{selectedUser.plan}</StatusBadge>
            <StatusBadge>{selectedUser.currentLevel}</StatusBadge>
          </div>
        </header>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Trusted XP" value={String(selectedUserMetrics.xp)} icon={Zap} detail={`Level ${selectedUserMetrics.level}`} />
          <MetricCard label="Streak" value={String(selectedUserMetrics.streak)} icon={Activity} detail="Realtime trusted progress" />
          <MetricCard label="Focus time" value={formatStudyTime(selectedUserMetrics.focusMinutes * 60)} icon={Timer} detail="Realtime focus sessions" />
          <MetricCard label="Last active" value={formatDateOnly(selectedUser.lastActive)} icon={Clock} detail={formatDateTime(selectedUser.lastActive)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Section title="Profile Data" eyebrow="Identity">
            <div className="grid gap-3 text-sm">
              {[
                ["Name", selectedUser.name],
                ["Email", selectedUser.email],
                ["Goal", selectedUser.goal],
                ["Current level", selectedUser.currentLevel],
                ["Target level", selectedUser.targetLevel],
                ["Created", formatDateTime(selectedUser.raw.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="admin-soft-surface flex justify-between gap-4 rounded-2xl border p-3">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-right font-semibold text-white">{value}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Onboarding Answers" eyebrow="Profile">
            {selectedUser.raw.onboardingAnswers && Object.keys(selectedUser.raw.onboardingAnswers).length > 0 ? (
              <div className="grid gap-3 text-sm">
                {Object.entries(selectedUser.raw.onboardingAnswers).map(([key, value]) => (
                  <div key={key} className="admin-soft-surface rounded-2xl border p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{key}</p>
                    <p className="mt-1 text-white">{String(value)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No onboarding answers stored." />
            )}
          </Section>

          <Section title="Subscription" eyebrow="Payment">
            <div className="grid gap-3 text-sm">
              {[
                ["Plan", selectedUser.plan],
                ["Status", selectedUser.planStatus],
                ["Requests", String(selectedSubscriptionRequests.length)],
                ["Checkouts", String(selectedSubscriptionCheckouts.length)],
              ].map(([label, value]) => (
                <div key={label} className="admin-soft-surface flex justify-between gap-4 rounded-2xl border p-3">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-white">{value}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Study sessions" value={String(selectedStudySessions.length)} icon={Timer} />
          <MetricCard label="Progress events" value={String(selectedProgressEvents.length)} icon={Activity} />
          <MetricCard label="Notes" value={String(selectedUserMetrics.notesCreated)} icon={FileText} />
          <MetricCard label="Sources" value={String(selectedUserMetrics.sourcesUploaded)} icon={Database} />
          <MetricCard label="Decks" value={String(selectedUserMetrics.decksCreated)} icon={Layers} />
          <MetricCard label="Flashcards" value={String(selectedUserMetrics.flashcardsCreated)} icon={Layers} />
          <MetricCard label="Tutor messages" value={String(selectedTutorMessages.length)} icon={MessageSquare} />
          <MetricCard label="Notebook messages" value={String(selectedUserMetrics.notebookMessages)} icon={Brain} />
          <MetricCard label="Exam readiness" value={`${selectedUserMetrics.examReadiness}%`} icon={CheckCircle2} />
          <MetricCard label="Recent activity" value={String(recentActivity.length)} icon={Database} />
          <MetricCard label="Weak topics" value={String(selectedWeakTopics.length)} icon={AlertCircle} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Recent Activity" eyebrow="Timeline">
            {recentActivity.length ? (
              <div className="space-y-3">
                {recentActivity.map((record) => (
                  <div key={record.path} className="admin-soft-surface rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">{getActivityLabel(record)}</p>
                        <p className="mt-1 text-xs text-slate-500">{record.path}</p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">{formatDateTime(record.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No recent activity found for this user." />
            )}
          </Section>

          <Section title="Weak Topics" eyebrow="Signals">
            {selectedWeakTopics.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedWeakTopics.map((topic) => (
                  <StatusBadge key={topic} tone="warn">{topic}</StatusBadge>
                ))}
              </div>
            ) : (
              <EmptyState message="No weak topic fields found in onboarding or progress events." />
            )}
          </Section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Study Sessions" eyebrow="Learning">
            {selectedStudySessions.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                    <tr>
                      <th className="pb-3">Subject</th>
                      <th className="pb-3">Duration</th>
                      <th className="pb-3">XP</th>
                      <th className="pb-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {selectedStudySessions.slice(0, 10).map((session) => (
                      <tr key={session.path}>
                        <td className="py-3 text-white">{session.data.subject || "Study"}</td>
                        <td className="py-3 text-slate-300">{formatStudyTime(Number(session.data.duration) || 0)}</td>
                        <td className="py-3 text-slate-300">{Number(session.data.xpEarned) || 0}</td>
                        <td className="py-3 text-slate-500">{formatDateTime(session.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No study sessions found." />
            )}
          </Section>

          <Section title="Progress Events" eyebrow="Server pipeline">
            {selectedProgressEvents.length ? (
              <div className="space-y-3">
                {selectedProgressEvents.slice(0, 10).map((event) => (
                  <div key={event.path} className="admin-soft-surface rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{event.data.type || event.id}</p>
                      <StatusBadge tone={event.data.status === "processed" ? "good" : "neutral"}>
                        {event.data.status || "pending"}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(event.date)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No progress events found." />
            )}
          </Section>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard space-y-6 pb-24">
      <ClientErrorMonitor />
      <header className="admin-hero relative overflow-hidden rounded-[2rem] border p-6 sm:p-8">
        <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-indigo-600 dark:text-indigo-300">
                Founder control center
              </span>
              <StatusBadge tone={errorEntries.length ? "warn" : "good"}>
                {errorEntries.length ? `${errorEntries.length} data warning` : "Live Firestore"}
              </StatusBadge>
            </div>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-[-0.055em] text-[var(--admin-heading)] sm:text-5xl">
              Noviq Admin
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--admin-body)] sm:text-base">
              Users, learning activity, AI usage, subscriptions, and platform health in one operational view.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="admin-segmented inline-flex w-fit rounded-2xl border p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={dateRange === option.id}
                  onClick={() => setDateRange(option.id)}
                  className={cn(
                    "rounded-xl px-4 py-2.5 text-xs font-extrabold transition",
                    dateRange === option.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-[var(--admin-muted)] hover:text-[var(--admin-heading)]"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="admin-profile-chip rounded-2xl border px-4 py-3">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[var(--admin-muted)]">Signed in</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="max-w-[220px] truncate text-sm font-bold text-[var(--admin-heading)]">{profile?.email || "Unknown"}</span>
                {isLoading && <Loader2 size={14} className="animate-spin text-indigo-600" />}
              </div>
            </div>
          </div>
        </div>
      </header>

      {errorEntries.length > 0 && (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-extrabold">Some admin data could not load</p>
                <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-100/70">
                  {errorEntries.length} Firestore sources need permission or index review. Available metrics are still shown below.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDataWarnings((current) => !current)}
              aria-expanded={showDataWarnings}
              className="shrink-0 rounded-xl border border-amber-300 bg-white/60 px-3 py-2 text-xs font-extrabold text-amber-900 transition hover:bg-white dark:border-amber-300/20 dark:bg-white/5 dark:text-amber-100"
            >
              {showDataWarnings ? "Hide details" : "View details"}
            </button>
          </div>
          {showDataWarnings && (
            <div className="mt-4 grid gap-2 border-t border-amber-200 pt-4 text-sm dark:border-amber-300/15 sm:grid-cols-2">
              {errorEntries.map(([key, value]) => (
                <p key={key}>
                  <span className="font-bold">{key}:</span> {value}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total users"
          value={formatCompactNumber(rows.length)}
          icon={Users}
          tone="indigo"
          trend={newUsersToday.length ? `+${newUsersToday.length} today` : undefined}
          detail={`${createdKnownUsers.length} accounts have reliable signup dates`}
        />
        <MetricCard
          label="Active today"
          value={formatCompactNumber(activeToday.size)}
          icon={Activity}
          tone="green"
          detail={`${activeUserRate}% of all users · ${onlineUsers.length} online now`}
        />
        <MetricCard
          label="Pro conversion"
          value={`${proConversion}%`}
          icon={CreditCard}
          tone="amber"
          detail={`${proUsers.length} Pro · ${freeUsers.length} Free`}
        />
        <MetricCard
          label="AI interactions"
          value={formatCompactNumber(totalAiInteractions)}
          icon={Sparkles}
          tone={aiErrors ? "rose" : "cyan"}
          detail={`${rangeLabel} · ${aiErrors} tracked errors`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Section
          title="Activity overview"
          eyebrow={`${rangeLabel} trend`}
          className="xl:col-span-8"
          action={<StatusBadge tone="info">Realtime</StatusBadge>}
        >
          <div className="mb-5 flex flex-wrap gap-5 text-xs font-semibold text-[var(--admin-muted)]">
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />Active users</span>
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />Product events</span>
          </div>
          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--admin-chart-grid)" strokeDasharray="4 6" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--admin-muted)", fontSize: 11 }} minTickGap={22} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--admin-muted)", fontSize: 11 }} />
                <Tooltip content={<AdminChartTooltip />} cursor={{ stroke: "#A5B4FC", strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="events" name="Events" stroke="#22C7D9" strokeWidth={2.2} fill="#22C7D9" fillOpacity={0.08} />
                <Area type="monotone" dataKey="users" name="Active users" stroke="#4F46E5" strokeWidth={3} fill="#4F46E5" fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Plan mix" eyebrow="Subscriptions" className="xl:col-span-4">
          <div className="relative mx-auto h-[235px] max-w-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows.length ? planDistribution : [{ name: "No users", value: 1, color: "#E5E7EB" }]}
                  dataKey="value"
                  innerRadius={67}
                  outerRadius={94}
                  paddingAngle={4}
                  stroke="transparent"
                >
                  {(rows.length ? planDistribution : [{ name: "No users", value: 1, color: "#E5E7EB" }]).map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<AdminChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-bold tracking-[-0.05em] text-[var(--admin-heading)]">{rows.length}</span>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--admin-muted)]">accounts</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {planDistribution.map((item) => (
              <div key={item.name} className="admin-soft-surface rounded-2xl border p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </div>
                <p className="mt-2 text-xl font-bold text-[var(--admin-heading)]">{item.value}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Section title="Feature usage" eyebrow="Product analytics" className="xl:col-span-7">
          {hasFeatureUsage ? (
            <div className="h-[310px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureChartData} layout="vertical" margin={{ top: 0, right: 18, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--admin-chart-grid)" strokeDasharray="4 6" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={82}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--admin-body)", fontSize: 12, fontWeight: 700 }}
                  />
                  <Tooltip content={<AdminChartTooltip />} cursor={{ fill: "var(--admin-soft)" }} />
                  <Bar dataKey="value" name="Interactions" radius={[0, 10, 10, 0]} barSize={22}>
                    {featureChartData.map((entry) => <Cell key={entry.label} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex min-h-[310px] items-center justify-center">
              <EmptyState message="No feature usage events are available for this range. Check analytics permissions or switch the date filter." />
            </div>
          )}
        </Section>

        <Section title="Growth signals" eyebrow="Learning health" className="xl:col-span-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="DAU / WAU" value={`${activeToday.size} / ${activeThisWeek.size}`} icon={Activity} tone="indigo" />
            <MetricCard label="Monthly active" value={String(activeThisMonth.size)} icon={Users} tone="cyan" />
            <MetricCard label="Day 1 retention" value={retentionRate(1)} icon={CheckCircle2} tone="green" />
            <MetricCard label="Day 7 retention" value={retentionRate(7)} icon={CheckCircle2} tone="green" />
            <MetricCard label="Mission completion" value={percent(missionCompletionUsers.size, activeInSelectedRange.size)} icon={Sparkles} tone="amber" />
            <MetricCard label="Avg study / active" value={`${averageStudyMinutes}m`} icon={Timer} tone="cyan" />
          </div>
        </Section>
      </div>

      <Section
        title="User management"
        eyebrow="Accounts"
        action={<StatusBadge tone="info">{filteredRows.length} shown</StatusBadge>}
      >
        <div className="mb-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_170px_210px_190px]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]" size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, goal, or UID"
              className="admin-input w-full rounded-2xl border py-3 pl-11 pr-4 text-sm outline-none transition"
            />
          </div>
          <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value as PlanFilter)} className="admin-input rounded-2xl border px-4 py-3 text-sm font-semibold outline-none">
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
          <select value={goalFilter} onChange={(event) => setGoalFilter(event.target.value)} className="admin-input rounded-2xl border px-4 py-3 text-sm font-semibold outline-none">
            <option value="all">All goals</option>
            {goalOptions.map((goal) => <option key={goal} value={goal}>{goal}</option>)}
          </select>
          <select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)} className="admin-input rounded-2xl border px-4 py-3 text-sm font-semibold outline-none">
            <option value="all">All activity</option>
            <option value="online">Online now</option>
            <option value="active_today">Active today</option>
            <option value="inactive_7d">Inactive 7d</option>
          </select>
        </div>

        {filteredRows.length ? (
          <div className="CustomScrollbar max-h-[580px] overflow-auto rounded-[1.35rem] border border-[var(--admin-border)]">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--admin-panel-solid)] text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
                <tr>
                  <th className="px-4 py-3.5">User</th>
                  <th className="px-4 py-3.5">Goal</th>
                  <th className="px-4 py-3.5">Level</th>
                  <th className="px-4 py-3.5">Plan</th>
                  <th className="px-4 py-3.5">Last active</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Streak</th>
                  <th className="px-4 py-3.5">Study time</th>
                  <th className="w-14 px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-border)]">
                {filteredRows.map((row) => (
                  <tr key={row.id} onClick={() => setSelectedUserId(row.id)} className="admin-table-row cursor-pointer transition">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {row.raw.photoURL ? (
                          <img src={row.raw.photoURL} alt="" className="h-10 w-10 rounded-2xl object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-sm font-extrabold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200">
                            {row.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate font-bold text-[var(--admin-heading)]">{row.name}</p>
                          <p className="mt-1 max-w-[220px] truncate text-xs text-[var(--admin-muted)]">{row.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-4 text-[var(--admin-body)]">{row.goal}</td>
                    <td className="px-4 py-4 text-[var(--admin-body)]">{row.currentLevel}</td>
                    <td className="px-4 py-4"><StatusBadge tone={row.plan === "pro" ? "info" : "neutral"}>{row.plan}</StatusBadge></td>
                    <td className="px-4 py-4 text-[var(--admin-muted)]">{formatDateTime(row.lastActive)}</td>
                    <td className="px-4 py-4"><StatusBadge tone={row.online ? "good" : "neutral"}>{row.online ? "Online" : "Offline"}</StatusBadge></td>
                    <td className="px-4 py-4 font-bold text-[var(--admin-heading)]">{row.streak}</td>
                    <td className="px-4 py-4 text-[var(--admin-body)]">{formatStudyTime(row.totalStudySeconds)}</td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        aria-label={`Open ${row.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedUserId(row.id);
                        }}
                        className="admin-icon-button flex h-9 w-9 items-center justify-center rounded-xl border transition"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message={isLoading ? "Loading users..." : "No users match the current filters."} />
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-12">
        <Section title="Payment operations" eyebrow="Subscriptions" className="xl:col-span-5" action={<StatusBadge tone={pendingSubscriptionDocs.length ? "warn" : "good"}>{pendingSubscriptionDocs.length ? "Review needed" : "Healthy"}</StatusBadge>}>
          <MetricCard
            label="Verified revenue"
            value={verifiedRevenue ? `${verifiedRevenue.toLocaleString()} UZS` : "Not tracked"}
            valueClassName={verifiedRevenue ? "text-2xl" : "text-xl"}
            icon={Database}
            tone={verifiedRevenue ? "green" : "amber"}
            detail="Revenue appears after verified payment settlement events are connected."
          />
          <div className="mt-4 space-y-3">
            {paymentRows.map((item) => (
              <div key={item.label} className="admin-soft-surface flex items-center justify-between gap-4 rounded-2xl border p-4">
                <div>
                  <p className="font-bold text-[var(--admin-heading)]">{item.label}</p>
                  <p className="mt-1 text-xs text-[var(--admin-muted)]">{item.detail}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-[var(--admin-heading)]">{item.value}</span>
                  <StatusBadge tone={item.tone}>{item.tone === "good" ? "Good" : item.tone === "warn" ? "Pending" : item.tone === "danger" ? "Watch" : "Clear"}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-[var(--admin-border)] px-4 py-3 text-sm">
            <span className="text-[var(--admin-muted)]">Webhook status</span>
            <StatusBadge tone={latestWebhookStatus === "Placeholder" ? "warn" : "good"}>{String(latestWebhookStatus)}</StatusBadge>
          </div>
        </Section>

        <Section title="AI usage" eyebrow={rangeLabel} className="xl:col-span-4">
          <MetricCard label="Total interactions" value={formatCompactNumber(totalAiInteractions)} icon={Sparkles} tone="indigo" detail={`${mostUsedFeature?.label || "No feature"} is currently the most used AI surface`} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <MetricCard label="Tutor today" value={String(tutorMessagesToday)} icon={MessageSquare} tone="cyan" />
            <MetricCard label="Notebook today" value={String(notebookMessagesToday)} icon={Brain} tone="green" />
            <MetricCard label="AI errors" value={String(aiErrors)} icon={AlertCircle} tone={aiErrors ? "rose" : "green"} />
            <MetricCard label="Token / cost" value="Not tracked" valueClassName="text-lg" icon={Database} tone="amber" />
          </div>
        </Section>

        <Section title="Security" eyebrow="Access control" className="xl:col-span-3" action={<ShieldCheck size={20} className="text-emerald-600" />}>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <p className="font-bold text-emerald-800 dark:text-emerald-200">Admin-only route active</p>
            <p className="mt-1 text-xs leading-5 text-emerald-700/80 dark:text-slate-300">Custom claim resolves before this dashboard renders.</p>
          </div>
          <div className="mt-4">
            <label htmlFor="grant-admin-email" className="text-xs font-bold text-[var(--admin-heading)]">Grant admin access</label>
            <input
              id="grant-admin-email"
              value={grantEmail}
              onChange={(event) => setGrantEmail(event.target.value)}
              type="email"
              placeholder="user@example.com"
              className="admin-input mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
            />
            <button
              type="button"
              onClick={grantAdminAccess}
              disabled={isGranting}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isGranting ? "Granting..." : "Grant Admin"}
            </button>
            {grantStatus && <p className="mt-3 text-xs leading-5 text-[var(--admin-body)]">{grantStatus}</p>}
          </div>
        </Section>
      </div>
    </div>
  );
};
