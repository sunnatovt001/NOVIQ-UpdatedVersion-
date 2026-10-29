export type RangeKey = "today" | "7d" | "30d";
export type PlanFilter = "all" | "free" | "pro";
export type ActivityFilter = "all" | "online" | "active_today" | "inactive_7d";

export type DataKey =
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

export type AdminUser = {
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

export type AdminRecord = {
  id: string;
  userId: string;
  kind: string;
  date: Date | null;
  path: string;
  data: Record<string, any>;
};

export type TrustedProgress = {
  xp: number;
  level: number;
  levelName: string;
  streak: number;
  totalStudySeconds: number;
  lastActive: Date | null;
  lastStudySessionAt: Date | null;
  updatedAt: Date | null;
};

export type UserRow = {
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
  bestStreak: number;
  raw: AdminUser;
};

export const DATA_KEYS: DataKey[] = [
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

export const RANGE_OPTIONS: { id: RangeKey; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

// Keep admin queries within the MongoDB data API's 1000-document limit.
export const MAX_ADMIN_DOCS = 1000;
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export const makeLoadState = (value: boolean) =>
  DATA_KEYS.reduce(
    (state, key) => ({
      ...state,
      [key]: value,
    }),
    {} as Record<DataKey, boolean>
  );

export const toDate = (value: unknown): Date | null => {
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

export const pickDate = (data: Record<string, any>, fields: string[]) => {
  for (const field of fields) {
    const date = toDate(data[field]);
    if (date) return date;
  }
  return null;
};

export const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const getRangeStart = (range: RangeKey) => {
  const today = startOfToday();
  if (range === "today") return today;
  return addDays(today, range === "7d" ? -6 : -29);
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const isWithinRange = (date: Date | null, rangeStart: Date) => Boolean(date && date.getTime() >= rangeStart.getTime());

export const formatDateTime = (date: Date | null) =>
  date ? date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unknown";

export const formatDateOnly = (date: Date | null) =>
  date ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Unknown";

export const formatStudyTime = (seconds: number) => {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

export const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const getLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const percent = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : "N/A");

export const getRecordUserId = (document: any, data: Record<string, any>) =>
  String(data.userId || document.ref.parent.parent?.id || "");

export const mapCollectionGroupDocs = (snapshot: any, kind: string, dateFields: string[]) =>
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

export const getPlan = (user: AdminUser): "free" | "pro" => {
  const subscription = user.subscription || {};
  const plan = String(subscription.plan || "free");
  const status = String(subscription.status || "active");
  return plan === "pro" && ["active", "trialing"].includes(status) ? "pro" : "free";
};

export const getPlanStatus = (user: AdminUser) => String(user.subscription?.status || "active");

export const getGoal = (user: AdminUser) =>
  user.goals[0] ||
  String(user.onboardingAnswers?.mainGoal || "") ||
  "Not set";

export const getTargetLevel = (user: AdminUser) =>
  String(
    user.settings?.targetLevel ||
      user.settings?.targetScore ||
      user.raw.targetLevel ||
      user.raw.targetScore ||
      "Not set"
  );

export const getActivityLabel = (record: AdminRecord) => {
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

export const extractWeakTopics = (user: AdminUser, progressEvents: AdminRecord[]) => {
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

