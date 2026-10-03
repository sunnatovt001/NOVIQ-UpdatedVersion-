import {
  loadLocalData,
  trySaveLocalData as saveLocalData,
} from "@/src/lib/localStore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Headphones,
  Loader2,
  Lock,
  Mic2,
  PenLine,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  Target,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/src/contexts/AuthContext";
import { askTutor } from "@/src/lib/gemini";
import { db } from "@/src/lib/firebase";
import { trackUserEvent } from "@/src/lib/analytics";
import {
  getLocalDayKey,
  persistStudySession,
  startStudySession,
} from "@/src/lib/progress";
import { cn } from "@/src/lib/utils";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { writeDocWithQueue } from "@/src/lib/offlineSync";

type ExamMode = "ielts" | "sat" | "hsk" | "cefr" | "school" | "entrance";
type EnergyProfile = "morning" | "balanced" | "night";
type PlannerView = "today" | "roadmap" | "activity";
type TaskKind = "quiz" | "writing" | "speaking" | "flashcards" | "timed";

type PlannerForm = {
  mode: ExamMode;
  goal: string;
  currentScore: string;
  targetScore: string;
  examDate: string;
  hoursPerDay: string;
  daysPerWeek: string;
  energyProfile: EnergyProfile;
  schoolSubject: string;
  weakTopics: string;
  sectionScores: Record<string, string>;
};

type FocusSection = {
  name: string;
  current: number;
  target: number;
  gap: number;
  weight: number;
};

type MissionTask = {
  id: string;
  label: string;
  minutes: number;
  xp: number;
  section: string;
  kind: TaskKind;
  difficulty: "foundation" | "improving" | "advanced";
  focusReason: string;
  scheduledWindow: string;
};

type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  weaknessTag: string;
};

type FlashcardItem = {
  id: string;
  front: string;
  back: string;
  weaknessTag: string;
};

type GeneratedActivity = {
  taskId: string;
  type: TaskKind;
  title: string;
  instructions: string;
  difficulty: MissionTask["difficulty"];
  generatedAt: string;
  successCriteria: string[];
  questions?: QuizQuestion[];
  writingPrompt?: string;
  speakingPrompt?: string;
  flashcards?: FlashcardItem[];
  minWords?: number;
};

type TaskProgress = {
  status: "notStarted" | "inProgress" | "completed";
  elapsedSeconds: number;
  quizAnswers: Record<string, number>;
  reviewedCards: string[];
  writingText: string;
  speakingNotes: string;
  submitted: boolean;
  score?: number;
  mistakes: string[];
  completedAt?: string;
  xpAwarded?: number;
};

type WeaknessEvent = {
  id: string;
  tag: string;
  section: string;
  source: string;
  createdAt: string;
  severity: number;
};

type CompletedTaskRecord = {
  id: string;
  dateKey: string;
  taskId: string;
  section: string;
  kind: TaskKind;
  minutes: number;
  xp: number;
  score?: number;
  mistakes: string[];
  completedAt: string;
};

type PlannerAchievement = {
  id: string;
  title: string;
  description: string;
  unlockedAt: string;
};

type DailyReflection = {
  tasksCompleted: number;
  minutesStudied: number;
  xpEarned: number;
  strongestArea: string;
  needsImprovement: string;
  recommendation: string;
};

type PlannerDailyStats = {
  dateKey: string;
  xpEarned: number;
  minutesStudied: number;
  missionCompleted: boolean;
  dailyStreak: number;
  missedDays: number;
  reflection?: DailyReflection;
};

type RecoveryMode = {
  active: boolean;
  missedDays: number;
  message: string;
  adjustedAt: string;
};

type PlannerState = {
  form: PlannerForm;
  missionDate: string;
  tasks: MissionTask[];
  taskProgress: Record<string, TaskProgress>;
  activities: Record<string, GeneratedActivity>;
  weaknesses: WeaknessEvent[];
  history: CompletedTaskRecord[];
  achievements: PlannerAchievement[];
  daily: PlannerDailyStats;
  recoveryMode?: RecoveryMode;
  localXp: number;
  lastOpenedDate: string;
  lastPlanKey: string;
};

type Celebration = {
  type: "task" | "mission";
  title: string;
  subtitle: string;
  xp: number;
  bonusXp?: number;
};

const todayDate = new Date();
const defaultExamDate = new Date(todayDate.getFullYear(), 11, 15)
  .toISOString()
  .slice(0, 10);

const EXAM_OPTIONS: Record<
  ExamMode,
  {
    label: string;
    min: number;
    max: number;
    step: number;
    defaultGoal: string;
    current: string;
    target: string;
    sections: Array<{ name: string; current: string; target?: string }>;
  }
> = {
  ielts: {
    label: "IELTS",
    min: 0,
    max: 9,
    step: 0.5,
    defaultGoal: "IELTS 7.5",
    current: "5.5",
    target: "7.5",
    sections: [
      { name: "Listening", current: "5.0" },
      { name: "Reading", current: "6.5" },
      { name: "Writing Task 1", current: "5.5" },
      { name: "Writing Task 2", current: "5.5" },
      { name: "Speaking", current: "5.0" },
      { name: "Vocabulary", current: "5.5" },
      { name: "Grammar", current: "5.0" },
    ],
  },
  sat: {
    label: "SAT",
    min: 400,
    max: 1600,
    step: 10,
    defaultGoal: "SAT 1350",
    current: "1050",
    target: "1350",
    sections: [
      { name: "Algebra", current: "520", target: "680" },
      { name: "Functions", current: "510", target: "670" },
      { name: "Geometry", current: "500", target: "660" },
      { name: "Data Analysis", current: "515", target: "670" },
      { name: "Reading Comprehension", current: "530", target: "670" },
      { name: "Vocabulary in Context", current: "520", target: "660" },
      { name: "Grammar", current: "525", target: "665" },
      { name: "Editing", current: "515", target: "660" },
    ],
  },
  hsk: {
    label: "HSK",
    min: 0,
    max: 300,
    step: 1,
    defaultGoal: "HSK 4 score 240",
    current: "165",
    target: "240",
    sections: [
      { name: "Vocabulary", current: "160" },
      { name: "Character Recognition", current: "150" },
      { name: "Reading", current: "170" },
      { name: "Listening", current: "155" },
      { name: "Grammar", current: "165" },
      { name: "Writing Characters", current: "140" },
      { name: "Speaking Practice", current: "150" },
    ],
  },
  cefr: {
    label: "CEFR",
    min: 0,
    max: 100,
    step: 1,
    defaultGoal: "CEFR B2 readiness 80%",
    current: "55",
    target: "80",
    sections: [
      { name: "Reading", current: "58" },
      { name: "Listening", current: "52" },
      { name: "Speaking", current: "50" },
      { name: "Writing", current: "54" },
      { name: "Vocabulary", current: "56" },
      { name: "Grammar", current: "53" },
    ],
  },
  school: {
    label: "School Subjects",
    min: 0,
    max: 100,
    step: 1,
    defaultGoal: "Math final exam 90%",
    current: "62",
    target: "90",
    sections: [
      { name: "Theory", current: "65" },
      { name: "Problem solving", current: "55" },
      { name: "Past papers", current: "50" },
      { name: "Weak topics", current: "45" },
    ],
  },
  entrance: {
    label: "University Entrance",
    min: 0,
    max: 100,
    step: 1,
    defaultGoal: "University entrance exam 85%",
    current: "58",
    target: "85",
    sections: [
      { name: "Subject Review", current: "62" },
      { name: "Problem Solving", current: "55" },
      { name: "Reading Analysis", current: "58" },
      { name: "Timed Mock", current: "52" },
      { name: "Past Papers", current: "50" },
      { name: "Weak Topic Recovery", current: "45" },
    ],
  },
};

const lightInput =
  "w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-semibold text-[#0F172A] outline-none transition focus:border-[#3F7D58] focus:ring-4 focus:ring-[#ECFDF3]";

const parseNumber = (value: string | number | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const words = (value: string) => value.trim().split(/\s+/).filter(Boolean);

const getWeakTopicList = (value: string) =>
  value
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);

const hasRequiredWeakTopics = (value: string) =>
  getWeakTopicList(value).length > 0;

const initialSectionScores = (mode: ExamMode) =>
  Object.fromEntries(
    EXAM_OPTIONS[mode].sections.map((section) => [
      section.name,
      section.current,
    ]),
  );

const buildDefaultForm = (): PlannerForm => ({
  mode: "ielts",
  goal: "IELTS 7.5",
  currentScore: "5.5",
  targetScore: "7.5",
  examDate: defaultExamDate,
  hoursPerDay: "3",
  daysPerWeek: "6",
  energyProfile: "morning",
  schoolSubject: "Mathematics",
  weakTopics: "",
  sectionScores: initialSectionScores("ielts"),
});

const daysUntil = (date: string) => {
  const target = new Date(`${date}T12:00:00`);
  if (Number.isNaN(target.getTime())) return 30;
  return Math.max(1, Math.ceil((target.getTime() - Date.now()) / 86400000));
};

const dayDistance = (fromKey: string, toKey: string) => {
  const from = new Date(`${fromKey}T12:00:00`);
  const to = new Date(`${toKey}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
};

const normalizeWeights = (
  sections: Omit<FocusSection, "weight">[],
  mode: ExamMode,
  weaknesses: WeaknessEvent[] = [],
  manualWeakTopics: string[] = [],
) => {
  const weighted = sections.map((section) => {
    const sectionName = section.name.toLowerCase();
    const manualWeaknessBoost = manualWeakTopics.some((topic) => {
      const normalizedTopic = topic.toLowerCase();
      return (
        sectionName.includes(normalizedTopic) ||
        normalizedTopic.includes(sectionName)
      );
    })
      ? 1.4
      : 0;
    const weaknessBoost = weaknesses
      .filter(
        (event) =>
          event.section === section.name ||
          event.tag.toLowerCase().includes(section.name.toLowerCase()),
      )
      .reduce((total, event) => total + event.severity * 0.16, 0);
    let priority =
      Math.pow(Math.max(section.gap, 0.1), 1.15) +
      weaknessBoost +
      manualWeaknessBoost;
    if (mode === "ielts" && section.name === "Listening") priority *= 1.1;
    if (mode === "ielts" && section.name === "Speaking") priority *= 1.06;
    if (mode === "hsk" && section.name === "Character Recognition")
      priority *= 1.08;
    if (mode === "hsk" && section.name === "Writing Characters")
      priority *= 1.06;
    if (mode === "cefr" && ["Speaking", "Writing"].includes(section.name))
      priority *= 1.06;
    if (mode === "school" && section.name === "Weak topics")
      priority *= manualWeakTopics.length ? 1.45 : 1.2;
    if (mode === "entrance" && section.name === "Weak Topic Recovery")
      priority *= manualWeakTopics.length ? 1.45 : 1.2;
    return { ...section, priority };
  });
  const total =
    weighted.reduce((sum, section) => sum + section.priority, 0) || 1;
  return weighted.map((section) => ({
    ...section,
    weight: Math.round((section.priority / total) * 100),
  }));
};

const buildSections = (
  form: PlannerForm,
  weaknesses: WeaknessEvent[] = [],
): FocusSection[] => {
  const modeConfig = EXAM_OPTIONS[form.mode];
  const targetScore = parseNumber(
    form.targetScore,
    parseNumber(modeConfig.target),
  );
  const sections = modeConfig.sections.map((section) => {
    const current = parseNumber(
      form.sectionScores[section.name],
      parseNumber(section.current),
    );
    const target =
      section.target !== undefined
        ? parseNumber(section.target)
        : form.mode === "sat"
          ? Math.round(targetScore / 2)
          : targetScore;
    return {
      name: section.name,
      current,
      target,
      gap: Math.max(0, target - current),
    };
  });
  return normalizeWeights(
    sections,
    form.mode,
    weaknesses,
    getWeakTopicList(form.weakTopics),
  );
};

const getDifficulty = (form: PlannerForm): MissionTask["difficulty"] => {
  const current = parseNumber(
    form.currentScore,
    parseNumber(EXAM_OPTIONS[form.mode].current),
  );
  if (form.mode === "ielts") {
    if (current < 6) return "foundation";
    if (current < 7) return "improving";
    return "advanced";
  }
  if (form.mode === "sat") {
    if (current < 1100) return "foundation";
    if (current < 1350) return "improving";
    return "advanced";
  }
  if (form.mode === "hsk") {
    if (current < 180) return "foundation";
    if (current < 240) return "improving";
    return "advanced";
  }
  if (form.mode === "cefr") {
    if (current < 50) return "foundation";
    if (current < 75) return "improving";
    return "advanced";
  }
  if (current < 65) return "foundation";
  if (current < 85) return "improving";
  return "advanced";
};

const getTaskKind = (mode: ExamMode, section: string): TaskKind => {
  if (mode === "ielts") {
    if (section === "Writing Task 1" || section === "Writing Task 2")
      return "writing";
    if (section === "Speaking") return "speaking";
    if (section === "Vocabulary") return "flashcards";
    return "quiz";
  }
  if (mode === "sat") {
    if (section === "Vocabulary in Context") return "flashcards";
    return "quiz";
  }
  if (mode === "hsk") {
    if (section === "Vocabulary" || section === "Character Recognition")
      return "flashcards";
    if (section === "Writing Characters") return "writing";
    if (section === "Speaking Practice") return "speaking";
    return "quiz";
  }
  if (mode === "cefr") {
    if (section === "Writing") return "writing";
    if (section === "Speaking") return "speaking";
    if (section === "Vocabulary") return "flashcards";
    return "quiz";
  }
  if (mode === "entrance") {
    if (section === "Subject Review" || section === "Weak Topic Recovery")
      return "flashcards";
    return "quiz";
  }
  if (section === "Theory" || section === "Weak topics") return "flashcards";
  return "quiz";
};

const getTaskLabel = (
  form: PlannerForm,
  section: string,
  difficulty: MissionTask["difficulty"],
  index: number,
) => {
  const weakTopic = getWeakTopicList(form.weakTopics)[0] || "weak topic";
  const levelPrefix =
    difficulty === "advanced"
      ? "Advanced"
      : difficulty === "improving"
        ? "Targeted"
        : "Core";

  if (form.mode === "ielts") {
    if (section === "Listening") return `${levelPrefix} Listening Practice`;
    if (section === "Reading") return `${levelPrefix} Reading Passage`;
    if (section === "Writing Task 1")
      return difficulty === "foundation"
        ? "Task 1 Structure Drill"
        : "IELTS Writing Task 1";
    if (section === "Writing Task 2")
      return difficulty === "foundation"
        ? "Task 2 Paragraph Drill"
        : "IELTS Writing Task 2";
    if (section === "Speaking")
      return index === 1 ? "Speaking Part 3 Drill" : "Cue Card Speaking";
    if (section === "Vocabulary") return "IELTS Vocabulary Recall";
    return "IELTS Grammar Accuracy Drill";
  }

  if (form.mode === "sat") {
    if (["Algebra", "Functions", "Geometry", "Data Analysis"].includes(section))
      return `${levelPrefix} SAT ${section}`;
    if (section === "Reading Comprehension") return "SAT Reading Comprehension";
    if (section === "Vocabulary in Context")
      return "Vocabulary in Context Cards";
    if (section === "Grammar") return "SAT Grammar Drill";
    return "SAT Editing Practice";
  }

  if (form.mode === "hsk") {
    if (section === "Vocabulary") return "HSK Vocabulary Recall";
    if (section === "Character Recognition")
      return "Character Recognition Cards";
    if (section === "Reading") return `${levelPrefix} HSK Reading`;
    if (section === "Listening") return `${levelPrefix} HSK Listening`;
    if (section === "Grammar") return "HSK Grammar Drill";
    if (section === "Writing Characters") return "Character Writing Practice";
    return "HSK Speaking Practice";
  }

  if (form.mode === "cefr") {
    if (section === "Reading") return `${levelPrefix} CEFR Reading`;
    if (section === "Listening") return `${levelPrefix} CEFR Listening`;
    if (section === "Speaking") return "CEFR Speaking Practice";
    if (section === "Writing") return "CEFR Writing Task";
    if (section === "Vocabulary") return "CEFR Vocabulary Recall";
    return "CEFR Grammar Drill";
  }

  if (form.mode === "entrance") {
    if (section === "Weak Topic Recovery")
      return `${weakTopic} Entrance Recovery`;
    if (section === "Problem Solving")
      return `${form.schoolSubject} Problem Solving`;
    if (section === "Reading Analysis") return "Entrance Reading Analysis";
    if (section === "Timed Mock") return "Timed Entrance Mock";
    if (section === "Past Papers")
      return `${form.schoolSubject} Past Paper Block`;
    return `${form.schoolSubject} Subject Review`;
  }

  if (section === "Weak topics") return `${weakTopic} Recovery`;
  if (section === "Problem solving") return `${form.schoolSubject} Problem Set`;
  if (section === "Past papers")
    return `${form.schoolSubject} Past Paper Block`;
  return `${form.schoolSubject} Theory Review`;
};

const getScheduledWindow = (
  energyProfile: EnergyProfile,
  _index: number,
  minutes: number,
  offsetMinutes = 0,
) => {
  const startBase =
    energyProfile === "morning"
      ? 8 * 60
      : energyProfile === "night"
        ? 19 * 60 + 30
        : 16 * 60;
  const start = startBase + offsetMinutes;
  const end = start + minutes;
  const format = (total: number) =>
    `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return `${format(start)}-${format(end)}`;
};

const isListeningSection = (section: string) =>
  section.toLowerCase().includes("listening");
const isSpeakingSection = (section: string) =>
  section.toLowerCase().includes("speaking");

const getMissionBudget = (form: PlannerForm, recoveryMode?: RecoveryMode) => {
  const availableMinutes = Math.round(parseNumber(form.hoursPerDay, 1) * 60);
  const base =
    availableMinutes <= 30
      ? 22
      : availableMinutes <= 60
        ? 34
        : availableMinutes <= 90
          ? 46
          : availableMinutes <= 150
            ? 56
            : 65;
  const adjusted = recoveryMode?.active ? Math.round(base * 0.82) : base;
  return clamp(Math.round(adjusted / 5) * 5, 20, 70);
};

const getMissionTaskCount = (form: PlannerForm, budget: number) => {
  const availableMinutes = Math.round(parseNumber(form.hoursPerDay, 1) * 60);
  if (budget <= 25 || availableMinutes <= 30) return 3;
  if (budget <= 40 || availableMinutes <= 60) return 4;
  if (budget <= 55 || availableMinutes <= 120) return 5;
  return 6;
};

const getRecommendedTaskMinutes = (
  form: PlannerForm,
  section: string,
  kind: TaskKind,
  difficulty: MissionTask["difficulty"],
) => {
  if (isListeningSection(section)) return difficulty === "foundation" ? 7 : 10;
  if (isSpeakingSection(section))
    return difficulty === "foundation" ? 5 : difficulty === "improving" ? 7 : 8;

  if (kind === "speaking") return 7;
  if (kind === "writing") {
    if (form.mode === "ielts" && section === "Writing Task 2")
      return difficulty === "advanced" ? 15 : 12;
    return difficulty === "advanced" ? 12 : 10;
  }
  if (kind === "flashcards") return difficulty === "foundation" ? 8 : 10;

  if (form.mode === "sat") return difficulty === "advanced" ? 14 : 12;
  if (
    form.mode === "entrance" &&
    ["Timed Mock", "Past Papers"].includes(section)
  )
    return 15;
  if (form.mode === "school" && section === "Past papers") return 14;

  return difficulty === "advanced" ? 12 : 10;
};

const getMinimumTaskMinutes = (section: string, kind: TaskKind) => {
  if (isSpeakingSection(section) || kind === "speaking") return 5;
  if (isListeningSection(section)) return 6;
  if (kind === "flashcards") return 6;
  return 8;
};

const getWritingWordTarget = (
  minutes: number,
  difficulty: MissionTask["difficulty"],
) => {
  const cap =
    difficulty === "advanced" ? 120 : difficulty === "improving" ? 95 : 75;
  return clamp(Math.round(minutes * 8), 45, cap);
};

const buildTodayMission = (
  form: PlannerForm,
  sections: FocusSection[],
  recoveryMode?: RecoveryMode,
): MissionTask[] => {
  const ordered = [...sections].sort((a, b) => b.weight - a.weight);
  const difficulty = getDifficulty(form);
  const targetMinutes = getMissionBudget(form, recoveryMode);
  const targetTaskCount = getMissionTaskCount(form, targetMinutes);
  const selectedSections = ordered.slice(0, targetTaskCount);
  const tasks = selectedSections.map((section, index) => {
    const kind = getTaskKind(form.mode, section.name);
    return {
      section,
      kind,
      index,
      minutes: getRecommendedTaskMinutes(form, section.name, kind, difficulty),
    };
  });

  let totalMinutes = tasks.reduce((total, task) => total + task.minutes, 0);
  while (totalMinutes > targetMinutes) {
    const reducible = tasks
      .map((task, index) => ({
        ...task,
        index,
        min: getMinimumTaskMinutes(task.section.name, task.kind),
      }))
      .filter((task) => task.minutes > task.min)
      .sort((a, b) => b.minutes - a.minutes)[0];
    if (!reducible) break;
    const reduction = Math.min(
      5,
      tasks[reducible.index].minutes - reducible.min,
      totalMinutes - targetMinutes,
    );
    tasks[reducible.index].minutes -= reduction;
    totalMinutes -= reduction;
  }

  let scheduleOffset = 0;
  return tasks.map((task, index) => {
    const { section, kind, minutes } = task;
    const xpRate =
      kind === "writing"
        ? 2.9
        : kind === "speaking"
          ? 2.6
          : kind === "flashcards"
            ? 2.25
            : 2.4;
    const scheduledWindow = getScheduledWindow(
      form.energyProfile,
      index,
      minutes,
      scheduleOffset,
    );
    scheduleOffset += minutes + 8;

    return {
      id: `${getLocalDayKey()}-${section.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`,
      label: getTaskLabel(form, section.name, difficulty, index),
      minutes,
      xp: Math.max(30, Math.round((minutes * xpRate) / 10) * 10),
      section: section.name,
      kind,
      difficulty,
      focusReason:
        section.gap > 0
          ? `${section.name} has a ${section.gap.toFixed(form.mode === "ielts" ? 1 : 0)} point gap.`
          : `${section.name} needs maintenance.`,
      scheduledWindow,
    };
  });
};

const buildPlanKey = (
  form: PlannerForm,
  weaknesses: WeaknessEvent[] = [],
  recoveryMode?: RecoveryMode,
) =>
  [
    "micro-schedule-v2",
    form.mode,
    form.currentScore,
    form.targetScore,
    form.examDate,
    form.hoursPerDay,
    form.daysPerWeek,
    form.energyProfile,
    form.weakTopics,
    JSON.stringify(form.sectionScores),
    weaknesses
      .slice(-6)
      .map((event) => `${event.section}:${event.tag}`)
      .join("|"),
    recoveryMode?.active ? `recovery:${recoveryMode.missedDays}` : "normal",
  ].join("::");

const createProgress = (): TaskProgress => ({
  status: "notStarted",
  elapsedSeconds: 0,
  quizAnswers: {},
  reviewedCards: [],
  writingText: "",
  speakingNotes: "",
  submitted: false,
  mistakes: [],
});

const normalizeTaskProgress = (
  progress?: Partial<TaskProgress> & { status?: string },
): TaskProgress => {
  const base = createProgress();
  const merged = { ...base, ...(progress || {}) };
  const rawStatus = String(progress?.status || base.status).toLowerCase();
  return {
    ...merged,
    status:
      rawStatus === "completed"
        ? "completed"
        : rawStatus === "in_progress" || rawStatus === "inprogress"
          ? "inProgress"
          : "notStarted",
  };
};

const buildInitialPlannerState = (): PlannerState => {
  const form = buildDefaultForm();
  const dateKey = getLocalDayKey();
  return {
    form,
    missionDate: dateKey,
    tasks: [],
    taskProgress: {},
    activities: {},
    weaknesses: [],
    history: [],
    achievements: [],
    daily: {
      dateKey,
      xpEarned: 0,
      minutesStudied: 0,
      missionCompleted: false,
      dailyStreak: 0,
      missedDays: 0,
    },
    localXp: 0,
    lastOpenedDate: dateKey,
    lastPlanKey: "",
  };
};

const normalizePlannerState = (
  raw?: Partial<PlannerState> | null,
): PlannerState => {
  const base = buildInitialPlannerState();
  if (!raw) return base;

  const form = {
    ...base.form,
    ...(raw.form || {}),
    sectionScores: {
      ...initialSectionScores(raw.form?.mode || base.form.mode),
      ...(raw.form?.sectionScores || {}),
    },
  };
  const dateKey = getLocalDayKey();
  const previousDate = raw.missionDate || dateKey;
  const previousProgress = raw.taskProgress || {};
  const previousTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const previousMissionCompleted =
    previousTasks.length > 0 &&
    previousTasks.every(
      (task) => previousProgress[task.id]?.status === "completed",
    );
  const missedSinceOpen =
    previousDate === dateKey || previousMissionCompleted
      ? 0
      : dayDistance(previousDate, dateKey);
  const missedDays = Math.max(
    0,
    (raw.daily?.missedDays || 0) + missedSinceOpen,
  );
  const recoveryMode =
    raw.recoveryMode?.active || missedDays >= 3
      ? {
          active: true,
          missedDays,
          message:
            missedDays >= 3
              ? `We noticed ${missedDays} missed study days. Your roadmap has been adjusted and your target is still achievable.`
              : raw.recoveryMode?.message ||
                "Your roadmap has been adjusted for today.",
          adjustedAt: raw.recoveryMode?.adjustedAt || new Date().toISOString(),
        }
      : raw.recoveryMode;

  const weaknesses = Array.isArray(raw.weaknesses) ? raw.weaknesses : [];
  const sections = buildSections(form, weaknesses);
  const hasMission = previousTasks.length > 0 || Boolean(raw.lastPlanKey);
  const shouldRebuild =
    hasMission &&
    (previousDate !== dateKey ||
      raw.lastPlanKey !== buildPlanKey(form, weaknesses, recoveryMode));
  const tasks = hasMission
    ? shouldRebuild
      ? buildTodayMission(form, sections, recoveryMode)
      : previousTasks
    : [];
  const taskProgress = Object.fromEntries(
    tasks.map((task) => [
      task.id,
      shouldRebuild
        ? createProgress()
        : normalizeTaskProgress(previousProgress[task.id]),
    ]),
  );

  return {
    ...base,
    ...raw,
    form,
    missionDate: hasMission ? dateKey : raw.missionDate || dateKey,
    tasks,
    taskProgress,
    activities: shouldRebuild ? {} : raw.activities || {},
    weaknesses,
    history: Array.isArray(raw.history) ? raw.history : [],
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
    daily:
      previousDate === dateKey
        ? {
            ...base.daily,
            ...(raw.daily || {}),
            dateKey,
            missedDays,
          }
        : {
            dateKey,
            xpEarned: 0,
            minutesStudied: 0,
            missionCompleted: false,
            dailyStreak: raw.daily?.dailyStreak || 0,
            missedDays,
          },
    recoveryMode: hasMission ? recoveryMode : undefined,
    localXp: raw.localXp || 0,
    lastOpenedDate: dateKey,
    lastPlanKey: hasMission
      ? buildPlanKey(form, weaknesses, recoveryMode)
      : raw.lastPlanKey || "",
  };
};

const getCoachMessage = (state: PlannerState, weakest: FocusSection) => {
  if (state.recoveryMode?.active) return state.recoveryMode.message;
  if (state.form.mode === "school") {
    return `Today we will focus on ${weakest.name.toLowerCase()} because it is currently the biggest gap in ${state.form.schoolSubject}. Completing today's mission keeps the plan realistic.`;
  }
  if (state.form.mode === "entrance") {
    return `Today we will focus on ${weakest.name.toLowerCase()} for ${state.form.schoolSubject} entrance prep. Completing today's mission keeps your university exam plan realistic.`;
  }
  return `Today we will focus on ${weakest.name} because it is currently your weakest skill. Completing today's mission will move you closer to your target score.`;
};

const missionIcon = (task: MissionTask) => {
  if (task.section === "Listening") return Headphones;
  if (task.section === "Speaking" || task.section === "Speaking Practice")
    return Mic2;
  if (task.kind === "writing") return PenLine;
  if (task.kind === "flashcards") return Brain;
  if (
    [
      "Algebra",
      "Functions",
      "Geometry",
      "Data Analysis",
      "Problem solving",
      "Problem Solving",
    ].includes(task.section)
  )
    return Target;
  return BookOpen;
};

const getCompletionRate = (state: PlannerState) => {
  const lastTen = state.history.slice(-30);
  if (!lastTen.length) {
    const completedToday = state.tasks.filter(
      (task) => state.taskProgress[task.id]?.status === "completed",
    ).length;
    return state.tasks.length ? completedToday / state.tasks.length : 0;
  }
  const uniqueDays = new Set(lastTen.map((item) => item.dateKey)).size || 1;
  const expected = Math.max(uniqueDays * 3, state.tasks.length || 3);
  return clamp(lastTen.length / expected, 0, 1);
};

const getWeaknessDashboard = (
  state: PlannerState,
  sections: FocusSection[],
) => {
  const scores = new Map<
    string,
    { label: string; section: string; score: number }
  >();
  getWeakTopicList(state.form.weakTopics).forEach((topic, index) => {
    scores.set(`manual-${topic.toLowerCase()}`, {
      label: topic,
      section: "Weak area",
      score: 120 - index * 6,
    });
  });
  sections.forEach((section) => {
    scores.set(section.name, {
      label: section.name,
      section: section.name,
      score: section.weight + Math.max(section.gap, 0) * 6,
    });
  });
  state.weaknesses.slice(-40).forEach((event) => {
    const key = event.tag || event.section;
    const current = scores.get(key) || {
      label: key,
      section: event.section,
      score: 0,
    };
    scores.set(key, { ...current, score: current.score + event.severity * 12 });
  });
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};

const getSuccessProbability = (
  state: PlannerState,
  sections: FocusSection[],
) => {
  const form = state.form;
  const current = parseNumber(
    form.currentScore,
    parseNumber(EXAM_OPTIONS[form.mode].current),
  );
  const target = parseNumber(
    form.targetScore,
    parseNumber(EXAM_OPTIONS[form.mode].target),
  );
  const gap = Math.max(0.1, target - current);
  const remaining = daysUntil(form.examDate);
  const weeks = Math.max(1, remaining / 7);
  const weeklyHours =
    parseNumber(form.hoursPerDay, 3) * parseNumber(form.daysPerWeek, 6);
  const availableHours = weeklyHours * weeks;
  const neededHours =
    form.mode === "ielts"
      ? gap * 90
      : form.mode === "sat"
        ? gap * 0.32
        : form.mode === "hsk"
          ? gap * 0.9
          : form.mode === "cefr"
            ? gap * 2.4
            : form.mode === "entrance"
              ? gap * 3.1
              : gap * 2.7;
  const timeFit = clamp(availableHours / Math.max(neededHours, 1), 0, 1.35);
  const completionRate = getCompletionRate(state);
  const weaknessPenalty = clamp(
    sections.reduce(
      (total, section) => total + section.gap * (section.weight / 100),
      0,
    ),
    0,
    22,
  );
  const streakBoost = clamp(state.daily.dailyStreak * 0.8, 0, 10);
  const recoveryPenalty = state.recoveryMode?.active ? 4 : 0;
  const probability = Math.round(
    clamp(
      34 +
        timeFit * 34 +
        completionRate * 18 +
        streakBoost -
        weaknessPenalty -
        recoveryPenalty,
      8,
      94,
    ),
  );
  return {
    current: probability,
    afterMission: Math.round(
      clamp(probability + 4 + completionRate * 2, 0, 96),
    ),
    ifSkip: Math.round(
      clamp(probability - 3 - (state.recoveryMode?.active ? 1 : 0), 3, 95),
    ),
    extra30: Math.round(
      clamp(probability + 8 + (timeFit < 0.75 ? 4 : 0), 0, 97),
    ),
  };
};

const getJourneyProgress = (state: PlannerState, probability: number) => {
  const current = parseNumber(
    state.form.currentScore,
    parseNumber(EXAM_OPTIONS[state.form.mode].current),
  );
  const target = parseNumber(
    state.form.targetScore,
    parseNumber(EXAM_OPTIONS[state.form.mode].target),
  );
  const scoreProgress = target > 0 ? current / target : 0.5;
  const dailyProgress = state.tasks.length
    ? state.tasks.filter(
        (task) => state.taskProgress[task.id]?.status === "completed",
      ).length / state.tasks.length
    : 0;
  return Math.round(
    clamp(scoreProgress * 28 + probability * 0.45 + dailyProgress * 12, 8, 88),
  );
};

const buildRoadmapPhases = (state: PlannerState, weakest: FocusSection) => {
  const remaining = daysUntil(state.form.examDate);
  const foundationWeeks = Math.max(1, Math.ceil((remaining * 0.25) / 7));
  const improvementWeeks = Math.max(1, Math.ceil((remaining * 0.5) / 7));
  const examWeeks = Math.max(1, Math.ceil((remaining * 0.25) / 7));
  const completedCount = state.history.length;
  const phaseOneDone = completedCount >= 6 || state.daily.missionCompleted;

  return [
    {
      phase: "Phase 1",
      title:
        state.form.mode === "school" ? "Foundation" : "Baseline Foundation",
      status: phaseOneDone ? "Completed" : "Current Phase",
      state: phaseOneDone ? ("done" as const) : ("current" as const),
      weeks: [
        `Weeks 1-${foundationWeeks}`,
        "Baseline check",
        `${weakest.name} foundations`,
        "Mistake log setup",
      ],
    },
    {
      phase: "Phase 2",
      title: "Adaptive Improvement",
      status: phaseOneDone ? "Current Phase" : "Locked",
      state: phaseOneDone ? ("current" as const) : ("locked" as const),
      weeks: [
        `Next ${improvementWeeks} weeks`,
        `${weakest.name} intensive practice`,
        "Timed performance blocks",
        "Weekly recalculation",
      ],
    },
    {
      phase: "Phase 3",
      title: state.form.mode === "school" ? "Exam Confidence" : "Exam Ready",
      status: "Locked",
      state: "locked" as const,
      weeks: [
        `Final ${examWeeks} weeks`,
        "Mock exam cycles",
        "Weakness cleanup",
        "Score stabilization",
      ],
    },
  ];
};

const extractJson = (text: string) => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  return JSON.parse(candidate);
};

const getExamTaskScope = (form: PlannerForm) => {
  switch (form.mode) {
    case "ielts":
      return "IELTS only: Listening, Reading, Writing Task 1, Writing Task 2, Speaking, Vocabulary, Grammar.";
    case "sat":
      return "SAT only: Math (Algebra, Functions, Geometry, Data Analysis) and EBRW (Reading Comprehension, Vocabulary in Context, Grammar, Editing).";
    case "hsk":
      return "HSK only: Vocabulary, Character Recognition, Reading, Listening, Grammar, Writing Characters, Speaking Practice.";
    case "cefr":
      return "CEFR only: Reading, Listening, Speaking, Writing, Vocabulary, Grammar.";
    case "entrance":
      return `University entrance exam only: generate tasks for ${form.schoolSubject}, timed mocks, past papers, reading analysis, and weak topic recovery.`;
    case "school":
    default:
      return `School subjects only: generate tasks specific to ${form.schoolSubject}.`;
  }
};

const fallbackActivity = (
  task: MissionTask,
  form: PlannerForm,
  weaknesses: string[],
): GeneratedActivity => {
  const weakTopic =
    weaknesses[0] || getWeakTopicList(form.weakTopics)[0] || task.section;
  const base = `${EXAM_OPTIONS[form.mode].label} ${form.currentScore} to ${form.targetScore}`;
  const scope = getExamTaskScope(form);
  const generatedAt = new Date().toISOString();

  if (task.kind === "writing") {
    return {
      taskId: task.id,
      type: task.kind,
      title: `${task.label}: ${weakTopic}`,
      instructions: `${scope} Write at ${task.difficulty} level. Focus on accuracy and the weakness: ${weakTopic}.`,
      difficulty: task.difficulty,
      generatedAt,
      minWords: getWritingWordTarget(task.minutes, task.difficulty),
      writingPrompt:
        form.mode === "ielts" && task.section === "Writing Task 1"
          ? `Write an IELTS Academic Task 1 response. Summarize the main trends, include an overview, and avoid mistakes connected to ${weakTopic}.`
          : form.mode === "ielts" && task.section === "Writing Task 2"
            ? `Write an IELTS Task 2 essay on academic success. Use a clear position, two supported body paragraphs, and avoid ${weakTopic} mistakes.`
            : form.mode === "hsk"
              ? `Practice writing Chinese characters connected to ${weakTopic}. Write each character from memory, then use it in a simple HSK-level sentence.`
              : form.mode === "cefr"
                ? `Write a CEFR ${task.difficulty} response about exam preparation. Use accurate grammar and vocabulary connected to ${weakTopic}.`
                : `Explain ${weakTopic} in ${form.schoolSubject}, then solve one example and describe the mistake you must avoid.`,
      successCriteria: [
        "Required study time reached",
        "Writing submitted",
        "Minimum word count reached",
      ],
    };
  }

  if (task.kind === "speaking") {
    return {
      taskId: task.id,
      type: task.kind,
      title: `${task.label}: ${weakTopic}`,
      instructions: `${scope} Speak out loud, then write short notes about your answer. The exercise completes only after the speaking timer and notes are finished.`,
      difficulty: task.difficulty,
      generatedAt,
      speakingPrompt:
        form.mode === "ielts"
          ? `Describe a difficult exam topic you prepared for. Then explain why ${weakTopic} is challenging for you and how you will improve it.`
          : form.mode === "hsk"
            ? `Answer in simple Chinese about your daily study routine. Include vocabulary connected to ${weakTopic}, then repeat the answer more fluently.`
            : form.mode === "cefr"
              ? `Speak for one minute about academic success. Use vocabulary connected to ${weakTopic}, then write three correction notes.`
              : `Explain ${weakTopic} clearly as if you are teaching another student. Give one example and one correction.`,
      successCriteria: [
        "Required study time reached",
        "Speaking exercise finished",
        "Short notes submitted",
      ],
    };
  }

  if (task.kind === "flashcards") {
    return {
      taskId: task.id,
      type: task.kind,
      title: `${task.label}: ${weakTopic}`,
      instructions: `${scope} Review every card. A card counts only after you reveal the answer.`,
      difficulty: task.difficulty,
      generatedAt,
      flashcards: Array.from({ length: 6 }, (_, index) => ({
        id: `card-${index + 1}`,
        front:
          form.mode === "hsk"
            ? `${base}: recognize or recall an HSK item connected to ${weakTopic} (${index + 1}).`
            : `${base}: what is one exam rule, term, or pattern about ${weakTopic} (${index + 1})?`,
        back: `Use a precise answer, then connect it to ${task.section}.`,
        weaknessTag: weakTopic,
      })),
      successCriteria: [
        "Required study time reached",
        "All flashcards completed",
      ],
    };
  }

  return {
    taskId: task.id,
    type: "quiz",
    title: `${task.label}: ${weakTopic}`,
    instructions: `${scope} Answer all questions. They are adapted for ${base} and focus on ${task.section}.`,
    difficulty: task.difficulty,
    generatedAt,
    questions: Array.from(
      { length: task.minutes <= 8 ? 3 : 4 },
      (_, index) => ({
        id: `q-${index + 1}`,
        prompt:
          form.mode === "school" || form.mode === "entrance"
            ? `${form.schoolSubject}: choose the best correction for a common ${weakTopic} exam mistake (${index + 1}).`
            : `${base}: which exam strategy best improves ${task.section} when the weakness is ${weakTopic}?`,
        options: [
          "Identify the exact mistake first",
          "Repeat without checking feedback",
          "Skip the difficult part",
          "Only read the answer key",
        ],
        answerIndex: 0,
        explanation: `The plan adapts by correcting ${weakTopic} before increasing difficulty.`,
        weaknessTag: weakTopic,
      }),
    ),
    successCriteria: [
      "Required study time reached",
      "Quiz submitted",
      "All questions answered",
    ],
  };
};

const normalizeActivity = (
  task: MissionTask,
  form: PlannerForm,
  parsed: any,
  weaknessLabels: string[],
) => {
  const fallback = fallbackActivity(task, form, weaknessLabels);
  const activity: GeneratedActivity = {
    ...fallback,
    ...parsed,
    taskId: task.id,
    type: task.kind,
    difficulty: task.difficulty,
    generatedAt: new Date().toISOString(),
    successCriteria: Array.isArray(parsed?.successCriteria)
      ? parsed.successCriteria.slice(0, 4).map(String)
      : fallback.successCriteria,
  };

  if (task.kind === "quiz") {
    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions
      : fallback.questions;
    const maxQuestions = task.minutes <= 8 ? 3 : task.minutes <= 12 ? 4 : 5;
    activity.questions = (questions || [])
      .slice(0, maxQuestions)
      .map((question: any, index: number) => {
        const options =
          Array.isArray(question?.options) && question.options.length >= 3
            ? question.options.slice(0, 4).map(String)
            : fallback.questions?.[0].options || [];
        return {
          id: String(question?.id || `q-${index + 1}`),
          prompt: String(
            question?.prompt ||
              fallback.questions?.[index % (fallback.questions?.length || 1)]
                ?.prompt ||
              "Question",
          ),
          options,
          answerIndex: clamp(
            parseNumber(question?.answerIndex, 0),
            0,
            Math.max(options.length - 1, 0),
          ),
          explanation: String(
            question?.explanation ||
              "Review the feedback and correct the mistake.",
          ),
          weaknessTag: String(
            question?.weaknessTag || weaknessLabels[0] || task.section,
          ),
        };
      });
  }

  if (task.kind === "flashcards") {
    const cards = Array.isArray(parsed?.flashcards)
      ? parsed.flashcards
      : fallback.flashcards;
    activity.flashcards = (cards || [])
      .slice(0, 8)
      .map((card: any, index: number) => ({
        id: String(card?.id || `card-${index + 1}`),
        front: String(card?.front || `${task.section} card ${index + 1}`),
        back: String(
          card?.back || "Review the key idea and repeat it from memory.",
        ),
        weaknessTag: String(
          card?.weaknessTag || weaknessLabels[0] || task.section,
        ),
      }));
  }

  if (task.kind === "writing") {
    const maxWords = Math.max(
      55,
      getWritingWordTarget(task.minutes, task.difficulty) + 25,
    );
    activity.minWords = clamp(
      parseNumber(parsed?.minWords, fallback.minWords || 80),
      45,
      maxWords,
    );
    activity.writingPrompt = String(
      parsed?.writingPrompt || fallback.writingPrompt,
    );
  }

  if (task.kind === "speaking") {
    activity.speakingPrompt = String(
      parsed?.speakingPrompt || fallback.speakingPrompt,
    );
  }

  return activity;
};

const getValidation = (
  task: MissionTask,
  activity: GeneratedActivity | undefined,
  progress: TaskProgress | undefined,
) => {
  if (!activity || !progress)
    return {
      ok: false,
      reasons: ["Open the generated activity first."],
      mistakes: [] as string[],
      score: undefined as number | undefined,
    };
  const reasons: string[] = [];
  const mistakes: string[] = [];
  const requiredSeconds = task.minutes * 60;
  if (progress.elapsedSeconds < requiredSeconds)
    reasons.push(
      `Study timer needs ${Math.ceil((requiredSeconds - progress.elapsedSeconds) / 60)} more min.`,
    );

  if (activity.type === "quiz") {
    const questions = activity.questions || [];
    const answered = questions.filter(
      (question) => progress.quizAnswers[question.id] !== undefined,
    );
    if (answered.length < questions.length)
      reasons.push("Answer every quiz question.");
    if (!progress.submitted) reasons.push("Submit the quiz first.");
    questions.forEach((question) => {
      if (
        progress.submitted &&
        progress.quizAnswers[question.id] !== question.answerIndex
      ) {
        mistakes.push(question.weaknessTag || task.section);
      }
    });
    const correct = questions.filter(
      (question) => progress.quizAnswers[question.id] === question.answerIndex,
    ).length;
    return {
      ok: reasons.length === 0,
      reasons,
      mistakes,
      score: questions.length
        ? Math.round((correct / questions.length) * 100)
        : 0,
    };
  }

  if (activity.type === "writing") {
    if (words(progress.writingText).length < (activity.minWords || 90))
      reasons.push(`Write at least ${activity.minWords || 90} words.`);
    if (!progress.submitted) reasons.push("Submit the writing task.");
    if (words(progress.writingText).length < (activity.minWords || 90) + 40)
      mistakes.push("Writing depth");
    if (/because|however|therefore/i.test(progress.writingText) === false)
      mistakes.push("Academic linking");
  }

  if (activity.type === "speaking") {
    if (words(progress.speakingNotes).length < 10)
      reasons.push("Add short notes after speaking.");
    if (!progress.submitted) reasons.push("Finish the speaking exercise.");
    if (words(progress.speakingNotes).length < 22)
      mistakes.push("Speaking fluency");
  }

  if (activity.type === "flashcards") {
    const cards = activity.flashcards || [];
    if (progress.reviewedCards.length < cards.length)
      reasons.push("Review every flashcard.");
    if (progress.reviewedCards.length < cards.length)
      mistakes.push(
        cards.find((card) => !progress.reviewedCards.includes(card.id))
          ?.weaknessTag || task.section,
      );
  }

  return { ok: reasons.length === 0, reasons, mistakes, score: undefined };
};

const buildReflection = (
  state: PlannerState,
  sections: FocusSection[],
): DailyReflection => {
  const completed = state.tasks.filter(
    (task) => state.taskProgress[task.id]?.status === "completed",
  );
  const strongestArea =
    completed[completed.length - 1]?.section ||
    sections.slice().sort((a, b) => a.gap - b.gap)[0]?.name ||
    "Reading";
  const needsImprovement =
    getWeaknessDashboard(state, sections)[0]?.label ||
    sections[0]?.name ||
    "Listening";
  return {
    tasksCompleted: completed.length,
    minutesStudied: state.daily.minutesStudied,
    xpEarned: state.daily.xpEarned,
    strongestArea,
    needsImprovement,
    recommendation: `Spend 15 extra minutes on ${needsImprovement} tomorrow so the roadmap can increase your success probability.`,
  };
};

const calculateNewAchievements = (state: PlannerState) => {
  const unlocked = new Map(
    state.achievements.map((achievement) => [achievement.id, achievement]),
  );
  const completed = state.history;
  const countBySection = (section: string) =>
    completed.filter((item) => item.section.toLowerCase().includes(section))
      .length;
  const add = (
    id: string,
    title: string,
    description: string,
    condition: boolean,
  ) => {
    if (condition && !unlocked.has(id)) {
      unlocked.set(id, {
        id,
        title,
        description,
        unlockedAt: new Date().toISOString(),
      });
    }
  };

  add(
    "streak-7",
    "7 Day Streak",
    "Completed exam-prep activity across a consistent streak.",
    state.daily.dailyStreak >= 7,
  );
  add(
    "vocabulary-master",
    "Vocabulary Master",
    "Completed repeated vocabulary or flashcard recovery.",
    completed.filter((item) => item.kind === "flashcards").length >= 5,
  );
  add(
    "listening-warrior",
    "Listening Warrior",
    "Completed targeted listening practice multiple times.",
    countBySection("listening") >= 3,
  );
  add(
    "writing-specialist",
    "Writing Specialist",
    "Submitted multiple validated writing tasks.",
    completed.filter((item) => item.kind === "writing").length >= 3,
  );
  add(
    "fast-improver",
    "Fast Improver",
    "Maintained strong completion and improved probability.",
    getCompletionRate(state) >= 0.8 && completed.length >= 6,
  );
  add(
    "mission-champion",
    "Mission Champion",
    "Completed a full daily mission.",
    state.daily.missionCompleted,
  );

  return Array.from(unlocked.values());
};

const ConfettiBurst = ({ large = false }: { large?: boolean }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
    {Array.from({ length: large ? 34 : 18 }, (_, index) => (
      <motion.span
        key={index}
        initial={{ opacity: 0, x: "50%", y: "50%", scale: 0.3, rotate: 0 }}
        animate={{
          opacity: [0, 1, 0],
          x: `${50 + Math.cos(index) * (large ? 46 : 34)}%`,
          y: `${50 + Math.sin(index * 1.7) * (large ? 42 : 30)}%`,
          scale: [0.3, 1, 0.7],
          rotate: 220 + index * 16,
        }}
        transition={{ duration: 1.2, delay: index * 0.015 }}
        className={cn(
          "absolute h-2 w-2 rounded-sm",
          index % 4 === 0
            ? "bg-[#3F7D58]"
            : index % 4 === 1
              ? "bg-amber-400"
              : index % 4 === 2
                ? "bg-sky-400"
                : "bg-rose-400",
        )}
      />
    ))}
  </div>
);

const formatTimer = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

export const Planner = () => {
  const { user, profile } = useAuth();
  const [plannerState, setPlannerState] = useState<PlannerState>(() =>
    buildInitialPlannerState(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [loadBlocked, setLoadBlocked] = useState(false);
  const [view, setView] = useState<PlannerView>("today");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [recommendation, setRecommendation] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [generatingTaskId, setGeneratingTaskId] = useState<string | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [planValidationMessage, setPlanValidationMessage] = useState("");
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  useBodyScrollLock(
    settingsOpen || recommendationsOpen || Boolean(celebration),
  );
  const cloudSaveRef = useRef<number | undefined>(undefined);
  const lastCloudPlannerStateRef = useRef("");
  const plannerLatestRef = useRef(plannerState);
  plannerLatestRef.current = plannerState;
  const plannerDirtyRef = useRef(false);
  const openingTaskRef = useRef(false);
  const weakAreasInputRef = useRef<HTMLInputElement>(null);
  const studyReceiptsRef = useRef<Record<string, string>>({});
  const completingTaskRef = useRef(false);
  const [completingTask, setCompletingTask] = useState(false);

  const modeConfig = EXAM_OPTIONS[plannerState.form.mode];
  const sections = useMemo(
    () => buildSections(plannerState.form, plannerState.weaknesses),
    [plannerState.form, plannerState.weaknesses],
  );
  const weakest = useMemo(
    () => [...sections].sort((a, b) => b.gap - a.gap)[0] || sections[0],
    [sections],
  );
  const weaknessDashboard = useMemo(
    () => getWeaknessDashboard(plannerState, sections),
    [plannerState, sections],
  );
  const hasPlannerActivity =
    plannerState.tasks.length > 0 || plannerState.history.length > 0;
  const probability = useMemo(
    () =>
      hasPlannerActivity
        ? getSuccessProbability(plannerState, sections)
        : { current: 0, afterMission: 0, extra30: 0, ifSkip: 0 },
    [hasPlannerActivity, plannerState, sections],
  );
  const journeyProgress = useMemo(
    () =>
      hasPlannerActivity
        ? getJourneyProgress(plannerState, probability.current)
        : 0,
    [hasPlannerActivity, plannerState, probability.current],
  );
  const completedTasks = plannerState.tasks.filter(
    (task) => plannerState.taskProgress[task.id]?.status === "completed",
  );
  const totalMinutes = plannerState.tasks.reduce(
    (sum, task) => sum + task.minutes,
    0,
  );
  const completedMinutes = completedTasks.reduce(
    (sum, task) => sum + task.minutes,
    0,
  );
  const activeTask = activeTaskId
    ? plannerState.tasks.find((task) => task.id === activeTaskId)
    : undefined;
  const activeActivity = activeTaskId
    ? plannerState.activities[activeTaskId]
    : undefined;
  const activeProgress = activeTaskId
    ? plannerState.taskProgress[activeTaskId]
    : undefined;
  const weakAreasInvalid =
    Boolean(planValidationMessage) &&
    !hasRequiredWeakTopics(plannerState.form.weakTopics);

  useEffect(() => {
    let active = true;
    setHydrated(false);
    setLoadBlocked(false);

    if (!user) {
      const emptyState = normalizePlannerState(null);
      lastCloudPlannerStateRef.current = JSON.stringify(emptyState);
      setPlannerState(emptyState);
      setHydrated(true);
      return () => {
        active = false;
      };
    }

    const cached = loadLocalData<{
      state: PlannerState;
      dirty: boolean;
    } | null>(`noviq-planner-${user.uid}`, null);
    if (cached) {
      const restored = normalizePlannerState(cached.state);
      plannerLatestRef.current = restored;
      plannerDirtyRef.current = cached.dirty;
      setPlannerState(restored);
      setHydrated(true);
    }
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid, "planner", "state"),
      (snapshot) => {
        if (!active) return;
        if (!cached && snapshot.metadata.fromCache && !snapshot.exists())
          return;
        if (snapshot.exists()) {
          const remoteState = normalizePlannerState(
            (snapshot.data() as { state?: PlannerState }).state,
          );
          const remoteJson = JSON.stringify(remoteState);
          if (
            plannerDirtyRef.current &&
            remoteJson !== JSON.stringify(plannerLatestRef.current)
          )
            return;
          plannerDirtyRef.current = false;
          lastCloudPlannerStateRef.current = remoteJson;
          setPlannerState(remoteState);
          saveLocalData(`noviq-planner-${user.uid}`, {
            state: remoteState,
            dirty: false,
          });
        } else if (!cached) {
          const emptyState = normalizePlannerState(null);
          lastCloudPlannerStateRef.current = JSON.stringify(emptyState);
          setPlannerState(emptyState);
        }
        setHydrated(true);
      },
      (error) => {
        console.warn("Planner cloud load failed", error);
        if (active) {
          if (!cached) {
            setLoadBlocked(true);
            lastCloudPlannerStateRef.current = JSON.stringify(
              plannerLatestRef.current,
            );
          }
          setValidationMessage(
            "Cloud connection unavailable. Your saved plan is kept on this device.",
          );
          setHydrated(true);
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!hydrated || loadBlocked) return;
    if (!user) return;
    const plannerStateJson = JSON.stringify(plannerState);
    if (plannerStateJson === lastCloudPlannerStateRef.current) return;
    plannerDirtyRef.current = true;
    if (
      !saveLocalData(`noviq-planner-${user.uid}`, {
        state: plannerState,
        dirty: true,
      })
    )
      setValidationMessage(
        "Device storage is full or unavailable. Keep this page open until cloud sync finishes.",
      );

    if (cloudSaveRef.current) window.clearTimeout(cloudSaveRef.current);
    cloudSaveRef.current = window.setTimeout(() => {
      writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "planner", "state"],
        data: { state: plannerState, updatedAt: new Date().toISOString() },
        merge: true,
      }).catch((error) => {
        console.warn("Planner cloud sync failed", error);
        setValidationMessage(
          "Plan saved on this device. Cloud sync will retry when connected.",
        );
      });
    }, 1200);
  }, [plannerState, hydrated, loadBlocked, user]);

  useEffect(
    () => () => {
      if (cloudSaveRef.current) window.clearTimeout(cloudSaveRef.current);
      if (user && plannerDirtyRef.current)
        void writeDocWithQueue({
          userId: user.uid,
          path: ["users", user.uid, "planner", "state"],
          data: {
            state: plannerLatestRef.current,
            updatedAt: new Date().toISOString(),
          },
          merge: true,
        }).catch(() => undefined);
    },
    [user?.uid],
  );

  useEffect(() => {
    if (!timerRunning || !activeTaskId) return;
    let lastTick = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastTick) / 1000);
      if (elapsed < 1) return;
      lastTick += elapsed * 1000;
      setPlannerState((current) => {
        const task = current.tasks.find((item) => item.id === activeTaskId);
        const currentProgress = current.taskProgress[activeTaskId];
        if (
          !task ||
          !currentProgress ||
          currentProgress.status === "completed"
        ) {
          window.setTimeout(() => setTimerRunning(false), 0);
          return current;
        }
        const nextElapsed = Math.min(
          task.minutes * 60,
          currentProgress.elapsedSeconds + elapsed,
        );
        if (nextElapsed >= task.minutes * 60) {
          window.setTimeout(() => setTimerRunning(false), 0);
        }
        return {
          ...current,
          taskProgress: {
            ...current.taskProgress,
            [activeTaskId]: {
              ...normalizeTaskProgress(currentProgress),
              status: "inProgress",
              elapsedSeconds: nextElapsed,
            },
          },
        };
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [timerRunning, activeTaskId]);

  const rebuildWithForm = (patch: Partial<PlannerForm>) => {
    if (
      typeof patch.weakTopics === "string" &&
      hasRequiredWeakTopics(patch.weakTopics)
    ) {
      setPlanValidationMessage("");
    }
    setPlannerState((current) => {
      const nextForm = {
        ...current.form,
        ...patch,
        sectionScores: patch.sectionScores || current.form.sectionScores,
      };
      const hasMission =
        current.tasks.length > 0 || Boolean(current.lastPlanKey);
      const nextSections = buildSections(nextForm, current.weaknesses);
      const nextTasks = hasMission
        ? buildTodayMission(nextForm, nextSections, current.recoveryMode)
        : [];
      return {
        ...current,
        form: nextForm,
        tasks: nextTasks,
        taskProgress: Object.fromEntries(
          nextTasks.map((task) => [task.id, createProgress()]),
        ),
        activities: hasMission ? {} : current.activities,
        lastPlanKey: hasMission
          ? buildPlanKey(nextForm, current.weaknesses, current.recoveryMode)
          : "",
      };
    });
  };

  const focusWeakAreasInput = () => {
    window.setTimeout(() => weakAreasInputRef.current?.focus(), 0);
  };

  const validateWeakAreas = (form: PlannerForm) => {
    if (hasRequiredWeakTopics(form.weakTopics)) {
      setPlanValidationMessage("");
      return true;
    }

    setPlanValidationMessage(
      "Weak areas are required before creating a study plan.",
    );
    setSettingsOpen(true);
    focusWeakAreasInput();
    return false;
  };

  const createMission = () => {
    if (!validateWeakAreas(plannerState.form)) return;

    setPlannerState((current) => {
      const dateKey = getLocalDayKey();
      const sectionsForMission = buildSections(
        current.form,
        current.weaknesses,
      );
      const tasks = buildTodayMission(
        current.form,
        sectionsForMission,
        current.recoveryMode,
      );
      return {
        ...current,
        missionDate: dateKey,
        tasks,
        taskProgress: Object.fromEntries(
          tasks.map((task) => [task.id, createProgress()]),
        ),
        activities: {},
        daily: {
          ...current.daily,
          dateKey,
          xpEarned: 0,
          minutesStudied: 0,
          missionCompleted: false,
          reflection: undefined,
        },
        lastPlanKey: buildPlanKey(
          current.form,
          current.weaknesses,
          current.recoveryMode,
        ),
      };
    });
    setSettingsOpen(false);
  };

  const savePlanSettings = () => {
    if (!validateWeakAreas(plannerState.form)) return;
    setSettingsOpen(false);
  };

  const switchMode = (mode: ExamMode) => {
    const config = EXAM_OPTIONS[mode];
    rebuildWithForm({
      mode,
      goal: config.defaultGoal,
      currentScore: config.current,
      targetScore: config.target,
      sectionScores: initialSectionScores(mode),
    });
  };

  const updateSectionScore = (section: string, value: string) => {
    rebuildWithForm({
      sectionScores: {
        ...plannerState.form.sectionScores,
        [section]: value,
      },
    });
  };

  const startMission = () => {
    if (!plannerState.tasks.length) {
      setSettingsOpen(true);
      return;
    }
    const firstOpen = plannerState.tasks.find(
      (task) => plannerState.taskProgress[task.id]?.status !== "completed",
    );
    if (firstOpen) void openActivity(firstOpen);
  };

  const generateActivity = async (task: MissionTask) => {
    const weaknessLabels = Array.from(
      new Set([
        ...getWeakTopicList(plannerState.form.weakTopics),
        ...weaknessDashboard.map((item) => item.label),
      ]),
    );
    const context = {
      examType: EXAM_OPTIONS[plannerState.form.mode].label,
      currentScore: plannerState.form.currentScore,
      targetScore: plannerState.form.targetScore,
      examDate: plannerState.form.examDate,
      dailyHours: plannerState.form.hoursPerDay,
      daysPerWeek: plannerState.form.daysPerWeek,
      weakAreas: weaknessLabels,
      previousMistakes: plannerState.weaknesses
        .slice(-8)
        .map((event) => event.tag),
      remainingDays: daysUntil(plannerState.form.examDate),
      task: {
        label: task.label,
        section: task.section,
        minutes: task.minutes,
        type: task.kind,
        difficulty: task.difficulty,
      },
    };
    const system = [
      "You are Saidamin AI Planner.",
      "Noviq is an AI Study Operating System for exam preparation and academic success.",
      "Generate one personalized exam-preparation activity.",
      "Return only valid JSON.",
      "Do not use generic fixed demo content.",
      "Do not generate programming, general science, or generic language-learning tasks unless they are explicitly part of the selected school or entrance exam subject.",
      getExamTaskScope(plannerState.form),
      "The activity must match the student's level, goal, weak areas, previous mistakes, and remaining time.",
      "Treat every task as a short micro-session. Listening and speaking activities must fit 5-10 minutes. Never create 30-40 minute listening or speaking work.",
      "Do not force the full daily available time into today's mission; generate only the focused work needed for today's tasks.",
      "For writing tasks, keep word targets realistic for the task minutes.",
      "Use this JSON shape: { title, instructions, successCriteria, questions, writingPrompt, speakingPrompt, flashcards, minWords }.",
      "For quiz: questions must have prompt, options, answerIndex, explanation, weaknessTag.",
      "For flashcards: flashcards must have front, back, weaknessTag.",
    ].join("\n");

    try {
      const response = await askTutor(
        `Create the activity for this student context:\n${JSON.stringify(context, null, 2)}`,
        system,
        "en-US",
        { retries: 1, feature: "planner" },
      );
      return normalizeActivity(
        task,
        plannerState.form,
        extractJson(response),
        weaknessLabels,
      );
    } catch (error) {
      console.warn("Planner AI activity generation failed", error);
      return fallbackActivity(task, plannerState.form, weaknessLabels);
    }
  };

  const openActivity = async (task: MissionTask) => {
    if (openingTaskRef.current) return;
    if (plannerState.taskProgress[task.id]?.status === "completed") {
      setActiveTaskId(task.id);
      setView("activity");
      return;
    }
    openingTaskRef.current = true;
    setTimerRunning(false);
    setValidationMessage("");
    try {
      studyReceiptsRef.current[task.id] = await startStudySession(
        task.kind === "quiz"
          ? "quiz"
          : task.kind === "flashcards"
            ? "revision"
            : "focus",
        `planner-${task.id}`,
        false,
        () => {
          if (plannerState.taskProgress[task.id]?.elapsedSeconds > 0) {
            updateProgress(task.id, { elapsedSeconds: 0 });
            setValidationMessage(
              "Your previous timer expired. Your answers are kept; start the timer again to complete this task.",
            );
          }
        },
      );
    } catch (error) {
      setValidationMessage(
        error instanceof Error
          ? error.message
          : "Connect to the internet to start this task.",
      );
      openingTaskRef.current = false;
      return;
    }
    openingTaskRef.current = false;
    setActiveTaskId(task.id);
    setView("activity");

    if (plannerState.activities[task.id]) {
      setPlannerState((current) => ({
        ...current,
        taskProgress: {
          ...current.taskProgress,
          [task.id]: {
            ...normalizeTaskProgress(current.taskProgress[task.id]),
            status: "inProgress",
          },
        },
      }));
      return;
    }

    setGeneratingTaskId(task.id);
    const activity = await generateActivity(task);
    setPlannerState((current) => ({
      ...current,
      activities: {
        ...current.activities,
        [task.id]: activity,
      },
      taskProgress: {
        ...current.taskProgress,
        [task.id]: {
          ...normalizeTaskProgress(current.taskProgress[task.id]),
          status: "inProgress",
        },
      },
    }));
    setGeneratingTaskId(null);
  };

  const updateProgress = (taskId: string, patch: Partial<TaskProgress>) => {
    setPlannerState((current) => ({
      ...current,
      taskProgress: {
        ...current.taskProgress,
        [taskId]: {
          ...(current.taskProgress[taskId] || createProgress()),
          ...patch,
        },
      },
    }));
  };

  const submitQuiz = () => {
    if (!activeTask || !activeActivity || !activeProgress) return;
    const validation = getValidation(activeTask, activeActivity, {
      ...activeProgress,
      submitted: true,
    });
    updateProgress(activeTask.id, {
      submitted: true,
      score: validation.score,
      mistakes: validation.mistakes,
    });
    setValidationMessage(
      validation.score !== undefined
        ? `Quiz submitted. Score: ${validation.score}%. Finish the timer before completion.`
        : "Quiz submitted.",
    );
  };

  const completeTask = async () => {
    if (completingTaskRef.current) return;
    if (!activeTask || !activeActivity || !activeProgress) return;
    const validation = getValidation(
      activeTask,
      activeActivity,
      activeProgress,
    );
    if (!validation.ok) {
      setValidationMessage(validation.reasons.join(" "));
      return;
    }

    const alreadyComplete = activeProgress.status === "completed";
    if (alreadyComplete) return;

    if (user) {
      completingTaskRef.current = true;
      setCompletingTask(true);
      try {
        await persistStudySession(
          {
            userId: user.uid,
            duration: activeProgress.elapsedSeconds,
            subject: activeTask.section,
            category:
              activeTask.kind === "quiz"
                ? "quiz"
                : activeTask.kind === "flashcards"
                  ? "revision"
                  : "focus",
            xpEarned: 0,
            timestamp: new Date().toISOString(),
          },
          profile,
          [],
          studyReceiptsRef.current[activeTask.id],
        );
      } catch (error) {
        setValidationMessage(
          error instanceof Error
            ? error.message
            : "Could not save this task. Please retry.",
        );
        return;
      } finally {
        completingTaskRef.current = false;
        setCompletingTask(false);
      }
    }

    const completedAt = new Date();
    const dayKey = getLocalDayKey(completedAt);
    const completedProgress: TaskProgress = {
      ...activeProgress,
      status: "completed",
      submitted: true,
      score: validation.score ?? activeProgress.score,
      mistakes: validation.mistakes,
      completedAt: completedAt.toISOString(),
      xpAwarded: activeTask.xp,
    };
    const newWeaknesses: WeaknessEvent[] = validation.mistakes
      .slice(0, 4)
      .map((mistake, index) => ({
        id: `${activeTask.id}-weakness-${Date.now()}-${index}`,
        tag: mistake,
        section: activeTask.section,
        source: activeTask.label,
        createdAt: completedAt.toISOString(),
        severity:
          validation.score !== undefined && validation.score >= 80 ? 1 : 2,
      }));
    const historyRecord: CompletedTaskRecord = {
      id: `${activeTask.id}-${completedAt.getTime()}`,
      dateKey: dayKey,
      taskId: activeTask.id,
      section: activeTask.section,
      kind: activeTask.kind,
      minutes: activeTask.minutes,
      xp: activeTask.xp,
      score: validation.score,
      mistakes: validation.mistakes,
      completedAt: completedAt.toISOString(),
    };
    const nextProgress = {
      ...plannerState.taskProgress,
      [activeTask.id]: completedProgress,
    };
    const allDone = plannerState.tasks.every(
      (task) => nextProgress[task.id]?.status === "completed",
    );
    const missionCompleted = allDone && !plannerState.daily.missionCompleted;
    const bonusXp = 0;
    const nextDaily = {
      ...plannerState.daily,
      xpEarned: plannerState.daily.xpEarned + activeTask.xp + bonusXp,
      minutesStudied: plannerState.daily.minutesStudied + activeTask.minutes,
      missionCompleted: plannerState.daily.missionCompleted || allDone,
      dailyStreak: missionCompleted
        ? plannerState.daily.dailyStreak + 1
        : plannerState.daily.dailyStreak,
      reflection: plannerState.daily.reflection,
    };
    let nextStateForReflection: PlannerState = {
      ...plannerState,
      taskProgress: nextProgress,
      weaknesses: [...plannerState.weaknesses, ...newWeaknesses].slice(-80),
      history: [...plannerState.history, historyRecord].slice(-180),
      localXp: plannerState.localXp + activeTask.xp + bonusXp,
      daily: nextDaily,
    };

    if (allDone) {
      nextStateForReflection = {
        ...nextStateForReflection,
        recoveryMode: nextStateForReflection.recoveryMode?.active
          ? { ...nextStateForReflection.recoveryMode, active: false }
          : nextStateForReflection.recoveryMode,
      };
    }

    const nextSections = buildSections(
      nextStateForReflection.form,
      nextStateForReflection.weaknesses,
    );
    nextStateForReflection = {
      ...nextStateForReflection,
      daily: allDone
        ? {
            ...nextStateForReflection.daily,
            reflection: buildReflection(nextStateForReflection, nextSections),
          }
        : nextStateForReflection.daily,
    };
    nextStateForReflection = {
      ...nextStateForReflection,
      achievements: calculateNewAchievements(nextStateForReflection),
    };
    const celebrationPayload: Celebration = missionCompleted
      ? {
          type: "mission",
          title: "Daily Mission Completed",
          subtitle: "You completed all planned tasks today.",
          xp: activeTask.xp,
          bonusXp: 0,
        }
      : {
          type: "task",
          title: "Great Job!",
          subtitle: `${activeTask.label} completed`,
          xp: activeTask.xp,
        };
    setPlannerState(nextStateForReflection);

    setCelebration(celebrationPayload);
    setTimerRunning(false);
    setValidationMessage("");
    setView("today");

    if (user) {
      trackUserEvent(user.uid, "mission_task_completed", 0, {
        taskId: activeTask.id,
        missionCompleted,
        durationSeconds: activeProgress.elapsedSeconds,
      }).catch((error) => {
        console.warn("Planner study session sync failed", error);
        setValidationMessage(
          error instanceof Error
            ? error.message
            : "Could not save the study session.",
        );
      });
    }

    if (nextStateForReflection.daily.reflection) {
      setRecommendation(nextStateForReflection.daily.reflection.recommendation);
    }
  };

  const activateRecoveryMode = async () => {
    if (!plannerState.tasks.length) {
      setSettingsOpen(true);
      return;
    }
    setTimerRunning(false);
    setValidationMessage("");
    setPlannerState((current) => {
      const recoveryMode: RecoveryMode = {
        active: true,
        missedDays: Math.max(1, current.daily.missedDays + 1),
        message:
          "We noticed a difficult day. Do not worry. Your roadmap has been intelligently adjusted and your target is still achievable.",
        adjustedAt: new Date().toISOString(),
      };
      const nextSections = buildSections(current.form, current.weaknesses);
      const tasks = buildTodayMission(current.form, nextSections, recoveryMode);
      return {
        ...current,
        recoveryMode,
        tasks,
        taskProgress: Object.fromEntries(
          tasks.map((task) => [task.id, createProgress()]),
        ),
        activities: {},
        lastPlanKey: buildPlanKey(
          current.form,
          current.weaknesses,
          recoveryMode,
        ),
      };
    });

    try {
      const message = await askTutor(
        `Write one calm short message in Uzbek Latin for a student who missed study time. Goal: ${plannerState.form.goal}. Weakest area: ${weakest.name}. Mention that the roadmap was recalculated, not failed.`,
        "You are Saidamin AI Planner. Be practical and motivating.",
        "uz-UZ",
        { retries: 1, feature: "planner" },
      );
      setPlannerState((current) => ({
        ...current,
        recoveryMode: current.recoveryMode
          ? { ...current.recoveryMode, message: message.trim() }
          : current.recoveryMode,
      }));
    } catch (error) {
      console.warn("Planner recovery message failed", error);
    }
  };

  const openRecommendations = async () => {
    setRecommendationsOpen(true);
    if (recommendation) return;
    if (!hasPlannerActivity) {
      setRecommendation("No mission yet. Create your study plan.");
      return;
    }
    setRecommendationLoading(true);
    try {
      const response = await askTutor(
        `Give 3 short exam-prep recommendations for this planner state:\n${JSON.stringify(
          {
            goal: plannerState.form.goal,
            current: plannerState.form.currentScore,
            target: plannerState.form.targetScore,
            weaknesses: weaknessDashboard,
            probability,
            remainingDays: daysUntil(plannerState.form.examDate),
          },
          null,
          2,
        )}`,
        "You are Saidamin AI Planner. Keep it concise, supportive, and action-focused.",
        "en-US",
        { retries: 1, feature: "planner" },
      );
      setRecommendation(response.trim());
    } catch (error) {
      console.warn("Planner recommendations failed", error);
      setRecommendation(
        "Recommendations are unavailable right now. Continue with your next real mission task.",
      );
    } finally {
      setRecommendationLoading(false);
    }
  };

  if (loadBlocked)
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900"
      >
        <h2 className="font-bold">Your saved plan could not be loaded</h2>
        <p className="my-3">
          Reconnect and try again to restore your plan safely.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-amber-800 px-4 py-2 font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );

  if (!hydrated) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center rounded-[2rem] bg-[#F8FAFC] text-[#0F172A]">
        <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 text-sm font-black text-[#64748B]">
          <Loader2 className="animate-spin text-[#3F7D58]" size={18} />
          Loading saved planner
        </div>
      </div>
    );
  }

  if (view === "roadmap") {
    if (!hasPlannerActivity) {
      return (
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-[#F8FAFC] p-4 text-[#0F172A] sm:p-8">
          <button
            type="button"
            onClick={() => setView("today")}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-bold text-[#334155] transition hover:border-[#3F7D58] hover:text-[#3F7D58]"
          >
            <ArrowLeft size={16} />
            Back to Today
          </button>
          <section className="rounded-[1.75rem] border border-[#E2E8F0] bg-white p-8 text-center">
            <p className="text-2xl font-black text-[#0F172A]">
              No mission yet. Create your study plan.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#64748B]">
              Roadmap phases appear only after you create a real mission.
            </p>
            <button
              type="button"
              onClick={createMission}
              className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#3F7D58] px-6 text-sm font-black text-white transition hover:bg-[#356B4B]"
            >
              <Sparkles size={17} />
              Create study plan
            </button>
          </section>
        </div>
      );
    }

    const phases = buildRoadmapPhases(plannerState, weakest);
    return (
      <div className="mx-auto max-w-6xl rounded-[2rem] bg-[#F8FAFC] p-4 text-[#0F172A] sm:p-8">
        <button
          type="button"
          onClick={() => setView("today")}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-bold text-[#334155] transition hover:border-[#3F7D58] hover:text-[#3F7D58]"
        >
          <ArrowLeft size={16} />
          Back to Today
        </button>

        <header className="mb-10 max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#3F7D58]">
            Adaptive Roadmap
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-[#0F172A]">
            {modeConfig.label} {plannerState.form.currentScore} -&gt;{" "}
            {plannerState.form.targetScore}
          </h2>
          <p className="mt-4 text-base leading-7 text-[#64748B]">
            The roadmap uses your goal, exam date, available hours, completion
            history, and weakness intelligence. Daily schedules stay hidden
            until the day arrives.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          {phases.map((phase) => {
            const isCurrent = phase.state === "current";
            const isDone = phase.state === "done";
            return (
              <motion.article
                key={phase.phase}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-[1.5rem] border bg-white p-6",
                  isCurrent ? "border-[#3F7D58]" : "border-[#E2E8F0]",
                )}
              >
                <div className="mb-8 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748B]">
                      {phase.phase}
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-[#0F172A]">
                      {phase.title}
                    </h3>
                  </div>
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full",
                      isDone
                        ? "bg-[#ECFDF3] text-[#3F7D58]"
                        : isCurrent
                          ? "bg-[#3F7D58] text-white"
                          : "bg-[#F1F5F9] text-[#94A3B8]",
                    )}
                  >
                    {isDone ? (
                      <Check size={20} />
                    ) : isCurrent ? (
                      <Play size={18} fill="currentColor" />
                    ) : (
                      <Lock size={18} />
                    )}
                  </div>
                </div>
                <p className="mb-5 text-sm font-black text-[#3F7D58]">
                  {phase.status}
                </p>
                <div className="space-y-3">
                  {phase.weeks.map((week) => (
                    <div
                      key={week}
                      className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold text-[#334155]"
                    >
                      {week}
                    </div>
                  ))}
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === "activity" && activeTask) {
    const Icon = missionIcon(activeTask);
    const requiredSeconds = activeTask.minutes * 60;
    const elapsed = activeProgress?.elapsedSeconds || 0;
    const timerPercent = (elapsed / Math.max(requiredSeconds, 1)) * 100;
    const validation = getValidation(
      activeTask,
      activeActivity,
      activeProgress,
    );

    return (
      <div className="mx-auto max-w-5xl rounded-[2rem] bg-[#F8FAFC] p-4 text-[#0F172A] sm:p-8 lg:p-10">
        <button
          type="button"
          onClick={() => {
            setTimerRunning(false);
            setView("today");
          }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-bold text-[#334155] transition hover:border-[#3F7D58] hover:text-[#3F7D58]"
        >
          <ArrowLeft size={16} />
          Back to Today
        </button>

        <section className="rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#ECFDF3] text-[#3F7D58]">
                <Icon size={24} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#3F7D58]">
                  {activeTask.section}
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight">
                  {activeTask.label}
                </h1>
                <p className="mt-2 text-sm font-semibold text-[#64748B]">
                  {activeTask.focusReason}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-black text-[#0F172A]">
              {activeTask.scheduledWindow}
            </div>
          </div>

          <div className="mt-7 rounded-[1.5rem] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748B]">
                  Required study time
                </p>
                <p className="mt-1 text-2xl font-black">
                  {formatTimer(elapsed)} / {formatTimer(requiredSeconds)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTimerRunning((current) => !current)}
                disabled={elapsed >= requiredSeconds}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#3F7D58] px-5 text-sm font-black text-white transition hover:bg-[#356B4B] disabled:cursor-not-allowed disabled:bg-[#94A3B8]"
              >
                {timerRunning ? (
                  <Clock size={17} />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
                {elapsed >= requiredSeconds
                  ? "Time Reached"
                  : timerRunning
                    ? "Timer Running"
                    : "Start Timer"}
              </button>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
              <motion.div
                animate={{ width: `${timerPercent}%` }}
                className="h-full rounded-full bg-[#3F7D58]"
              />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6 sm:p-8">
          {generatingTaskId === activeTask.id && (
            <div className="flex min-h-64 items-center justify-center">
              <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4 text-sm font-black text-[#64748B]">
                <Loader2 className="animate-spin text-[#3F7D58]" size={18} />
                Saidamin AI is generating your personalized activity
              </div>
            </div>
          )}

          {activeActivity && activeProgress && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-black">{activeActivity.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748B]">
                  {activeActivity.instructions}
                </p>
              </div>

              {activeActivity.type === "quiz" && (
                <div className="space-y-5">
                  {(activeActivity.questions || []).map((question, index) => (
                    <div
                      key={question.id}
                      className="rounded-[1.25rem] border border-[#E2E8F0] bg-[#F8FAFC] p-5"
                    >
                      <p className="text-sm font-black text-[#0F172A]">
                        {index + 1}. {question.prompt}
                      </p>
                      <div className="mt-4 grid gap-2">
                        {question.options.map((option, optionIndex) => {
                          const selected =
                            activeProgress.quizAnswers[question.id] ===
                            optionIndex;
                          const submitted = activeProgress.submitted;
                          const correct =
                            submitted && question.answerIndex === optionIndex;
                          const wrong =
                            submitted &&
                            selected &&
                            question.answerIndex !== optionIndex;
                          return (
                            <button
                              key={option}
                              type="button"
                              disabled={submitted}
                              onClick={() =>
                                updateProgress(activeTask.id, {
                                  quizAnswers: {
                                    ...activeProgress.quizAnswers,
                                    [question.id]: optionIndex,
                                  },
                                })
                              }
                              className={cn(
                                "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                                correct
                                  ? "border-[#3F7D58] bg-[#ECFDF3] text-[#3F7D58]"
                                  : wrong
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : selected
                                      ? "border-[#3F7D58] bg-white text-[#0F172A]"
                                      : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#3F7D58]",
                              )}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      {activeProgress.submitted && (
                        <p className="mt-3 text-sm font-semibold text-[#64748B]">
                          {question.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={submitQuiz}
                    disabled={activeProgress.submitted}
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#3F7D58] bg-[#ECFDF3] px-5 text-sm font-black text-[#3F7D58] disabled:cursor-not-allowed disabled:border-[#E2E8F0] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
                  >
                    Submit Quiz
                  </button>
                </div>
              )}

              {activeActivity.type === "writing" && (
                <div className="space-y-4">
                  <div className="rounded-[1.25rem] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                    <p className="text-sm font-black text-[#0F172A]">Prompt</p>
                    <p className="mt-2 text-base leading-7 text-[#334155]">
                      {activeActivity.writingPrompt}
                    </p>
                  </div>
                  <textarea
                    value={activeProgress.writingText}
                    onChange={(event) =>
                      updateProgress(activeTask.id, {
                        writingText: event.target.value,
                        submitted: false,
                      })
                    }
                    className="min-h-64 w-full rounded-[1.25rem] border border-[#E2E8F0] bg-white p-4 text-sm leading-6 text-[#0F172A] outline-none focus:border-[#3F7D58] focus:ring-4 focus:ring-[#ECFDF3]"
                    placeholder="Write your answer here..."
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-[#64748B]">
                      {words(activeProgress.writingText).length} /{" "}
                      {activeActivity.minWords || 90} words
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        updateProgress(activeTask.id, { submitted: true })
                      }
                      className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#3F7D58] bg-[#ECFDF3] px-5 text-sm font-black text-[#3F7D58]"
                    >
                      Submit Writing
                    </button>
                  </div>
                </div>
              )}

              {activeActivity.type === "speaking" && (
                <div className="space-y-4">
                  <div className="rounded-[1.25rem] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                    <p className="text-sm font-black text-[#0F172A]">
                      Speaking prompt
                    </p>
                    <p className="mt-2 text-base leading-7 text-[#334155]">
                      {activeActivity.speakingPrompt}
                    </p>
                  </div>
                  <textarea
                    value={activeProgress.speakingNotes}
                    onChange={(event) =>
                      updateProgress(activeTask.id, {
                        speakingNotes: event.target.value,
                        submitted: false,
                      })
                    }
                    className="min-h-40 w-full rounded-[1.25rem] border border-[#E2E8F0] bg-white p-4 text-sm leading-6 text-[#0F172A] outline-none focus:border-[#3F7D58] focus:ring-4 focus:ring-[#ECFDF3]"
                    placeholder="After speaking, add short notes: what you said, where you hesitated, what to improve..."
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateProgress(activeTask.id, { submitted: true })
                    }
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#3F7D58] bg-[#ECFDF3] px-5 text-sm font-black text-[#3F7D58]"
                  >
                    Finish Speaking Exercise
                  </button>
                </div>
              )}

              {activeActivity.type === "flashcards" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {(activeActivity.flashcards || []).map((card) => {
                    const reviewed = activeProgress.reviewedCards.includes(
                      card.id,
                    );
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() =>
                          updateProgress(activeTask.id, {
                            reviewedCards: reviewed
                              ? activeProgress.reviewedCards
                              : [...activeProgress.reviewedCards, card.id],
                          })
                        }
                        className={cn(
                          "min-h-36 rounded-[1.25rem] border p-5 text-left transition",
                          reviewed
                            ? "border-[#3F7D58] bg-[#ECFDF3]"
                            : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#3F7D58]",
                        )}
                      >
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                          {reviewed ? "Answer" : "Question"}
                        </p>
                        <p className="mt-3 text-base font-black text-[#0F172A]">
                          {reviewed ? card.back : card.front}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 rounded-[1.25rem] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748B]">
                  Completion checks
                </p>
                <div className="mt-4 grid gap-2">
                  {activeActivity.successCriteria.map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2 text-sm font-semibold text-[#334155]"
                    >
                      <CheckCircle2
                        size={16}
                        className={
                          validation.ok ? "text-[#3F7D58]" : "text-[#94A3B8]"
                        }
                      />
                      {item}
                    </div>
                  ))}
                </div>
                {validationMessage && (
                  <p className="mt-4 text-sm font-bold text-rose-600">
                    {validationMessage}
                  </p>
                )}
                <button
                  type="button"
                  onClick={completeTask}
                  disabled={
                    completingTask || activeProgress?.status === "completed"
                  }
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#3F7D58] px-5 text-sm font-black text-white transition hover:bg-[#356B4B] sm:w-auto"
                >
                  <CheckCircle2 size={17} />
                  {completingTask
                    ? "Saving task�"
                    : activeProgress?.status === "completed"
                      ? "Task completed"
                      : "Complete Task"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl rounded-[2rem] bg-[#F8FAFC] p-4 text-[#0F172A] sm:p-8 lg:p-10">
      {validationMessage && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          {validationMessage}{" "}
          <button
            onClick={() => setValidationMessage("")}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </p>
      )}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#3F7D58]">
            Noviq AI Planner
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-[#0F172A] sm:text-3xl">
            Your mentor for today
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#334155] transition hover:border-[#3F7D58] hover:text-[#3F7D58]"
        >
          <Settings2 size={16} />
          Adjust Plan
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[#0F172A]">
                {modeConfig.label} {plannerState.form.currentScore} -&gt;{" "}
                {plannerState.form.targetScore}
              </h1>
              <p className="mt-2 text-sm font-semibold text-[#64748B]">
                {daysUntil(plannerState.form.examDate)} days remaining /
                weakest: {weakest.name}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-2xl font-black text-[#0F172A]">
                {journeyProgress}% Complete
              </p>
              <p className="text-sm font-semibold text-[#64748B]">
                Journey progress
              </p>
            </div>
          </div>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-[#E2E8F0]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${journeyProgress}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="h-full rounded-full bg-[#3F7D58]"
            />
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748B]">
                Success Probability
              </p>
              <p className="mt-2 text-4xl font-black text-[#0F172A]">
                {probability.current}%
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ECFDF3] text-[#3F7D58]">
              <Target size={23} />
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[#64748B]">
            Completing today's mission could raise this to{" "}
            <span className="font-black text-[#3F7D58]">
              {probability.afterMission}%
            </span>
            . Skipping today may lower it to {probability.ifSkip}%.
          </p>
          <div className="mt-4 rounded-2xl bg-[#F8FAFC] px-4 py-3 text-sm font-bold text-[#334155]">
            +30 min daily: {probability.extra30}%
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#ECFDF3]">
              <img
                src="/saidamin-avatar.jpg"
                alt="Saidamin AI"
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div>
              <p className="text-sm font-black text-[#0F172A]">Saidamin AI</p>
              <p className="mt-2 max-w-2xl text-base leading-7 text-[#475569]">
                {hasPlannerActivity
                  ? getCoachMessage(plannerState, weakest)
                  : "No mission yet. Create your study plan."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openRecommendations}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-sm font-black text-[#334155] transition hover:border-[#3F7D58] hover:text-[#3F7D58]"
          >
            <Sparkles size={16} />
            Recommendations
          </button>
        </div>
      </section>

      {plannerState.recoveryMode?.active && (
        <section className="mt-5 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={20} />
            <div>
              <p className="font-black">Recovery Mode Active</p>
              <p className="mt-1 text-sm font-semibold leading-6">
                {plannerState.recoveryMode.message}
              </p>
            </div>
          </div>
        </section>
      )}

      <main className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_0.85fr]">
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-2xl font-black text-[#0F172A]">
              Today's Mission
            </h3>
            <span className="rounded-full bg-[#ECFDF3] px-3 py-2 text-xs font-black text-[#3F7D58]">
              {completedTasks.length} / {plannerState.tasks.length} verified
            </span>
          </div>

          <div className="rounded-[1.75rem] border border-[#E2E8F0] bg-white">
            {plannerState.tasks.length === 0 ? (
              <div className="px-5 py-10 text-center sm:px-6">
                <p className="text-xl font-black text-[#0F172A]">
                  No mission yet. Create your study plan.
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#64748B]">
                  Planner tasks appear here only after you create a mission.
                </p>
                <button
                  type="button"
                  onClick={createMission}
                  className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#3F7D58] px-6 text-sm font-black text-white transition hover:bg-[#356B4B]"
                >
                  <Sparkles size={17} />
                  Create study plan
                </button>
              </div>
            ) : (
              plannerState.tasks.map((task, index) => {
                const Icon = missionIcon(task);
                const progress =
                  plannerState.taskProgress[task.id] || createProgress();
                const complete = progress.status === "completed";
                const elapsedPercent =
                  (progress.elapsedSeconds / Math.max(task.minutes * 60, 1)) *
                  100;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "border-[#E2E8F0] px-5 py-5 sm:px-6",
                      index !== plannerState.tasks.length - 1 && "border-b",
                      complete ? "bg-[#ECFDF3]" : "bg-white",
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                          complete
                            ? "bg-[#3F7D58] text-white"
                            : "bg-[#F8FAFC] text-[#3F7D58]",
                        )}
                      >
                        <AnimatePresence mode="wait">
                          {complete ? (
                            <motion.span
                              key="check"
                              initial={{ scale: 0.4, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                            >
                              <CheckCircle2 size={22} />
                            </motion.span>
                          ) : (
                            <motion.span
                              key="icon"
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                            >
                              <Icon size={22} />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-base font-black",
                            complete ? "text-[#3F7D58]" : "text-[#0F172A]",
                          )}
                        >
                          {task.label}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#64748B]">
                          {task.section} / {task.scheduledWindow}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-[#0F172A]">
                          {task.minutes} min
                        </p>
                        <p className="mt-1 text-sm font-black text-[#3F7D58]">
                          {task.xp} practice points
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E2E8F0]">
                        <motion.div
                          animate={{ width: `${elapsedPercent}%` }}
                          className="h-full rounded-full bg-[#3F7D58]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void openActivity(task)}
                        disabled={complete}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-xs font-black text-[#334155] transition hover:border-[#3F7D58] hover:text-[#3F7D58] disabled:cursor-not-allowed disabled:border-[#E2E8F0] disabled:text-[#94A3B8]"
                      >
                        {complete
                          ? "Completed"
                          : progress.status === "inProgress"
                            ? "Continue Activity"
                            : "Open Activity"}
                        {!complete && <ChevronRight size={15} />}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748B]">
              Today's Goal
            </p>
            <p className="mt-2 text-3xl font-black text-[#0F172A]">
              {totalMinutes} min
            </p>
            <p className="mt-2 text-sm font-semibold text-[#64748B]">
              Progress: {completedMinutes} / {totalMinutes} min
            </p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
              <motion.div
                animate={{
                  width: `${(completedMinutes / Math.max(totalMinutes, 1)) * 100}%`,
                }}
                transition={{ duration: 0.35 }}
                className="h-full rounded-full bg-[#3F7D58]"
              />
            </div>
            <button
              type="button"
              onClick={startMission}
              disabled={
                plannerState.tasks.length > 0 &&
                completedTasks.length === plannerState.tasks.length
              }
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#3F7D58] px-5 text-sm font-black text-white transition hover:bg-[#356B4B] disabled:cursor-not-allowed disabled:bg-[#94A3B8]"
            >
              <Play size={17} fill="currentColor" />
              {plannerState.tasks.length ? "Start Mission" : "Create Mission"}
            </button>
          </section>

          <section className="rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748B]">
                  Weakness Intelligence
                </p>
                <h3 className="mt-1 text-xl font-black">Your Weakest Areas</h3>
              </div>
              <Brain className="text-[#3F7D58]" size={22} />
            </div>
            <div className="space-y-3">
              {hasPlannerActivity ? (
                weaknessDashboard.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3"
                  >
                    <p className="text-sm font-black text-[#0F172A]">
                      {index + 1}. {item.label}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#64748B]">
                      {item.section}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold text-[#64748B]">
                  Not enough activity yet. Complete your first mission.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748B]">
                Achievements
              </p>
              <Award className="text-[#3F7D58]" size={21} />
            </div>
            <div className="grid gap-2">
              {[
                ["streak-7", "7 Day Streak"],
                ["vocabulary-master", "Vocabulary Master"],
                ["listening-warrior", "Listening Warrior"],
                ["writing-specialist", "Writing Specialist"],
                ["fast-improver", "Fast Improver"],
                ["mission-champion", "Mission Champion"],
              ].map(([id, title]) => {
                const unlocked = plannerState.achievements.some(
                  (achievement) => achievement.id === id,
                );
                return (
                  <div
                    key={id}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-4 py-3",
                      unlocked
                        ? "border-[#3F7D58] bg-[#ECFDF3]"
                        : "border-[#E2E8F0] bg-[#F8FAFC]",
                    )}
                  >
                    {unlocked ? (
                      <Trophy size={17} className="text-[#3F7D58]" />
                    ) : (
                      <Lock size={17} className="text-[#94A3B8]" />
                    )}
                    <p
                      className={cn(
                        "text-sm font-black",
                        unlocked ? "text-[#3F7D58]" : "text-[#64748B]",
                      )}
                    >
                      {title}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </main>

      {plannerState.daily.reflection && (
        <section className="mt-6 rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ECFDF3] text-[#3F7D58]">
              <CheckCircle2 size={23} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748B]">
                Today Summary
              </p>
              <h3 className="mt-1 text-xl font-black text-[#0F172A]">
                Daily AI Reflection
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#475569]">
                {plannerState.daily.reflection.tasksCompleted} tasks completed,{" "}
                {plannerState.daily.reflection.minutesStudied} minutes studied,
                +{plannerState.daily.reflection.xpEarned} practice points
                earned. Strongest area:{" "}
                {plannerState.daily.reflection.strongestArea}. Needs
                improvement: {plannerState.daily.reflection.needsImprovement}.{" "}
                {plannerState.daily.reflection.recommendation}
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={activateRecoveryMode}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white px-5 text-sm font-black text-[#334155] transition hover:border-[#3F7D58] hover:text-[#3F7D58]"
        >
          <RefreshCw size={17} />
          Recovery Mode
        </button>
        <button
          type="button"
          onClick={() => setView("roadmap")}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white px-5 text-sm font-black text-[#334155] transition hover:border-[#3F7D58] hover:text-[#3F7D58]"
        >
          View Full Roadmap
          <ChevronRight size={17} />
        </button>
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="noviq-modal-backdrop z-[190]"
          >
            <div className="noviq-modal-positioner noviq-modal-lg">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="noviq-modal-panel CustomScrollbar rounded-[1.75rem] border border-[#E2E8F0] bg-[#F8FAFC] p-5 text-[#0F172A] sm:p-6"
              >
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#3F7D58]">
                      Plan Settings
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Student controls the goal
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-full border border-[#E2E8F0] bg-white p-2 text-[#64748B] hover:text-[#0F172A]"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(Object.keys(EXAM_OPTIONS) as ExamMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => switchMode(mode)}
                      className={cn(
                        "min-h-11 rounded-2xl border px-3 text-xs font-black transition",
                        plannerState.form.mode === mode
                          ? "border-[#3F7D58] bg-[#ECFDF3] text-[#3F7D58]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]",
                      )}
                    >
                      {EXAM_OPTIONS[mode].label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      Goal
                    </span>
                    <input
                      value={plannerState.form.goal}
                      onChange={(event) =>
                        rebuildWithForm({ goal: event.target.value })
                      }
                      className={lightInput}
                    />
                  </label>
                  {(plannerState.form.mode === "school" ||
                    plannerState.form.mode === "entrance") && (
                    <label>
                      <span className="mb-2 block text-xs font-black text-[#64748B]">
                        Subject / Exam Area
                      </span>
                      <input
                        value={plannerState.form.schoolSubject}
                        onChange={(event) =>
                          rebuildWithForm({ schoolSubject: event.target.value })
                        }
                        className={lightInput}
                      />
                    </label>
                  )}
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      Current Score
                    </span>
                    <input
                      type="number"
                      value={plannerState.form.currentScore}
                      min={modeConfig.min}
                      max={modeConfig.max}
                      step={modeConfig.step}
                      onChange={(event) =>
                        rebuildWithForm({ currentScore: event.target.value })
                      }
                      className={lightInput}
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      Target Score
                    </span>
                    <input
                      type="number"
                      value={plannerState.form.targetScore}
                      min={modeConfig.min}
                      max={modeConfig.max}
                      step={modeConfig.step}
                      onChange={(event) =>
                        rebuildWithForm({ targetScore: event.target.value })
                      }
                      className={lightInput}
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      Exam Date
                    </span>
                    <input
                      type="date"
                      value={plannerState.form.examDate}
                      onChange={(event) =>
                        rebuildWithForm({ examDate: event.target.value })
                      }
                      className={lightInput}
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      Daily Study Hours
                    </span>
                    <input
                      type="number"
                      value={plannerState.form.hoursPerDay}
                      min={0.5}
                      max={12}
                      step={0.5}
                      onChange={(event) =>
                        rebuildWithForm({ hoursPerDay: event.target.value })
                      }
                      className={lightInput}
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      Days / Week
                    </span>
                    <input
                      type="number"
                      value={plannerState.form.daysPerWeek}
                      min={1}
                      max={7}
                      step={1}
                      onChange={(event) =>
                        rebuildWithForm({ daysPerWeek: event.target.value })
                      }
                      className={lightInput}
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      Energy
                    </span>
                    <select
                      value={plannerState.form.energyProfile}
                      onChange={(event) =>
                        rebuildWithForm({
                          energyProfile: event.target.value as EnergyProfile,
                        })
                      }
                      className={lightInput}
                    >
                      <option value="morning">Morning person</option>
                      <option value="balanced">Balanced</option>
                      <option value="night">Night person</option>
                    </select>
                  </label>
                </div>

                <label className="mt-5 block">
                  <span className="mb-2 block text-xs font-black text-[#64748B]">
                    Weak Areas <span className="text-rose-600">*</span>
                  </span>
                  <input
                    ref={weakAreasInputRef}
                    required
                    aria-invalid={weakAreasInvalid}
                    value={plannerState.form.weakTopics}
                    onChange={(event) =>
                      rebuildWithForm({ weakTopics: event.target.value })
                    }
                    placeholder="grammar mistakes, algebra functions, listening maps"
                    className={cn(
                      lightInput,
                      weakAreasInvalid &&
                        "border-rose-400 focus:border-rose-500 focus:ring-rose-100",
                    )}
                  />
                  {weakAreasInvalid && (
                    <p className="mt-2 text-xs font-bold text-rose-600">
                      {planValidationMessage}
                    </p>
                  )}
                </label>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {modeConfig.sections.map((section) => (
                    <label key={section.name}>
                      <span className="mb-2 block text-xs font-black text-[#64748B]">
                        {section.name}
                      </span>
                      <input
                        type="number"
                        value={
                          plannerState.form.sectionScores[section.name] || ""
                        }
                        step={plannerState.form.mode === "ielts" ? 0.5 : 1}
                        onChange={(event) =>
                          updateSectionScore(section.name, event.target.value)
                        }
                        className={lightInput}
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      plannerState.tasks.length
                        ? savePlanSettings()
                        : createMission()
                    }
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#3F7D58] px-6 text-sm font-black text-white hover:bg-[#356B4B]"
                  >
                    {plannerState.tasks.length
                      ? "Save Plan"
                      : "Create Study Plan"}
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {recommendationsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="noviq-modal-backdrop z-[195]"
          >
            <div className="noviq-modal-positioner noviq-modal-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="noviq-modal-panel CustomScrollbar relative rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6 text-[#0F172A]"
              >
                <button
                  type="button"
                  onClick={() => setRecommendationsOpen(false)}
                  className="absolute right-5 top-5 rounded-full border border-[#E2E8F0] bg-white p-2 text-[#64748B] hover:text-[#0F172A]"
                >
                  <X size={18} />
                </button>
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#ECFDF3]">
                    <img
                      src="/saidamin-avatar.jpg"
                      alt="Saidamin AI"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#3F7D58]">
                      Saidamin AI
                    </p>
                    <h3 className="text-2xl font-black">
                      Exam recommendations
                    </h3>
                  </div>
                </div>
                <div className="mt-6 rounded-[1.25rem] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  {recommendationLoading ? (
                    <div className="flex items-center gap-3 text-sm font-black text-[#64748B]">
                      <Loader2
                        className="animate-spin text-[#3F7D58]"
                        size={18}
                      />
                      Generating recommendations
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-7 text-[#334155]">
                      {recommendation ||
                        (hasPlannerActivity
                          ? `Focus on ${weaknessDashboard[0]?.label || weakest.name}, complete today's verified activity, and review each mistake before the next mission.`
                          : "No mission yet. Create your study plan.")}
                    </p>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {celebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="noviq-modal-backdrop z-[210]"
          >
            <div className="noviq-modal-positioner noviq-modal-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="noviq-modal-panel CustomScrollbar relative rounded-[1.75rem] border border-[#E2E8F0] bg-white p-6 text-center text-[#0F172A] sm:p-8"
              >
                <ConfettiBurst large={celebration.type === "mission"} />
                <div className="relative z-10 mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#ECFDF3] text-[#3F7D58]">
                  {celebration.type === "mission" ? (
                    <Trophy size={32} />
                  ) : (
                    <Zap size={30} />
                  )}
                </div>
                <h3 className="relative z-10 mt-5 text-3xl font-black">
                  {celebration.title}
                </h3>
                <p className="relative z-10 mt-2 text-sm font-semibold text-[#64748B]">
                  {celebration.subtitle}
                </p>
                <div className="relative z-10 mt-5 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
                  <p className="text-2xl font-black text-[#3F7D58]">
                    +{celebration.xp} practice points
                  </p>
                  {celebration.bonusXp ? (
                    <p className="mt-1 text-sm font-bold text-[#64748B]">
                      +1 Day Streak / Progress Updated
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-bold text-[#64748B]">
                      Progress Updated
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCelebration(null)}
                  className="relative z-10 mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#3F7D58] px-5 text-sm font-black text-white hover:bg-[#356B4B]"
                >
                  Continue
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
