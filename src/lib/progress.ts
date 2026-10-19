import { isLocalId, loadLocalData, saveLocalData } from "@/src/lib/localStore";
import { writeDocWithQueue, type SyncStatus } from "@/src/lib/offlineSync";
import type { StudySession, UserProfile } from "@/src/types";
import { httpsCallable } from "@/src/lib/callable";
import { functions } from "@/src/lib/firebase";
import { isReadOnlyAudit } from "./auditMode";
import { NOVIQ_XP, studySessionsKey, buildDailyActivityPatch, buildXpAwardPatch, getLocalDayKey } from "./progressMath";
export * from "./progressMath";

export const startStudySession = async (
  category: StudySessionPayload["category"],
  context = "focus",
  restart = false,
  onNewSession?: () => void,
) => {
  if (isReadOnlyAudit) throw new Error("Starting sessions is disabled in read-only audit mode.");
  const start = httpsCallable<
    { category: string; context: string; restart: boolean },
    { sessionId: string; resumed?: boolean }
  >(functions, "startStudySession");
  const response = (await start({ category, context, restart })).data;
  if (response.resumed === false) onNewSession?.();
  return response.sessionId;
};

export type StudySessionPayload = Omit<StudySession, "id">;
export type StoredStudySession = StudySessionPayload & {
  id: string;
  syncStatus?: SyncStatus;
};

export type XpAward = {
  key: string;
  xp: number;
};


const sessionSignature = (
  session: Pick<
    StoredStudySession,
    "timestamp" | "duration" | "subject" | "category" | "xpEarned"
  >,
) =>
  [
    session.timestamp,
    session.duration,
    session.subject,
    session.category,
    session.xpEarned,
  ].join("|");

const safeIdPart = (value: string | number | undefined) =>
  String(value || "study")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

const debugFocusSessionWrite = (path: string[], data: StudySessionPayload) => {
  const sessionType = String(data.category || "").toLowerCase();
  if (
    import.meta.env.DEV &&
    (sessionType === "focus" || sessionType === "deep_work")
  ) {
    console.debug("[metrics-write] focus session path:", path.join("/"), data);
  }
};

export const makeStudySessionId = (session: StudySessionPayload) =>
  [
    "study-session",
    safeIdPart(session.timestamp),
    safeIdPart(session.category),
    safeIdPart(session.subject),
    Math.max(0, Math.round(session.duration || 0)),
  ].join("-");

export const mergeStudySessions = <T extends StoredStudySession>(
  sessions: T[],
  maxItems = 100,
) => {
  const bySignature = new Map<string, T>();

  sessions
    .slice()
    .sort((a, b) => Number(isLocalId(a.id)) - Number(isLocalId(b.id)))
    .forEach((session) => {
      const signature = sessionSignature(session);
      if (
        !bySignature.has(signature) ||
        isLocalId(bySignature.get(signature)!.id)
      ) {
        bySignature.set(signature, session);
      }
    });

  return Array.from(bySignature.values())
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, maxItems);
};

export const saveLocalStudySession = (session: StudySessionPayload) => {
  const localSession: StoredStudySession = {
    ...session,
    id: makeStudySessionId(session),
    syncStatus: "pending",
  };

  const key = studySessionsKey(session.userId);
  const currentSessions = loadLocalData<StoredStudySession[]>(key, []);
  const nextSessions = mergeStudySessions([localSession, ...currentSessions]);
  saveLocalData(key, nextSessions);

  return localSession;
};

export const persistDailyActivity = async (
  userId: string,
  fallbackProfile: UserProfile,
) => {
  const patch = buildDailyActivityPatch(fallbackProfile);
  if (!patch) return;

  const dayKey = getLocalDayKey(
    "lastActive" in patch ? patch.lastActive : new Date(),
  );
  await writeDocWithQueue({
    userId,
    path: ["users", userId, "progressEvents", `daily-${dayKey}`],
    data: {
      type: "daily_activity",
      dayKey,
      awards: patch.xpAwarded || {},
      proposedProgressPatch: patch,
      createdAt: new Date().toISOString(),
    },
    merge: true,
  });
};

export const persistXpAwards = async (
  userId: string,
  awards: XpAward[],
  fallbackProfile?: UserProfile | null,
  rawXp = 0,
) => {
  const patch = buildXpAwardPatch(fallbackProfile, awards, rawXp);
  const awardKey =
    awards.map((award) => award.key).join("-") || `raw-${Date.now()}`;
  await writeDocWithQueue({
    userId,
    path: ["users", userId, "progressEvents", `xp-${safeIdPart(awardKey)}`],
    data: {
      type: "xp_award",
      awards,
      rawXp,
      ...(rawXp === NOVIQ_XP.memory.revision && awards.length === 0
        ? { activity: "flashcard_review" }
        : {}),
      proposedProgressPatch: patch,
      createdAt: new Date().toISOString(),
    },
    merge: true,
  });
};

export const persistStudySession = async (
  session: StudySessionPayload,
  fallbackProfile?: UserProfile | null,
  awards: XpAward[] = [],
  verifiedSessionId?: string,
) => {
  void fallbackProfile;
  void awards;
  if (isReadOnlyAudit) throw new Error("Session completion is disabled in read-only audit mode.");
  if (!verifiedSessionId)
    throw new Error("Start an online study session before recording progress.");
  const complete = httpsCallable<
    { sessionId: string; duration: number; subject: string },
    { sessionId: string }
  >(functions, "completeStudySession");
  return (
    await complete({
      sessionId: verifiedSessionId,
      duration: session.duration,
      subject: session.subject,
    })
  ).data.sessionId;
};
