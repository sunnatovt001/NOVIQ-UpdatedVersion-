import type { UserProfile } from "@/src/types";
import type { StudySessionPayload, XpAward } from "./progress";

export const NOVIQ_XP = {
  daily: {
    login: 5,
    dailyGoal: 20,
    streak7: 50,
    streak30: 300,
  },
  learning: {
    lessonComplete: 15,
    testSubmit: 20,
    score80Bonus: 10,
    score90Bonus: 20,
  },
  memory: {
    revision: 15,
    relearnForgottenTopic: 25,
  },
  productivity: {
    planFollowedDay: 20,
    allDailyTasksComplete: 30,
    dailyMissionComplete: 500,
  },
  bonus: {
    firstTextbookUpload: 30,
    inviteFriend: 100,
    monthlyGoalsComplete: 500,
  },
} as const;

export const XP_KEYS = {
  dailyLogin: (dayKey: string) => `daily-login:${dayKey}`,
  dailyGoal: (dayKey: string) => `daily-goal:${dayKey}`,
  streak7: (dayKey: string) => `streak-7:${dayKey}`,
  streak30: (dayKey: string) => `streak-30:${dayKey}`,
  planFollowedDay: (dayKey: string) => `plan-followed:${dayKey}`,
  allDailyTasksComplete: (dayKey: string) => `all-daily-tasks:${dayKey}`,
  dailyMissionComplete: (dayKey: string) => `daily-mission-complete:${dayKey}`,
  firstTextbookUpload: "bonus:first-textbook-upload",
  inviteFriend: (inviteId: string) => `bonus:invite-friend:${inviteId}`,
  monthlyGoalsComplete: (monthKey: string) => `bonus:monthly-goals:${monthKey}`,
} as const;

export const LEVELS = [
  { level: 1, minXp: 0, name: "Novice Student" },
  { level: 2, minXp: 100, name: "Active Student" },
  { level: 3, minXp: 250, name: "Knowledge Builder" },
  { level: 4, minXp: 500, name: "Scholar" },
  { level: 5, minXp: 1000, name: "Master Scholar" },
  { level: 10, minXp: 5000, name: "Academic Legend" },
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const studySessionsKey = (userId: string) =>
  `noviq:${userId}:studySessions`;

const toDate = (
  value?: string | Date | { toDate?: () => Date; seconds?: number } | null,
) => {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.toDate === "function") {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.seconds === "number") {
    const parsed = new Date(value.seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const getLocalDayKey = (value: Date | string = new Date()) => {
  const date = toDate(value) || new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const dayDistance = (from: Date, to: Date) =>
  Math.round(
    (Date.parse(getLocalDayKey(to)) - Date.parse(getLocalDayKey(from))) /
      MS_PER_DAY,
  );

export const calculateSessionXp = (
  category: StudySessionPayload["category"] = "focus",
  durationSeconds = 0,
) => {
  if (category === "revision") return NOVIQ_XP.memory.revision;
  if (category === "quiz") return NOVIQ_XP.learning.testSubmit;
  return durationSeconds > 0
    ? Math.min(20, Math.max(1, Math.round(durationSeconds / 60)))
    : 0;
};

export const calculateLevelInfo = (xp: number) => {
  const safeXp = Math.max(0, xp);
  return LEVELS.reduce<(typeof LEVELS)[number]>(
    (current, level) => (safeXp >= level.minXp ? level : current),
    LEVELS[0],
  );
};

export const calculateLevel = (xp: number) => calculateLevelInfo(xp).level;

export const calculateLevelName = (xp: number) => calculateLevelInfo(xp).name;

export const createInitialXpState = (activeAt = new Date()) => {
  void activeAt;
  const xp = 0;
  return {
    xp,
    level: calculateLevel(xp),
    levelName: calculateLevelName(xp),
    xpAwarded: {},
  };
};

export const buildXpAwardPatch = (
  profile: Pick<UserProfile, "xp" | "xpAwarded"> | null | undefined,
  awards: XpAward[],
  rawXp = 0,
) => {
  const currentXp = Math.max(0, profile?.xp || 0);
  const currentAwarded = { ...(profile?.xpAwarded || {}) };
  const earnedAwards = awards.filter(
    (award) => award.xp > 0 && !currentAwarded[award.key],
  );

  earnedAwards.forEach((award) => {
    currentAwarded[award.key] = true;
  });

  const nextXp =
    currentXp +
    Math.max(0, rawXp) +
    earnedAwards.reduce((total, award) => total + award.xp, 0);

  return {
    xp: nextXp,
    level: calculateLevel(nextXp),
    levelName: calculateLevelName(nextXp),
    xpAwarded: currentAwarded,
  };
};

export const getNextStreak = (
  currentStreak = 0,
  lastActive?: UserProfile["lastActive"] | null,
  activeAt: Date = new Date(),
) => {
  const lastActiveDate = toDate(lastActive);

  if (!lastActiveDate || currentStreak <= 0) {
    return 1;
  }

  const distance = dayDistance(lastActiveDate, activeAt);

  if (distance <= 0) {
    return currentStreak;
  }

  return distance === 1 ? currentStreak + 1 : 1;
};

export const getCurrentStreak = (
  currentStreak = 0,
  lastActive?:
    | UserProfile["lastActive"]
    | Date
    | { toDate?: () => Date; seconds?: number }
    | null,
  activeAt: Date = new Date(),
) => {
  const lastActiveDate = toDate(lastActive);

  if (!lastActiveDate || currentStreak <= 0) {
    return 0;
  }

  return dayDistance(lastActiveDate, activeAt) > 1 ? 0 : currentStreak;
};

export const buildDailyActivityPatch = (
  profile: Pick<
    UserProfile,
    "xp" | "level" | "levelName" | "streak" | "lastActive" | "xpAwarded"
  >,
  activeAt = new Date(),
) => {
  const lastActiveDate = toDate(profile.lastActive);
  const hasAlreadyCheckedInToday =
    lastActiveDate && dayDistance(lastActiveDate, activeAt) <= 0;
  const dayKey = getLocalDayKey(activeAt);

  if (hasAlreadyCheckedInToday && (profile.streak || 0) > 0) {
    const loginAwardKey = XP_KEYS.dailyLogin(dayKey);
    return profile.xpAwarded?.[loginAwardKey]
      ? null
      : buildXpAwardPatch(profile, [
          { key: loginAwardKey, xp: NOVIQ_XP.daily.login },
        ]);
  }

  const nextStreak = getNextStreak(
    profile.streak || 0,
    profile.lastActive,
    activeAt,
  );
  const awards: XpAward[] = [
    { key: XP_KEYS.dailyLogin(dayKey), xp: NOVIQ_XP.daily.login },
  ];

  if (nextStreak === 7) {
    awards.push({ key: XP_KEYS.streak7(dayKey), xp: NOVIQ_XP.daily.streak7 });
  }

  if (nextStreak === 30) {
    awards.push({ key: XP_KEYS.streak30(dayKey), xp: NOVIQ_XP.daily.streak30 });
  }

  return {
    ...buildXpAwardPatch(profile, awards),
    streak: nextStreak,
    lastActive: activeAt.toISOString(),
  };
};

export const buildSessionProgressPatch = (
  profile:
    | Pick<
        UserProfile,
        | "xp"
        | "level"
        | "levelName"
        | "streak"
        | "lastActive"
        | "totalStudySeconds"
        | "xpAwarded"
      >
    | null
    | undefined,
  session: Pick<StudySessionPayload, "duration" | "xpEarned" | "timestamp">,
  awards: XpAward[] = [],
) => {
  const completedAt = toDate(session.timestamp) || new Date();

  return {
    ...buildXpAwardPatch(profile, awards, session.xpEarned),
    streak: getNextStreak(
      profile?.streak || 0,
      profile?.lastActive,
      completedAt,
    ),
    lastActive: completedAt.toISOString(),
    lastStudySessionAt: completedAt.toISOString(),
    totalStudySeconds:
      Math.max(0, profile?.totalStudySeconds || 0) +
      Math.max(0, session.duration || 0),
  };
};
