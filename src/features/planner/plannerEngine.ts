import { getLocalDayKey } from "@/src/lib/progressMath";
import {
  DEFAULT_EXAM_DATE,
  EXAM_OPTIONS,
} from "@/src/features/planner/plannerConfig";
import type {
  DailyReflection,
  EnergyProfile,
  ExamMode,
  FocusSection,
  GeneratedActivity,
  MissionTask,
  PlannerForm,
  PlannerState,
  RecoveryMode,
  TaskKind,
  TaskProgress,
  WeaknessEvent,
} from "@/src/features/planner/plannerTypes";

export const parseNumber = (value: string | number | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const words = (value: string) => value.trim().split(/\s+/).filter(Boolean);

export const getWeakTopicList = (value: string) =>
  value
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);

export const hasRequiredWeakTopics = (value: string) =>
  getWeakTopicList(value).length > 0;

export const initialSectionScores = (mode: ExamMode) =>
  Object.fromEntries(
    EXAM_OPTIONS[mode].sections.map((section) => [
      section.name,
      section.current,
    ]),
  );

export const buildDefaultForm = (): PlannerForm => ({
  mode: "ielts",
  goal: "IELTS 7.5",
  currentScore: "5.5",
  targetScore: "7.5",
  examDate: DEFAULT_EXAM_DATE,
  hoursPerDay: "3",
  daysPerWeek: "6",
  energyProfile: "morning",
  schoolSubject: "Mathematics",
  weakTopics: "",
  sectionScores: initialSectionScores("ielts"),
});

export const daysUntil = (date: string) => {
  const target = new Date(`${date}T12:00:00`);
  if (Number.isNaN(target.getTime())) return 30;
  return Math.max(1, Math.ceil((target.getTime() - Date.now()) / 86400000));
};

export const dayDistance = (fromKey: string, toKey: string) => {
  const from = new Date(`${fromKey}T12:00:00`);
  const to = new Date(`${toKey}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
};

export const normalizeWeights = (
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

export const buildSections = (
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

export const getDifficulty = (form: PlannerForm): MissionTask["difficulty"] => {
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

export const getTaskKind = (mode: ExamMode, section: string): TaskKind => {
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

export const getTaskLabel = (
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

export const getScheduledWindow = (
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

export const isListeningSection = (section: string) =>
  section.toLowerCase().includes("listening");
export const isSpeakingSection = (section: string) =>
  section.toLowerCase().includes("speaking");

export const getMissionBudget = (form: PlannerForm, recoveryMode?: RecoveryMode) => {
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

export const getMissionTaskCount = (form: PlannerForm, budget: number) => {
  const availableMinutes = Math.round(parseNumber(form.hoursPerDay, 1) * 60);
  if (budget <= 25 || availableMinutes <= 30) return 3;
  if (budget <= 40 || availableMinutes <= 60) return 4;
  if (budget <= 55 || availableMinutes <= 120) return 5;
  return 6;
};

export const getRecommendedTaskMinutes = (
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

export const getMinimumTaskMinutes = (section: string, kind: TaskKind) => {
  if (isSpeakingSection(section) || kind === "speaking") return 5;
  if (isListeningSection(section)) return 6;
  if (kind === "flashcards") return 6;
  return 8;
};

export const getWritingWordTarget = (
  minutes: number,
  difficulty: MissionTask["difficulty"],
) => {
  const cap =
    difficulty === "advanced" ? 120 : difficulty === "improving" ? 95 : 75;
  return clamp(Math.round(minutes * 8), 45, cap);
};

export const buildTodayMission = (
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

export const buildPlanKey = (
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

export const createProgress = (): TaskProgress => ({
  status: "notStarted",
  elapsedSeconds: 0,
  quizAnswers: {},
  reviewedCards: [],
  writingText: "",
  speakingNotes: "",
  submitted: false,
  mistakes: [],
});

export const normalizeTaskProgress = (
  progress?: Partial<TaskProgress> & { status?: string },
): TaskProgress => {
  const base = createProgress();
  const merged = { ...base, ...(progress || {}) };
  const rawStatus = String(progress?.status || base.status).toLowerCase();
  return {
    ...merged,
    elapsedSeconds: Number.isFinite(merged.elapsedSeconds) ? Math.max(0, Math.floor(merged.elapsedSeconds)) : 0,
    status:
      rawStatus === "completed"
        ? "completed"
        : rawStatus === "in_progress" || rawStatus === "inprogress"
          ? "inProgress"
          : "notStarted",
  };
};

export const buildInitialPlannerState = (): PlannerState => {
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

export const normalizePlannerState = (
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
            raw.recoveryMode?.active && missedSinceOpen === 0 && raw.recoveryMode.message
              ? raw.recoveryMode.message
              : missedDays >= 3
              ? `We noticed ${missedDays} missed study days. Your roadmap has been adjusted and your target is still achievable.`
              : raw.recoveryMode?.message ||
                "Your roadmap has been adjusted for today.",
          messageLocale: raw.recoveryMode?.active && missedSinceOpen === 0 && raw.recoveryMode.message
            ? raw.recoveryMode.messageLocale
            : "en" as const,
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

export const getCoachMessage = (state: PlannerState, weakest: FocusSection) => {
  if (state.recoveryMode?.active) return state.recoveryMode.message;
  if (state.form.mode === "school") {
    return `Today we will focus on ${weakest.name.toLowerCase()} because it is currently the biggest gap in ${state.form.schoolSubject}. Completing today's mission keeps the plan realistic.`;
  }
  if (state.form.mode === "entrance") {
    return `Today we will focus on ${weakest.name.toLowerCase()} for ${state.form.schoolSubject} entrance prep. Completing today's mission keeps your university exam plan realistic.`;
  }
  return `Today we will focus on ${weakest.name} because it is currently your weakest skill. Completing today's mission will move you closer to your target score.`;
};

export const getCompletionRate = (state: PlannerState) => {
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

export const getWeaknessDashboard = (
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

export const buildRoadmapPhases = (state: PlannerState, weakest: FocusSection) => {
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

export const extractJson = (text: string) => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  return JSON.parse(candidate);
};

export const getExamTaskScope = (form: PlannerForm) => {
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

export const fallbackActivity = (
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

export const normalizeActivity = (
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

export const getValidation = (
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
  const elapsedSeconds = Number.isFinite(progress.elapsedSeconds) ? Math.max(0, Math.floor(progress.elapsedSeconds)) : 0;
  if (elapsedSeconds < requiredSeconds)
    reasons.push(
      `Study timer needs ${Math.ceil((requiredSeconds - elapsedSeconds) / 60)} more min.`,
    );

  if (activity.type === "quiz") {
    const questions = activity.questions || [];
    const answered = questions.filter(
      (question) => Number.isInteger(progress.quizAnswers[question.id]) &&
        progress.quizAnswers[question.id] >= 0 &&
        progress.quizAnswers[question.id] < question.options.length,
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

export const buildReflection = (
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
    recommendation: `Review ${needsImprovement} tomorrow and use your next assessment to check improvement.`,
  };
};

export const calculateNewAchievements = (state: PlannerState) => {
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
    "Completed at least six activities with strong mission completion.",
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

