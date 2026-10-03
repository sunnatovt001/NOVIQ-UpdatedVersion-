import React from "react";
import {
  collection,
  doc,
  onSnapshot,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  query,
  where,
  or,
  type Query,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { calculateLevel, getCurrentStreak } from "@/src/lib/progress";

export type UserActivityMetrics = {
  focusMinutes: number;
  tasksDone: number;
  notesCreated: number;
  sourcesUploaded: number;
  notebookMessages: number;
  tutorMessages: number;
  decksCreated: number;
  flashcardsCreated: number;
  examReadiness: number;
  xp: number;
  level: number;
  streak: number;
  loading: boolean;
  error: string | null;
};

const EMPTY_METRICS: UserActivityMetrics = {
  focusMinutes: 0,
  tasksDone: 0,
  notesCreated: 0,
  sourcesUploaded: 0,
  notebookMessages: 0,
  tutorMessages: 0,
  decksCreated: 0,
  flashcardsCreated: 0,
  examReadiness: 0,
  xp: 0,
  level: 1,
  streak: 0,
  loading: false,
  error: null,
};

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === "function") {
      const parsed = timestamp.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof timestamp.seconds === "number") {
      const parsed = new Date(timestamp.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  return null;
};

const getLocalDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

type DayScope = {
  key: string;
  start: Date;
  end: Date;
  isFuture: boolean;
};

export type UserActivityMetricsOptions = {
  scopeDate?: Date | string | null;
};

const createDayScope = (value?: Date | string | null): DayScope | null => {
  const parsed = toDate(value);
  if (!parsed) return null;

  const start = startOfLocalDay(parsed);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return {
    key: getLocalDayKey(start),
    start,
    end,
    isFuture: start.getTime() > startOfLocalDay(new Date()).getTime(),
  };
};

const pickRecordDate = (data: Record<string, any>, fields: string[]) => {
  for (const field of fields) {
    const parsed = toDate(data[field]);
    if (parsed) return parsed;
  }
  return null;
};

const isWithinDayScope = (date: Date | null, scope: DayScope | null) => {
  if (!scope) return true;
  if (scope.isFuture || !date) return false;
  return (
    date.getTime() >= scope.start.getTime() &&
    date.getTime() < scope.end.getTime()
  );
};

const normalizeToken = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const isCompleted = (data: Record<string, any>) => {
  const status = normalizeToken(data.status || data.state);
  return (
    data.done === true ||
    data.completed === true ||
    status === "completed" ||
    status === "done"
  );
};

const countPlannerTasksDone = (
  data: Record<string, any> | null,
  scope: DayScope | null,
) => {
  const state =
    data?.state && typeof data.state === "object" ? data.state : data;
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  const progress =
    state?.taskProgress && typeof state.taskProgress === "object"
      ? state.taskProgress
      : {};

  if (tasks.length === 0) {
    return Object.values(progress).filter((item) => {
      const progressData = (item || {}) as Record<string, any>;
      return (
        isCompleted(progressData) &&
        isWithinDayScope(
          pickRecordDate(progressData, [
            "completedAt",
            "updatedAt",
            "createdAt",
          ]),
          scope,
        )
      );
    }).length;
  }

  return tasks.filter((task: any) => {
    const taskProgress = progress[task.id] || task.progress || task;
    return (
      isCompleted(taskProgress) &&
      isWithinDayScope(
        pickRecordDate(taskProgress, ["completedAt", "updatedAt", "createdAt"]),
        scope,
      )
    );
  }).length;
};

const calculateExamReadiness = ({
  focusMinutes,
  tasksDone,
  notesCreated,
  sourcesUploaded,
  notebookMessages,
  tutorMessages,
  decksCreated,
  flashcardsCreated,
  xp,
}: Pick<
  UserActivityMetrics,
  | "focusMinutes"
  | "tasksDone"
  | "notesCreated"
  | "sourcesUploaded"
  | "notebookMessages"
  | "tutorMessages"
  | "decksCreated"
  | "flashcardsCreated"
  | "xp"
>) => {
  const hasRealActivity =
    focusMinutes > 0 ||
    tasksDone > 0 ||
    notesCreated > 0 ||
    sourcesUploaded > 0 ||
    notebookMessages > 0 ||
    tutorMessages > 0 ||
    decksCreated > 0 ||
    flashcardsCreated > 0 ||
    xp > 0;

  if (!hasRealActivity) return 0;

  const focusScore = Math.min(100, Math.round((focusMinutes / 30) * 100));
  const taskScore = Math.min(100, tasksDone * 12);
  const notebookScore = Math.min(
    100,
    notesCreated * 10 + sourcesUploaded * 12 + notebookMessages * 4,
  );
  const tutorScore = Math.min(100, tutorMessages * 5);
  const recallScore = Math.min(100, decksCreated * 12 + flashcardsCreated * 2);
  const xpScore = Math.min(100, Math.round(xp / 10));

  return Math.min(
    100,
    Math.round(
      focusScore * 0.25 +
        taskScore * 0.22 +
        notebookScore * 0.2 +
        tutorScore * 0.1 +
        recallScore * 0.15 +
        xpScore * 0.08,
    ),
  );
};

// Aggregate reads keep message/card contents off statistics screens. Only the
// profile, trusted progress, planner state and deck metadata use live listeners.
export const useUserActivityMetrics = (
  uid?: string | null,
  options: UserActivityMetricsOptions = {},
): UserActivityMetrics => {
  const dayScope = React.useMemo(
    () => createDayScope(options.scopeDate),
    [options.scopeDate],
  );
  const [metrics, setMetrics] =
    React.useState<UserActivityMetrics>(EMPTY_METRICS);
  React.useEffect(() => {
    setMetrics({ ...EMPTY_METRICS, loading: !!uid });
    if (!uid) return;
    let active = true,
      refreshing = false,
      deckIds: string[] = [],
      roadmapDone = 0,
      plannerDone = 0;
    const update = (patch: Partial<UserActivityMetrics>) => {
      if (active) setMetrics((current) => ({ ...current, ...patch }));
    };
    const failure = (error: unknown) =>
      update({
        error:
          "Statistics could not be refreshed. Check your connection and try again.",
        loading: false,
      });
    const scoped = (target: Query, field = "createdAt") =>
      dayScope
        ? query(
            target,
            where(field, ">=", dayScope.start.toISOString()),
            where(field, "<", dayScope.end.toISOString()),
          )
        : target;
    const target = (name: string) => collection(db, "users", uid, name);
    const count = async (target: Query) =>
      (await getCountFromServer(target)).data().count;
    const refresh = async () => {
      if (!active || refreshing || document.hidden) return;
      if (!navigator.onLine) {
        update({
          loading: false,
          error: "You are offline. Statistics will refresh when connected.",
        });
        return;
      }
      refreshing = true;
      try {
        if (dayScope?.isFuture) {
          update({ ...EMPTY_METRICS, loading: false });
          return;
        }
        const sessions = scoped(target("studySessions"), "timestamp");
        const [
          focus,
          notes,
          sources,
          notebook,
          tutor,
          decks,
          roadmap,
          cards,
          dailyXp,
        ] = await Promise.all([
          getAggregateFromServer(
            query(sessions, where("category", "==", "focus")),
            { seconds: sum("duration") },
          ),
          count(scoped(target("notebookNotes"))),
          count(scoped(target("notebookSources"))),
          count(
            scoped(
              query(target("notebookMessages"), where("role", "==", "user")),
            ),
          ),
          count(
            scoped(query(target("tutorMessages"), where("role", "==", "user"))),
          ),
          count(scoped(target("decks"))),
          count(
            scoped(
              query(
                target("roadmapTasks"),
                or(
                  where("done", "==", true),
                  where("completed", "==", true),
                  where("status", "in", ["completed", "done"]),
                ),
              ),
              "completedAt",
            ),
          ),
          Promise.all(
            deckIds.map((id) =>
              count(scoped(collection(db, "users", uid, "decks", id, "cards"))),
            ),
          ),
          dayScope
            ? getAggregateFromServer(sessions, { xp: sum("xpEarned") })
            : Promise.resolve(null),
        ]);
        roadmapDone = roadmap;
        update({
          focusMinutes: Math.round(toNumber(focus.data().seconds) / 60),
          notesCreated: notes,
          sourcesUploaded: sources,
          notebookMessages: notebook,
          tutorMessages: tutor,
          decksCreated: decks,
          flashcardsCreated: cards.reduce((total, value) => total + value, 0),
          tasksDone: roadmapDone + plannerDone,
          ...(dailyXp ? { xp: toNumber(dailyXp.data().xp) } : {}),
          loading: false,
          error: null,
        });
      } catch (error) {
        failure(error);
      } finally {
        refreshing = false;
      }
    };
    const profile = (snapshot: {
      exists: () => boolean;
      data: () => Record<string, unknown> | undefined;
    }) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() || {},
        xp = toNumber(data.xp);
      update({
        ...(!dayScope ? { xp } : {}),
        level: toNumber(data.level) || calculateLevel(xp),
        streak: getCurrentStreak(
          toNumber(data.streak),
          typeof data.lastActive === "string" ? data.lastActive : undefined,
        ),
      });
    };
    let trustedLoaded = false;
    const stop = [
      onSnapshot(
        doc(db, "users", uid),
        (snap) => {
          if (!trustedLoaded) profile(snap);
        },
        failure,
      ),
      onSnapshot(
        doc(db, "users", uid, "trusted", "progress"),
        (snap) => {
          trustedLoaded = snap.exists();
          profile(snap);
        },
        failure,
      ),
      onSnapshot(
        doc(db, "users", uid, "planner", "state"),
        (snap) => {
          plannerDone = snap.exists()
            ? countPlannerTasksDone(snap.data(), dayScope)
            : 0;
          update({ tasksDone: roadmapDone + plannerDone });
        },
        failure,
      ),
      onSnapshot(
        target("decks"),
        (snap) => {
          deckIds = snap.docs.map((doc) => doc.id);
          void refresh();
        },
        failure,
      ),
    ];
    const timer = window.setInterval(() => void refresh(), 60000);
    const resume = () => void refresh();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    return () => {
      active = false;
      stop.forEach((fn) => fn());
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [uid, dayScope]);
  const examReadiness = React.useMemo(
    () => calculateExamReadiness(metrics),
    [metrics],
  );
  return uid ? { ...metrics, examReadiness } : EMPTY_METRICS;
};
