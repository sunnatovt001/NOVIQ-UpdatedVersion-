import type { UserProfile } from "@/src/types";
import { loadLocalData } from "@/src/lib/localStore";

type StoredPlannerTask = {
  id?: string;
  label?: string;
  title?: string;
  section?: string;
  minutes?: number;
  scheduledWindow?: string;
};

type StoredPlannerState = {
  lastPlanKey?: string;
  form?: {
    mode?: string;
    goal?: string;
    currentScore?: string;
    targetScore?: string;
    examDate?: string;
    hoursPerDay?: string;
    daysPerWeek?: string;
    weakTopics?: string;
    schoolSubject?: string;
  };
  tasks?: StoredPlannerTask[];
  taskProgress?: Record<string, { status?: string }>;
  weaknesses?: Array<{ tag?: string; section?: string; severity?: number }>;
  daily?: {
    missionCompleted?: boolean;
    dailyStreak?: number;
    minutesStudied?: number;
  };
};

const EXAM_LABELS: Record<string, string> = {
  ielts: "IELTS",
  sat: "SAT",
  hsk: "HSK",
  cefr: "CEFR",
  entrance: "University entrance exam",
  school: "School exam",
};

const plannerStorageKey = (uid?: string | null) => `noviq:${uid || "guest"}:aiPlanner:v2`;

const compact = (value?: string | number | null) => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const daysUntil = (date?: string) => {
  if (!date) return undefined;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000));
};

const getTaskStatus = (task: StoredPlannerTask, state: StoredPlannerState) => {
  if (!task.id) return "planned";
  return state.taskProgress?.[task.id]?.status || "planned";
};

export const buildStudentTutorContext = (profile: UserProfile | null | undefined, uid?: string | null) => {
  const state = loadLocalData<StoredPlannerState | null>(plannerStorageKey(uid), null);
  const lines: string[] = ["Student context for Noviq Tutor:"];

  if (profile?.displayName) lines.push(`Student name: ${profile.displayName}.`);
  const selectedGoal = compact(profile?.onboarding?.goal) || compact(profile?.onboardingAnswers?.mainGoal);
  if (selectedGoal) lines.push(`Selected learning goal: ${selectedGoal}.`);
  else if (profile?.goals?.length) lines.push(`Selected learning goals: ${profile.goals.join(", ")}.`);
  if (profile?.currentLevel) lines.push(`Current level: ${profile.currentLevel}.`);
  if (profile?.dailyTargetMinutes) lines.push(`Daily study target: ${profile.dailyTargetMinutes} minutes.`);
  if (profile?.streak) lines.push(`Current streak: ${profile.streak} day${profile.streak === 1 ? "" : "s"}.`);
  const struggle = profile?.onboarding?.challenge || profile?.onboardingAnswers?.struggle;
  if (struggle) lines.push(`Known struggle: ${struggle}.`);

  // Visiting Planner persists a default IELTS form before a student creates a
  // mission. Those defaults are not evidence of the student's selected exam.
  const hasPlan = Boolean(state?.lastPlanKey || state?.tasks?.length);
  const form = hasPlan ? state?.form : undefined;
  if (form) {
    const examType = EXAM_LABELS[form.mode || ""] || compact(form.mode);
    const remaining = daysUntil(form.examDate);
    const planParts = [
      examType ? `exam type ${examType}` : undefined,
      compact(form.goal) ? `goal ${form.goal}` : undefined,
      compact(form.currentScore) ? `current score ${form.currentScore}` : undefined,
      compact(form.targetScore) ? `target score ${form.targetScore}` : undefined,
      remaining !== undefined ? `${remaining} days remaining` : undefined,
      compact(form.schoolSubject) ? `subject ${form.schoolSubject}` : undefined,
      compact(form.hoursPerDay) ? `${form.hoursPerDay} hours/day` : undefined,
      compact(form.daysPerWeek) ? `${form.daysPerWeek} days/week` : undefined,
    ].filter(Boolean);

    if (planParts.length) lines.push(`Active study plan: ${planParts.join("; ")}.`);
    if (compact(form.weakTopics)) lines.push(`Declared weak areas: ${form.weakTopics}.`);
  }

  const openTasks = (state?.tasks || [])
    .filter((task) => getTaskStatus(task, state || {}) !== "completed")
    .slice(0, 3)
    .map((task) => {
      const title = task.label || task.title || task.section || "Study task";
      const meta = [task.section, task.minutes ? `${task.minutes} min` : undefined, task.scheduledWindow].filter(Boolean);
      return meta.length ? `${title} (${meta.join(", ")})` : title;
    });
  if (openTasks.length) lines.push(`Current mission tasks: ${openTasks.join(" | ")}.`);

  const recentMistakes = (state?.weaknesses || [])
    .slice(-8)
    .map((weakness) => weakness.tag || weakness.section)
    .filter(Boolean);
  if (recentMistakes.length) lines.push(`Recent mistakes or weak patterns: ${recentMistakes.join(", ")}.`);

  if (state?.daily) {
    const dailyParts = [
      state.daily.missionCompleted !== undefined ? `mission completed today: ${state.daily.missionCompleted ? "yes" : "no"}` : undefined,
      state.daily.minutesStudied !== undefined ? `minutes studied today: ${state.daily.minutesStudied}` : undefined,
      state.daily.dailyStreak !== undefined ? `planner streak: ${state.daily.dailyStreak}` : undefined,
    ].filter(Boolean);
    if (dailyParts.length) lines.push(`Daily progress: ${dailyParts.join("; ")}.`);
  }

  return lines.length > 1 ? lines.join("\n") : "";
};
