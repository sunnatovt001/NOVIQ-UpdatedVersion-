import React from "react";
import {
  collection,
  doc,
  onSnapshot,
  getCountFromServer,
  getAggregateFromServer,
  getDocsFromServer,
  sum,
  query,
  where,
  or,
  limit,
  type Query,
  type DocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import { withDeadline } from "./asyncRequest";
import { db } from "@/src/lib/firebase";
import { calculateLevel, getCurrentStreak } from "@/src/lib/progressMath";
import { summarizeCards, isMeaningfulSession } from "./activityEvidence";
import { getCloudMetrics, serverMetricsEnabled } from "./cloudMetrics";
import { reportClientError } from "./errorReporting";

export type UserActivityMetrics = {
  retry: () => void;
  focusMinutes: number;
  tasksDone: number;
  notesCreated: number;
  sourcesUploaded: number;
  notebookMessages: number;
  tutorMessages: number;
  decksCreated: number;
  flashcardsCreated: number;
  dueCards: number;
  reviewedCards: number;
  missionTotal: number;
  missionCompleted: number;
  examReadiness: number;
  xp: number;
  level: number;
  streak: number;
  loading: boolean;
  error: string | null;
};

const EMPTY_METRICS: UserActivityMetrics = {
  retry: () => undefined,
  focusMinutes: 0,
  tasksDone: 0,
  notesCreated: 0,
  sourcesUploaded: 0,
  notebookMessages: 0,
  tutorMessages: 0,
  decksCreated: 0,
  flashcardsCreated: 0,
  dueCards: 0,
  reviewedCards: 0,
  missionTotal: 0,
  missionCompleted: 0,
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

// Message totals use aggregate reads; card due dates and completed-session
// evidence are checked against the existing records without creating statistics.
export const useUserActivityMetrics = (
  uid?: string | null,
  options: UserActivityMetricsOptions = {},
): UserActivityMetrics => {
  const [refreshRevision, setRefreshRevision] = React.useState(0);
  const retry = React.useCallback(() => setRefreshRevision((current) => current + 1), []);
  const dayScope = React.useMemo(
    () => createDayScope(options.scopeDate),
    [options.scopeDate],
  );
  const [metrics, setMetrics] =
    React.useState<UserActivityMetrics>({ ...EMPTY_METRICS, loading: !!uid });
  const [metricsUid,setMetricsUid]=React.useState(uid);
  React.useEffect(() => {
    setMetrics({ ...EMPTY_METRICS, loading: !!uid });
    setMetricsUid(uid);
    if (!uid) return;
    let active = true,
      refreshing = false,
      refreshAgain = false,
      deckIds: string[] = [],
      roadmapDone = 0,
      plannerDone = 0;
    const update = (patch: Partial<UserActivityMetrics>) => {
      if (active) setMetrics((current) => ({ ...current, ...patch }));
    };
    const pending = new Set(["profile", "trusted", "planner", "decks", "statistics"]);
    const errors = new Map<string, unknown>();
    const publishStatus = () => update({ loading: pending.size > 0 && errors.size === 0,
      error: errors.size ? "Statistics temporarily unavailable. Check your connection and retry." : null });
    const settled = (source: string) => { pending.delete(source); errors.delete(source); publishStatus(); };
    const failure = (error: unknown, source = "statistics") => {
      if (!active) return;
      console.error("Activity metrics read failed", { source, scope: dayScope?.key || "all", error });
      reportClientError("metrics",error);
      pending.delete(source); errors.set(source, error); publishStatus();
    };
    const initialDeadline = window.setTimeout(() => {
      for (const source of pending) failure(new Error("Statistics listener timed out"), source);
    }, 15000);
    let decksReady = false;
    let lastRefreshAt = 0;
    // Legacy dates/statuses require record-level validation. Never silently
    // report totals from a truncated result or fan out unlimited deck reads.
    const readRecords = async (target: Query) => {
      const snapshot = await getDocsFromServer(query(target, limit(2001)));
      if (snapshot.docs.length > 2000) throw new Error("Statistics record safety limit exceeded; aggregation migration required");
      return snapshot;
    };
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
    const withIndexFallback = async <T>(
      read: () => Promise<T>,
      fallback: () => Promise<T>,
    ): Promise<T> => {
      try {
        return await read();
      } catch (error) {
        if ((error as { code?: string }).code !== "failed-precondition")
          throw error;
        return fallback();
      }
    };
    const countRole = (name: string) =>
      withIndexFallback(
        () => count(scoped(query(target(name), where("role", "==", "user")))),
        async () =>
          (await readRecords(scoped(target(name)))).docs.filter(
            (entry) => entry.data().role === "user",
          ).length,
      );
    const refresh = async (force = false) => {
      if (!active || document.hidden || !decksReady) return;
      if (refreshing) { refreshAgain = true; return; }
      if (!force && Date.now() - lastRefreshAt < 30000) return;
      if (!navigator.onLine) {
        update({
          loading: false,
          error: "You are offline. Statistics will refresh when connected.",
        });
        return;
      }
      refreshing = true;
      lastRefreshAt = Date.now();
      const requestDeadline = lastRefreshAt + 15000;
      try {
        if (serverMetricsEnabled) {
          const summary=await withDeadline(getCloudMetrics(dayScope?.start.getTime(),dayScope?.end.getTime()),15000);
          roadmapDone=summary.tasksDone;
          update({...summary,tasksDone:roadmapDone+plannerDone});
          settled("statistics");
          return;
        }
        if (deckIds.length > 100) throw new Error("Statistics deck safety limit exceeded; aggregation migration required");
        if (dayScope?.isFuture) {
          update({ ...EMPTY_METRICS });
          settled("statistics");
          return;
        }
        const sessions = scoped(target("studySessions"), "timestamp");
        const focusRecords = () => readRecords(sessions).then((snapshot) => snapshot.docs.reduce(
          (total, entry) => total + (entry.data().category === "focus" && isMeaningfulSession(entry.data()) ? toNumber(entry.data().duration) : 0), 0,
        ));
        const focusTotal = () => withIndexFallback(async () => {
          const verified = query(sessions, where("verified", "==", true));
          const [total, trusted] = await Promise.all([count(sessions), count(verified)]);
          if (total !== trusted) return focusRecords(); // Validate legacy status/date evidence.
          if (!total) return 0;
          return toNumber((await getAggregateFromServer(query(verified, where("category", "==", "focus")), {seconds: sum("duration")})).data().seconds);
        }, focusRecords);
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
        ] = await withDeadline(Promise.all([
          focusTotal(),
          count(scoped(target("notebookNotes"))),
          count(scoped(target("notebookSources"))),
          countRole("notebookMessages"),
          countRole("tutorMessages"),
          count(scoped(target("decks"))),
          withIndexFallback(
            () =>
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
            async () =>
              (
                await readRecords(
                  scoped(target("roadmapTasks"), "completedAt"),
                )
              ).docs.filter((entry) => isCompleted(entry.data())).length,
          ),
          (async () => {
            const results: {total: number; due: number; reviewed: number; created: number}[] = [];
            // At most five simultaneous card requests, even for large accounts.
            for (let offset = 0; offset < deckIds.length; offset += 5) {
              if (!active || Date.now() >= requestDeadline) throw new Error("Statistics request disposed or timed out");
              results.push(...await Promise.all(deckIds.slice(offset, offset + 5).map(async (id) => {
              const snapshot = await readRecords(collection(db, "users", uid, "decks", id, "cards"));
              const records = snapshot.docs.map((entry) => entry.data());
              return { ...summarizeCards(records), created: records.filter((record) => isWithinDayScope(pickRecordDate(record, ["createdAt"]), dayScope)).length };
              })));
            }
            return results;
          })(),
          dayScope
            ? withIndexFallback(
                async () =>
                  toNumber(
                    (
                      await getAggregateFromServer(sessions, {
                        xp: sum("xpEarned"),
                      })
                    ).data().xp,
                  ),
                async () =>
                  (await readRecords(sessions)).docs.reduce(
                    (total, entry) => total + toNumber(entry.data().xpEarned),
                    0,
                  ),
              )
            : Promise.resolve(null),
        ]), 15000);
        roadmapDone = roadmap;
        update({
          focusMinutes: Math.round(focus / 60),
          notesCreated: notes,
          sourcesUploaded: sources,
          notebookMessages: notebook,
          tutorMessages: tutor,
          decksCreated: decks,
          flashcardsCreated: cards.reduce((total, value) => total + value.created, 0),
          dueCards: cards.reduce((total, value) => total + value.due, 0),
          reviewedCards: cards.reduce((total, value) => total + value.reviewed, 0),
          tasksDone: roadmapDone + plannerDone,
          ...(dailyXp !== null ? { xp: dailyXp } : {}),

        });
        settled("statistics");
      } catch (error) {
        failure(error);
      } finally {
        refreshing = false;
        if (refreshAgain && active) { refreshAgain = false; void refresh(true); }
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
    const readinessNext = (snap: DocumentSnapshot | QuerySnapshot) => {
      if (snap.metadata.fromCache) return;
      if (serverMetricsEnabled && (!("exists" in snap) || !snap.exists() || snap.data()?.ready!==true)) {
        decksReady=false;
        failure(new Error("Statistics projection is being prepared"),"decks");
        return;
      }
      decksReady=true; settled("decks");
      deckIds="docs" in snap ? snap.docs.map(document=>document.id) : [];
      void refresh(true);
    };
    let primaryPlan:Record<string,any>|null=null,legacyPlan:Record<string,any>|null=null,primaryKnown=false,legacyKnown=false;
    const publishPlan=()=>{
      if(!primaryKnown || !primaryPlan&&!legacyKnown)return;
      const data=primaryPlan||legacyPlan,state=data?.state||data||{};
      plannerDone=countPlannerTasksDone(data,dayScope);
      update({tasksDone:roadmapDone+plannerDone,missionTotal:Array.isArray(state.tasks)?state.tasks.length:0,missionCompleted:countPlannerTasksDone(data,null)});
      settled('planner');
    };
    const stop = [
      onSnapshot(
        doc(db, "users", uid),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.metadata.fromCache) return;
          if (!trustedLoaded) profile(snap);
          settled("profile");
        },
        (error) => failure(error, "profile"),
      ),
      onSnapshot(
        doc(db, "users", uid, "trusted", "progress"),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.metadata.fromCache) return;
          trustedLoaded = snap.exists();
          profile(snap);
          settled("trusted");
        },
        (error) => failure(error, "trusted"),
      ),
      onSnapshot(
        doc(db, "users", uid, "planner", "smart-v2"),
        { includeMetadataChanges: true },
        snap=>{if(snap.metadata.fromCache)return;primaryKnown=true;primaryPlan=snap.exists()?snap.data():null;publishPlan();},
        error=>failure(error,'planner'),
      ),
      onSnapshot(
        doc(db, "users", uid, "planner", "state"),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.metadata.fromCache) return;
          legacyKnown=true;legacyPlan=snap.exists()?snap.data():null;publishPlan();
        },
        (error) => failure(error, "planner"),
      ),
      serverMetricsEnabled
        ? onSnapshot(doc(db,"users",uid,"trusted","metrics"),{includeMetadataChanges:true},readinessNext,error=>failure(error,"decks"))
        : onSnapshot(target("decks"),{includeMetadataChanges:true},readinessNext,error=>failure(error,"decks")),
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
      window.clearTimeout(initialDeadline);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [uid, dayScope, refreshRevision]);
  const examReadiness = React.useMemo(
    () => calculateExamReadiness(metrics),
    [metrics],
  );
  return uid ? metricsUid===uid ? { ...metrics, examReadiness, retry } : {...EMPTY_METRICS,loading:true,retry} : EMPTY_METRICS;
};
