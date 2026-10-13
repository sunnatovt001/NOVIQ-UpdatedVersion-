import { PlannerFlashcardActivity } from "@/src/features/planner/PlannerFlashcardActivity";
import { PlannerRoadmapCards } from "@/src/features/planner/PlannerRoadmapCards";
import { PlannerWritingActivity, PlannerSpeakingActivity } from "@/src/features/planner/PlannerTextActivities";
import { classifyPlannerActivityError, getPlannerActivityErrorMessage, type PlannerActivityErrorKind } from "@/src/features/planner/plannerActivityErrors";
import { PlannerQuizActivity } from "@/src/features/planner/PlannerQuizActivity";
import { loadLocalData, trySaveLocalData as saveLocalData } from "@/src/lib/localStore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getRecoveryGuidance } from "@/src/features/planner/recoveryGuidance";
import { localizePlannerValidation } from "@/src/features/planner/plannerValidationCopy";
import { formatTimer } from "@/src/features/planner/plannerTimer";
import { PlannerCompletionDialog } from "@/src/features/planner/PlannerCompletionDialog";
import { PlannerRecommendationsDialog } from "@/src/features/planner/PlannerRecommendationsDialog";
import { doc, onSnapshot } from "firebase/firestore";
import {
  AlertTriangle, ArrowLeft, Award, BookOpen, Brain, Calendar, Check,
  CheckCircle2, ChevronRight, Clock, Flame, Headphones, Loader2, Lock,
  Mic2, PenLine, Play, RefreshCw, Settings2, Sparkles, Target, Trophy, X, Zap,
} from "lucide-react";
import { useAuth } from "@/src/contexts/AuthContext";
import { askTutor } from "@/src/lib/gemini";
import { db } from "@/src/lib/firebase";
import { trackUserEvent } from "@/src/lib/analytics";
import { getLocalDayKey, persistStudySession, startStudySession } from "@/src/lib/progress";
import { cn } from "@/src/lib/utils";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { writeDocWithQueue } from "@/src/lib/offlineSync";
import { withDeadline } from "@/src/lib/asyncRequest";
import { isReadOnlyAudit } from "@/src/lib/auditMode";
import { validateActivityResponse } from "@/src/lib/plannerActivity";
import { missionCompletion } from "@/src/lib/activityEvidence";
import { useUserActivityMetrics } from "@/src/lib/useUserActivityMetrics";
import type {
  Celebration,
  CompletedTaskRecord,
  DailyReflection,
  ExamMode,
  FocusSection,
  GeneratedActivity,
  MissionTask,
  PlannerForm,
  PlannerState,
  PlannerView,
  RecoveryMode,
  TaskKind,
  TaskProgress,
  WeaknessEvent,
} from "@/src/features/planner/plannerTypes";
import { EXAM_OPTIONS } from "@/src/features/planner/plannerConfig";
import { PlannerSettingsDialog } from "@/src/features/planner/PlannerSettingsDialog";
import { useLocale } from "@/src/contexts/LocaleContext";
import type { TutorLanguage } from "@/src/features/tutor/tutorCopy";
import {
  formatPlannerText,
  getPlannerCopy,
  localizePlannerFocusReason,
  localizePlannerSection,
  localizePlannerTaskLabel,
  localizeRoadmapPhases,
} from "@/src/features/planner/plannerCopy";

import {
  words,
  getWeakTopicList,
  hasRequiredWeakTopics,
  initialSectionScores,
  daysUntil,
  buildSections,
  buildTodayMission,
  buildPlanKey,
  createProgress,
  normalizeTaskProgress,
  buildInitialPlannerState,
  normalizePlannerState,
  getCoachMessage,
  getWeaknessDashboard,
  buildRoadmapPhases,
  extractJson,
  getExamTaskScope,
  normalizeActivity,
  getValidation as validatePlannerActivity,
  buildReflection,
  calculateNewAchievements,
} from "@/src/features/planner/plannerEngine";

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


export const Planner = () => {
  const { locale, t } = useLocale();
  const getValidation = (...args: Parameters<typeof validatePlannerActivity>) => {
    const result = validatePlannerActivity(...args);
    return result;
  };
  const plannerLanguage: TutorLanguage =
    locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const pc = getPlannerCopy(locale);
  const formatCopy = (template: string, values: Record<string, string | number>) =>
    formatPlannerText(template, values);
  const { user, profile } = useAuth();
  const [plannerState, setPlannerState] = useState<PlannerState>(() =>
    buildInitialPlannerState(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const [loadBlocked, setLoadBlocked] = useState(false);
  const [view, setView] = useState<PlannerView>("today");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [recommendation, setRecommendation] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationFailed, setRecommendationFailed] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [generatingTaskId, setGeneratingTaskId] = useState<string | null>(null);
  const [activityErrorKind, setActivityError] = useState<PlannerActivityErrorKind | "">("");
  const activityError = activityErrorKind ? getPlannerActivityErrorMessage(activityErrorKind, locale) : "";
  const [startingTimer, setStartingTimer] = useState(false);
  const startingTimerRef = useRef(false);
  const activityViewRef = useRef({ taskId: activeTaskId, view });
  activityViewRef.current = { taskId: activeTaskId, view };
  const [timerRunning, setTimerRunning] = useState(false);
  const [validationFeedback, setValidationMessage] = useState<"" | { copy: keyof ReturnType<typeof getPlannerCopy>; values?: Record<string, string | number> } | { requirements: string[] } | { loadError: true }>("");
  const validationMessage = validationFeedback === "" ? ""
    : "requirements" in validationFeedback ? validationFeedback.requirements.map(reason => localizePlannerValidation(reason, locale)).join(" ")
    : "loadError" in validationFeedback ? t("planner.loadErrorBody")
    : formatCopy(pc[validationFeedback.copy], validationFeedback.values || {});
  const [planValidationKey, setPlanValidationMessage] = useState<"" | "weakAreasRequired">("");
  const planValidationMessage = planValidationKey ? pc[planValidationKey] : "";
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  useBodyScrollLock(
    settingsOpen,
  );
  const cloudSaveRef = useRef<number | undefined>(undefined);
  const lastCloudPlannerStateRef = useRef("");
  const plannerLatestRef = useRef(plannerState);
  plannerLatestRef.current = plannerState;
  const plannerDirtyRef = useRef(false);
  const openingTaskRef = useRef(false);
  const recoveryRequestRef = useRef(false);
  const recoveryGenerationRef = useRef(0);
  useEffect(() => {
    recoveryGenerationRef.current += 1;
    recoveryRequestRef.current = false;
    return () => { recoveryGenerationRef.current += 1; };
  }, [user?.uid]);
  const weakAreasInputRef = useRef<HTMLInputElement>(null);
  const studyReceiptsRef = useRef<Record<string, string>>({});
  const completingTaskRef = useRef(false);
  const completionScope = JSON.stringify([user?.uid, plannerState.missionDate, plannerState.lastPlanKey, plannerState.form]);
  const completionScopeRef = useRef(completionScope);
  completionScopeRef.current = completionScope;
  const completionGenerationRef = useRef(0);
  useEffect(() => {
    completionGenerationRef.current += 1;
    completingTaskRef.current = false;
    setCompletingTask(false);
    startingTimerRef.current = false;
    setStartingTimer(false);
    setTimerRunning(false);
    openingTaskRef.current = false;
    setGeneratingTaskId(null);
    setActivityError("");
    return () => { completionGenerationRef.current += 1; };
  }, [completionScope]);
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
  const sharedMetrics = useUserActivityMetrics(user?.uid);
  const missionPercent = missionCompletion(sharedMetrics.missionTotal, sharedMetrics.missionCompleted);
  const missionEvidence = { percent: missionPercent, total: sharedMetrics.missionTotal, completed: sharedMetrics.missionCompleted };
  const recommendationScope = JSON.stringify([user?.uid, locale, plannerState.missionDate, plannerState.lastPlanKey, plannerState.form, weaknessDashboard, missionEvidence]);
  const recommendationScopeRef = useRef(recommendationScope);
  recommendationScopeRef.current = recommendationScope;
  const recommendationRequestRef = useRef<string | null>(null);
  const recommendationCacheRef = useRef("");
  const recommendationGenerationRef = useRef(0);
  useEffect(() => {
    recommendationGenerationRef.current += 1;
    recommendationRequestRef.current = null;
    recommendationCacheRef.current = "";
    setRecommendation(""); setRecommendationLoading(false); setRecommendationFailed(false);
    return () => { recommendationGenerationRef.current += 1; };
  }, [recommendationScope]);
  const journeyProgress = missionPercent ?? 0;
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
    const loadTimer = window.setTimeout(() => {
      if (!active) return;
      setLoadBlocked(!cached);
      setValidationMessage({ loadError: true });
      setHydrated(true);
      console.error("Planner state listener timed out");
    }, 15000);
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid, "planner", "state"),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active) return;
        if (!cached && snapshot.metadata.fromCache && !snapshot.exists())
          return;
        window.clearTimeout(loadTimer);
        setLoadBlocked(false);
        setValidationMessage("");
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
        window.clearTimeout(loadTimer);
        console.error("Planner cloud load failed", error);
        if (active) {
          if (!cached) {
            setLoadBlocked(true);
            lastCloudPlannerStateRef.current = JSON.stringify(
              plannerLatestRef.current,
            );
          }
          setValidationMessage(
            { copy: "cloudSavedOffline" },
          );
          setHydrated(true);
        }
      },
    );

    return () => {
      active = false;
      window.clearTimeout(loadTimer);
      unsubscribe();
    };
  }, [user?.uid, loadRevision]);

  useEffect(() => {
    if (!hydrated || loadBlocked || isReadOnlyAudit) return;
    if (!user) return;
    const plannerStateJson = JSON.stringify(plannerState);
    if (plannerStateJson === lastCloudPlannerStateRef.current) return;
    let active = true;
    plannerDirtyRef.current = true;
    const savedOnDevice = saveLocalData(`noviq-planner-${user.uid}`, {
        state: plannerState,
        dirty: true,
      });
    if (!savedOnDevice)
      setValidationMessage(
        { copy: "storageUnavailable" },
      );

    if (cloudSaveRef.current) window.clearTimeout(cloudSaveRef.current);
    cloudSaveRef.current = window.setTimeout(() => {
      writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "planner", "state"],
        data: { state: plannerState, updatedAt: new Date().toISOString() },
        merge: true,
      }).catch((error) => {
        if (!active) return;
        console.warn("Planner cloud sync failed", error);
        setValidationMessage(
          { copy: savedOnDevice ? "cloudRetrySaved" : "cloudRetryUnsaved" },
        );
      });
    }, 1200);
    return () => {
      active = false;
      if (cloudSaveRef.current) window.clearTimeout(cloudSaveRef.current);
    };
  }, [plannerState, hydrated, loadBlocked, user]);

  useEffect(
    () => () => {
      if (cloudSaveRef.current) window.clearTimeout(cloudSaveRef.current);
      if (user && plannerDirtyRef.current && !isReadOnlyAudit)
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
      "weakAreasRequired",
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
      `Write every user-facing JSON string in ${plannerLanguage}. Keep the required JSON property names in English.`,
      "Use this JSON shape: { title, instructions, successCriteria, questions, writingPrompt, speakingPrompt, flashcards, minWords }.",
      "For quiz: questions must have prompt, options, answerIndex, explanation, weaknessTag.",
      "For flashcards: flashcards must have front, back, weaknessTag.",
    ].join("\n");

      const response = await withDeadline(askTutor(
        `Create the activity for this student context:\n${JSON.stringify(context, null, 2)}`,
        system,
        plannerLanguage,
        { retries: 0, feature: "planner" },
      ), 135000);
      const parsed = extractJson(response);
      validateActivityResponse(task.kind, parsed);
      return { ...normalizeActivity(
        task,
        plannerState.form,
        parsed,
        weaknessLabels,
      ), origin: "ai" as const };
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
    setActiveTaskId(task.id);
    setView("activity");
    if (plannerState.activities[task.id]) { openingTaskRef.current = false; return; }
    setActivityError("");
    setGeneratingTaskId(task.id);
    const generation = completionGenerationRef.current;
    const isCurrent = () => generation === completionGenerationRef.current && completionScope === completionScopeRef.current;
    try {
      const activity = await generateActivity(task);
      if (!isCurrent()) return;
      setPlannerState((current) => ({ ...current, activities: { ...current.activities, [task.id]: activity } }));
    } catch (error) {
      if (!isCurrent()) return;
      setActivityError(classifyPlannerActivityError(error));
    } finally {
      if (isCurrent()) {
        openingTaskRef.current = false;
        setGeneratingTaskId(null);
      }
    }
  };

  const toggleTaskTimer = async () => {
    if (timerRunning) { setTimerRunning(false); return; }
    if (!activeTask || !activeActivity || startingTimerRef.current) return;
    const task = activeTask;
    const generation = completionGenerationRef.current;
    const isCurrent = () => generation === completionGenerationRef.current && completionScope === completionScopeRef.current;
    startingTimerRef.current = true;
    setStartingTimer(true);
    setValidationMessage("");
    try {
      const sessionId = await withDeadline(startStudySession(
        task.kind === "quiz"
          ? "quiz"
          : task.kind === "flashcards"
            ? "revision"
            : "focus",
        `planner-${task.id}`,
        false,
        () => {
          if (!isCurrent() || activityViewRef.current.taskId !== task.id || activityViewRef.current.view !== "activity") return;
          if (plannerState.taskProgress[task.id]?.elapsedSeconds > 0) {
            updateProgress(task.id, { elapsedSeconds: 0 });
            setValidationMessage(
              { copy: "timerExpired" },
            );
          }
        },
      ), 15000);
      if (!isCurrent()) return;
      studyReceiptsRef.current[task.id] = sessionId;
      if (activityViewRef.current.taskId !== task.id || activityViewRef.current.view !== "activity") return;
      updateProgress(task.id, { status: "inProgress" });
      setTimerRunning(true);
    } catch (error) {
      if (!isCurrent() || activityViewRef.current.taskId !== task.id || activityViewRef.current.view !== "activity") return;
      setValidationMessage({ copy: "timerStartFailed" });
    } finally {
      if (isCurrent()) { startingTimerRef.current = false; setStartingTimer(false); }
    }
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
    if ((activeActivity.questions || []).some(question =>
      !Number.isInteger(activeProgress.quizAnswers[question.id]) ||
      activeProgress.quizAnswers[question.id] < 0 ||
      activeProgress.quizAnswers[question.id] >= question.options.length
    )) {
      setValidationMessage({ requirements: ["Answer every quiz question."] });
      return;
    }
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
        ? { copy: "quizSubmittedScore", values: { score: validation.score } }
        : { copy: "quizSubmitted" },
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
      setValidationMessage({ requirements: validation.reasons });
      return;
    }

    const alreadyComplete = activeProgress.status === "completed";
    if (alreadyComplete) return;
    const generation = completionGenerationRef.current;
    const isCurrent = () => generation === completionGenerationRef.current && completionScope === completionScopeRef.current;

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
        if (!isCurrent()) return;
      } catch (error) {
        if (!isCurrent()) return;
        setValidationMessage({ copy: "taskSaveFailed" });
        return;
      } finally {
        if (isCurrent()) {
          completingTaskRef.current = false;
          setCompletingTask(false);
        }
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
          title: pc.dailyMissionCompleted,
          subtitle: pc.dailyMissionSubtitle,
          xp: activeTask.xp,
          bonusXp: 0,
        }
      : {
          type: "task",
          title: pc.greatJob,
          subtitle: formatCopy(pc.taskCompletedSubtitle, {
            task: localizePlannerTaskLabel(activeTask, plannerState.form, locale),
          }),
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
        if (isCurrent()) setValidationMessage({ copy: "eventSyncFailed" });
      });
    }

    if (nextStateForReflection.daily.reflection) {
      setRecommendation(nextStateForReflection.daily.reflection.recommendation);
    }
  };

  const activateRecoveryMode = async () => {
    if (recoveryRequestRef.current) return;
    if (!plannerState.tasks.length) {
      setSettingsOpen(true);
      return;
    }
    recoveryRequestRef.current = true;
    const generation = recoveryGenerationRef.current;
    const adjustedAt = new Date().toISOString();
    let recoveryPlanKey = "";
    setTimerRunning(false);
    setValidationMessage("");
    setPlannerState((current) => {
      const recoveryMode: RecoveryMode = {
        active: true,
        missedDays: Math.max(1, current.daily.missedDays + 1),
        message: pc.recoveryGuidance,
        messageLocale: locale,
        adjustedAt,
      };
      const nextSections = buildSections(current.form, current.weaknesses);
      const tasks = buildTodayMission(current.form, nextSections, recoveryMode);
      recoveryPlanKey = buildPlanKey(current.form, current.weaknesses, recoveryMode);
      return {
        ...current,
        recoveryMode,
        tasks,
        taskProgress: Object.fromEntries(
          tasks.map((task) => [task.id, createProgress()]),
        ),
        activities: {},
        lastPlanKey: recoveryPlanKey,
      };
    });

    try {
      const message = await askTutor(
        `Write one calm short message in ${plannerLanguage} for a student who missed study time. Goal: ${plannerState.form.goal}. Weakest area: ${weakest.name}. Mention that the roadmap was recalculated, not failed.`,
        "You are Saidamin AI Planner. Be practical and motivating.",
        plannerLanguage,
        { retries: 1, feature: "planner" },
      );
      if (recoveryGenerationRef.current !== generation || !message.trim()) return;
      setPlannerState((current) => {
        if (!current.recoveryMode?.active || current.recoveryMode.adjustedAt !== adjustedAt || current.lastPlanKey !== recoveryPlanKey) return current;
        return {...current, recoveryMode:{...current.recoveryMode, message:message.trim(), messageLocale:locale}};
      });
    } catch (error) {
      console.warn("Planner recovery message failed", error);
    } finally {
      if (recoveryGenerationRef.current === generation) recoveryRequestRef.current = false;
    }
  };

  const openRecommendations = async () => {
    setRecommendationsOpen(true);
    if (recommendationRequestRef.current === recommendationScope || (recommendation && recommendationCacheRef.current === recommendationScope)) return;
    if (!hasPlannerActivity) {
      setRecommendation(t("planner.noMission"));
      return;
    }
    setRecommendationLoading(true);
    setRecommendationFailed(false);
    recommendationRequestRef.current = recommendationScope;
    const generation = recommendationGenerationRef.current;
    const isCurrent = () => recommendationGenerationRef.current === generation && recommendationScopeRef.current === recommendationScope;
    try {
      const response = await askTutor(
        `Give 3 short exam-prep recommendations for this planner state:\n${JSON.stringify(
          {
            goal: plannerState.form.goal,
            current: plannerState.form.currentScore,
            target: plannerState.form.targetScore,
            weaknesses: weaknessDashboard,
            missionCompletion: missionEvidence,
            remainingDays: daysUntil(plannerState.form.examDate),
          },
          null,
          2,
        )}`,
        `You are Saidamin AI Planner. Keep it concise, supportive, action-focused, and answer in ${plannerLanguage}.`,
        plannerLanguage,
        { retries: 1, feature: "planner" },
      );
      if (!isCurrent()) return;
      if (!response.trim()) throw new Error("Empty Planner recommendation");
      recommendationCacheRef.current = recommendationScope;
      setRecommendation(response.trim());
    } catch (error) {
      console.warn("Planner recommendations failed", error);
      if (isCurrent()) { setRecommendation(t("planner.recommendationUnavailable")); setRecommendationFailed(true); }
    } finally {
      if (isCurrent()) { recommendationRequestRef.current = null; setRecommendationLoading(false); }
    }
  };

  if (loadBlocked)
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-2xl border border-[var(--noviq-warning-border)] bg-[var(--noviq-warning-bg)] p-6 text-[var(--noviq-warning)]"
      >
        <h2 className="font-bold">{t("planner.loadErrorTitle")}</h2>
        <p className="my-3">
          {t("planner.loadErrorBody")}
        </p>
        <button
          type="button"
          onClick={() => setLoadRevision(value => value + 1)}
          className="btn-secondary"
        >
          {t("planner.tryAgain")}
        </button>
      </div>
    );

  if (!hydrated) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center rounded-[2rem] bg-[var(--noviq-bg)] text-[var(--noviq-text)]">
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-card)] px-5 py-4 text-sm font-black text-[var(--noviq-muted)]">
          <Loader2 className="animate-spin text-[var(--noviq-accent)]" size={18} />
          {t("planner.loadingSaved")}
        </div>
      </div>
    );
  }

  if (view === "roadmap") {
    if (!hasPlannerActivity) {
      return (
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-[var(--noviq-bg)] p-4 text-[var(--noviq-text)] sm:p-8">
          <button
            type="button"
            onClick={() => setView("today")}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--noviq-border)] bg-[var(--noviq-card)] px-4 py-2 text-sm font-bold text-[var(--noviq-text)] transition hover:border-[var(--noviq-accent)] hover:text-[var(--noviq-accent)]"
          >
            <ArrowLeft size={16} />
            {pc.backToday}
          </button>
          <section className="rounded-[1.75rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-8 text-center">
            <p className="text-2xl font-black text-[var(--noviq-text)]">
              {t("planner.noMission")}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[var(--noviq-muted)]">
              {pc.roadmapEmptyHint}
            </p>
            <button
              type="button"
              onClick={createMission}
              className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--noviq-accent)] px-6 text-sm font-black text-white transition hover:bg-[var(--noviq-accent-hover)]"
            >
              <Sparkles size={17} />
              {t("planner.createStudyPlan")}
            </button>
          </section>
        </div>
      );
    }

    const phases = localizeRoadmapPhases(
      buildRoadmapPhases(plannerState, weakest),
      weakest.name,
      locale,
    );
    return (
      <div className="mx-auto max-w-6xl rounded-[2rem] bg-[var(--noviq-bg)] p-4 text-[var(--noviq-text)] sm:p-8">
        <button
          type="button"
          onClick={() => setView("today")}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--noviq-border)] bg-[var(--noviq-card)] px-4 py-2 text-sm font-bold text-[var(--noviq-text)] transition hover:border-[var(--noviq-accent)] hover:text-[var(--noviq-accent)]"
        >
          <ArrowLeft size={16} />
          {pc.backToday}
        </button>

        <header className="mb-10 max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--noviq-accent)]">
            {pc.adaptiveRoadmap}
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-[var(--noviq-text)]">
            {modeConfig.label} {plannerState.form.currentScore} -&gt;{" "}
            {plannerState.form.targetScore}
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--noviq-muted)]">
            {pc.roadmapBody}
          </p>
        </header>

        <PlannerRoadmapCards phases={phases} />
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
      <div className="mx-auto max-w-5xl rounded-[2rem] bg-[var(--noviq-bg)] p-4 text-[var(--noviq-text)] sm:p-8 lg:p-10">
        <button
          type="button"
          onClick={() => {
            setTimerRunning(false);
            setView("today");
          }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--noviq-border)] bg-[var(--noviq-card)] px-4 py-2 text-sm font-bold text-[var(--noviq-text)] transition hover:border-[var(--noviq-accent)] hover:text-[var(--noviq-accent)]"
        >
          <ArrowLeft size={16} />
          {pc.backToday}
        </button>

        <section className="rounded-[1.75rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--noviq-soft)] text-[var(--noviq-accent)]">
                <Icon size={24} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--noviq-accent)]">
                  {localizePlannerSection(activeTask.section, locale)}
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight">
                  {localizePlannerTaskLabel(activeTask, plannerState.form, locale)}
                </h1>
                <p className="mt-2 text-sm font-semibold text-[var(--noviq-muted)]">
                  {localizePlannerFocusReason(activeTask, locale)}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-bg)] px-4 py-3 text-sm font-black text-[var(--noviq-text)]">
              {activeTask.scheduledWindow}
            </div>
          </div>

          <div className="mt-7 rounded-[1.5rem] border border-[var(--noviq-border)] bg-[var(--noviq-bg)] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--noviq-muted)]">
                  {pc.requiredTime}
                </p>
                <p className="mt-1 text-2xl font-black">
                  {formatTimer(elapsed)} / {formatTimer(requiredSeconds)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggleTaskTimer()}
                disabled={elapsed >= requiredSeconds || startingTimer || !activeActivity}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--noviq-accent)] px-5 text-sm font-black text-white transition hover:bg-[var(--noviq-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--noviq-muted)]"
              >
                {timerRunning ? (
                  <Clock size={17} />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
                {elapsed >= requiredSeconds
                  ? pc.timeReached
                  : timerRunning
                    ? pc.pauseTimer
                    : startingTimer ? pc.starting : pc.startTimer}
              </button>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--noviq-border)]">
              <div
                style={{ width: `${timerPercent}%` }}
                className="h-full rounded-full bg-[var(--noviq-accent)]"
              />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[1.75rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6 sm:p-8">
          {activityError && (
            <div role="alert" className="mb-4 rounded-2xl border border-[var(--noviq-warning-border)] bg-[var(--noviq-warning-bg)] p-4 text-sm text-[var(--noviq-warning)]">
              <p>{activityError}</p>
              <button type="button" className="btn-secondary mt-3" disabled={generatingTaskId !== null} onClick={() => void openActivity(activeTask)}>{pc.retryActivity}</button>
            </div>
          )}
          {validationMessage && !activeActivity && (
            <p role="status" className="mb-4 text-sm text-[var(--noviq-warning)]">{validationMessage}</p>
          )}
          {generatingTaskId === activeTask.id && (
            <div className="flex min-h-64 items-center justify-center">
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-bg)] px-5 py-4 text-sm font-black text-[var(--noviq-muted)]">
                <Loader2 className="animate-spin text-[var(--noviq-accent)]" size={18} />
                {pc.generatingActivity}
              </div>
            </div>
          )}

          {activeActivity && activeProgress && (
            <div>
              <p className="mb-3 text-xs text-[var(--noviq-muted)]">{activeActivity.origin === "ai" ? pc.aiGenerated : pc.savedActivity}</p>
              <div className="mb-6">
                <h2 className="text-2xl font-black">{activeActivity.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--noviq-muted)]">
                  {activeActivity.instructions}
                </p>
              </div>

              {activeActivity.type === "quiz" && (
                <PlannerQuizActivity
                  activity={activeActivity}
                  progress={activeProgress}
                  submitLabel={pc.submitQuiz}
                  onSubmit={submitQuiz}
                  onAnswer={(questionId, optionIndex) => updateProgress(activeTask.id, {
                    quizAnswers: { ...activeProgress.quizAnswers, [questionId]: optionIndex },
                  })}
                />
              )}

              {activeActivity.type === "writing" && (
                <PlannerWritingActivity activity={activeActivity} value={activeProgress.writingText} copy={pc}
                  wordCount={words(activeProgress.writingText).length}
                  onChange={value => updateProgress(activeTask.id, { writingText: value, submitted: false })}
                  onSubmit={() => updateProgress(activeTask.id, { submitted: true })}
                />
              )}

              {activeActivity.type === "speaking" && (
                <PlannerSpeakingActivity activity={activeActivity} value={activeProgress.speakingNotes} copy={pc}
                  onChange={value => updateProgress(activeTask.id, { speakingNotes: value, submitted: false })}
                  onSubmit={() => updateProgress(activeTask.id, { submitted: true })}
                />
              )}

              {activeActivity.type === "flashcards" && (
                <PlannerFlashcardActivity cards={activeActivity.flashcards || []} reviewedCards={activeProgress.reviewedCards}
                  answerLabel={pc.answer} questionLabel={pc.question}
                  onReview={cardId => updateProgress(activeTask.id, {
                    reviewedCards: activeProgress.reviewedCards.includes(cardId)
                      ? activeProgress.reviewedCards : [...activeProgress.reviewedCards, cardId],
                  })}
                />
              )}

              <div className="mt-8 rounded-[1.25rem] border border-[var(--noviq-border)] bg-[var(--noviq-bg)] p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--noviq-muted)]">
                  {pc.completionChecks}
                </p>
                <div className="mt-4 grid gap-2">
                  {activeActivity.successCriteria.map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2 text-sm font-semibold text-[var(--noviq-text)]"
                    >
                      <CheckCircle2
                        size={16}
                        className={
                          validation.ok ? "text-[var(--noviq-accent)]" : "text-[var(--noviq-muted)]"
                        }
                      />
                      {item}
                    </div>
                  ))}
                </div>
                {validationMessage && (
                  <p role="status" className="mt-4 text-sm font-bold text-[var(--noviq-danger)]">
                    {validationMessage}
                  </p>
                )}
                <button
                  type="button"
                  onClick={completeTask}
                  disabled={
                    completingTask || activeProgress?.status === "completed"
                  }
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--noviq-accent)] px-5 text-sm font-black text-white transition hover:bg-[var(--noviq-accent-hover)] sm:w-auto"
                >
                  <CheckCircle2 size={17} />
                  {completingTask
                    ? pc.savingTask
                    : activeProgress?.status === "completed"
                      ? pc.taskCompleted
                      : pc.completeTask}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl rounded-[2rem] bg-[var(--noviq-bg)] p-3 text-[var(--noviq-text)] sm:p-8 lg:p-10">
      {validationMessage && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-[var(--noviq-warning-bg)] p-3 text-sm text-[var(--noviq-warning)]"
        >
          {validationMessage}{" "}
          <button
            onClick={() => setValidationMessage("")}
            className="ml-2 underline"
          >
            {pc.dismiss}
          </button>
        </p>
      )}
      <div className="mb-5 flex items-center justify-between gap-3 sm:mb-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--noviq-accent)]">
            Noviq AI Planner
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-[var(--noviq-text)] sm:mt-2 sm:text-3xl">
            {t("planner.mentorToday")}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--noviq-border)] bg-[var(--noviq-card)] px-3 text-sm font-bold text-[var(--noviq-text)] transition hover:border-[var(--noviq-accent)] hover:text-[var(--noviq-accent)] sm:px-4"
        >
          <Settings2 size={16} />
          {t("planner.adjustPlan")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-[1.5rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-4 sm:rounded-[1.75rem] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div>
              <h1 className="text-xl font-black tracking-tight text-[var(--noviq-text)] sm:text-3xl">
                {modeConfig.label} {plannerState.form.currentScore} -&gt;{" "}
                {plannerState.form.targetScore}
              </h1>
              <p className="mt-2 text-xs font-semibold leading-5 text-[var(--noviq-muted)] sm:text-sm">
                {formatCopy(pc.daysWeakest, {
                  days: daysUntil(plannerState.form.examDate),
                  weakest: localizePlannerSection(weakest.name, locale),
                })}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-lg font-black text-[var(--noviq-text)] sm:text-2xl">
                {formatCopy(pc.percentComplete, { percent: journeyProgress })}
              </p>
              <p className="text-xs font-semibold text-[var(--noviq-muted)] sm:text-sm">
                {pc.savedMissionCompletion}
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--noviq-border)] sm:mt-6 sm:h-3">
            <div
              style={{ width: `${journeyProgress}%` }}
              className="h-full rounded-full bg-[var(--noviq-accent)]"
            />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-4 sm:rounded-[1.75rem] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--noviq-muted)]">
                {pc.missionCompletion}
              </p>
              <p className="mt-2 text-2xl font-black leading-tight text-[var(--noviq-text)] sm:text-4xl">
                {sharedMetrics.loading ? pc.loading : sharedMetrics.error ? pc.unavailable : missionPercent === null ? pc.notEnoughData : `${missionPercent}%`}
              </p>
            </div>
            <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-[var(--noviq-soft)] text-[var(--noviq-accent)] sm:flex">
              <Target size={23} />
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--noviq-muted)] sm:mt-4 sm:text-sm sm:leading-6">
            {formatCopy(pc.missionEvidence, {
              completed: sharedMetrics.missionCompleted,
              total: sharedMetrics.missionTotal,
            })}
          </p>
          {sharedMetrics.error && <p role="alert" className="mt-3 text-sm">{sharedMetrics.error} <button type="button" className="underline" onClick={sharedMetrics.retry}>{pc.retryStatistics}</button></p>}
          <div className="mt-4 hidden rounded-2xl bg-[var(--noviq-bg)] px-4 py-3 text-sm font-bold text-[var(--noviq-text)] sm:block">
            {pc.predictionNote}
          </div>
        </section>
      </div>

      <section className="mt-3 rounded-[1.5rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-4 sm:mt-5 sm:rounded-[1.75rem] sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-soft)] sm:h-14 sm:w-14">
              <img
                src="/saidamin-avatar.jpg"
                alt="Saidamin AI"
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div>
              <p className="text-sm font-black text-[var(--noviq-text)]">Saidamin AI</p>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--noviq-muted)] sm:mt-2 sm:text-base sm:leading-7">
                {hasPlannerActivity
                  ? plannerState.recoveryMode?.active
                    ? getRecoveryGuidance(plannerState.recoveryMode, locale)
                    : locale === "en"
                    ? getCoachMessage(plannerState, weakest)
                    : formatCopy(pc.recommendationFallback, {
                        weakest: localizePlannerSection(weakest.name, locale),
                      })
                  : t("planner.noMission")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openRecommendations}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-bg)] px-4 text-sm font-black text-[var(--noviq-text)] transition hover:border-[var(--noviq-accent)] hover:text-[var(--noviq-accent)]"
          >
            <Sparkles size={16} />
            {pc.recommendations}
          </button>
        </div>
      </section>

      {plannerState.recoveryMode?.active && (
        <section className="mt-5 rounded-[1.5rem] border border-[var(--noviq-warning-border)] bg-[var(--noviq-warning-bg)] p-5 text-[var(--noviq-warning)]">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={20} />
            <div>
              <p className="font-black">{pc.recoveryActive}</p>
              <p className="mt-1 text-sm font-semibold leading-6">
                {getRecoveryGuidance(plannerState.recoveryMode, locale)}
              </p>
            </div>
          </div>
        </section>
      )}

      <main className="mt-5 grid gap-5 sm:mt-8 lg:grid-cols-[1.35fr_0.85fr]">
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-2xl font-black text-[var(--noviq-text)]">
              {pc.todayMission}
            </h3>
            <span className="rounded-full bg-[var(--noviq-soft)] px-3 py-2 text-xs font-black text-[var(--noviq-accent)]">
              {formatCopy(pc.verified, {
                completed: completedTasks.length,
                total: plannerState.tasks.length,
              })}
            </span>
          </div>

          <div className="rounded-[1.75rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)]">
            {plannerState.tasks.length === 0 ? (
              <div className="px-5 py-10 text-center sm:px-6">
                <p className="text-xl font-black text-[var(--noviq-text)]">
                  {t("planner.noMission")}
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[var(--noviq-muted)]">
                  {pc.plannerTasksHint}
                </p>
                <button
                  type="button"
                  onClick={createMission}
                  className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--noviq-accent)] px-6 text-sm font-black text-white transition hover:bg-[var(--noviq-accent-hover)]"
                >
                  <Sparkles size={17} />
                  {t("planner.createStudyPlan")}
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
                      "border-[var(--noviq-border)] px-5 py-5 sm:px-6",
                      index !== plannerState.tasks.length - 1 && "border-b",
                      complete ? "bg-[var(--noviq-soft)]" : "bg-[var(--noviq-card)]",
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                          complete
                            ? "bg-[var(--noviq-accent)] text-white"
                            : "bg-[var(--noviq-bg)] text-[var(--noviq-accent)]",
                        )}
                      >
                        {complete ? <CheckCircle2 size={22} /> : <Icon size={22} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-base font-black",
                            complete ? "text-[var(--noviq-accent)]" : "text-[var(--noviq-text)]",
                          )}
                        >
                          {localizePlannerTaskLabel(task, plannerState.form, locale)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--noviq-muted)]">
                          {localizePlannerSection(task.section, locale)} / {task.scheduledWindow}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-[var(--noviq-text)]">
                          {formatCopy(pc.minutes, { count: task.minutes })}
                        </p>
                        <p className="mt-1 text-sm font-black text-[var(--noviq-accent)]">
                          {formatCopy(pc.practicePoints, { count: task.xp })}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--noviq-border)]">
                        <div
                          style={{ width: `${elapsedPercent}%` }}
                          className="h-full rounded-full bg-[var(--noviq-accent)]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void openActivity(task)}
                        disabled={complete}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-bg)] px-4 text-xs font-black text-[var(--noviq-text)] transition hover:border-[var(--noviq-accent)] hover:text-[var(--noviq-accent)] disabled:cursor-not-allowed disabled:border-[var(--noviq-border)] disabled:text-[var(--noviq-muted)]"
                      >
                        {complete
                          ? pc.completed
                          : progress.status === "inProgress"
                            ? pc.continueActivity
                            : pc.openActivity}
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
          <section className="rounded-[1.75rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--noviq-muted)]">
              {pc.todayGoal}
            </p>
            <p className="mt-2 text-3xl font-black text-[var(--noviq-text)]">
              {formatCopy(pc.minutes, { count: totalMinutes })}
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--noviq-muted)]">
              {formatCopy(pc.progress, {
                completed: completedMinutes,
                total: totalMinutes,
              })}
            </p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--noviq-border)]">
              <div
                style={{
                  width: `${(completedMinutes / Math.max(totalMinutes, 1)) * 100}%`,
                }}
                className="h-full rounded-full bg-[var(--noviq-accent)]"
              />
            </div>
            <button
              type="button"
              onClick={startMission}
              disabled={
                plannerState.tasks.length > 0 &&
                completedTasks.length === plannerState.tasks.length
              }
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--noviq-accent)] px-5 text-sm font-black text-white transition hover:bg-[var(--noviq-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--noviq-muted)]"
            >
              <Play size={17} fill="currentColor" />
              {plannerState.tasks.length ? pc.startMission : pc.createMission}
            </button>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--noviq-muted)]">
                  {pc.weaknessIntelligence}
                </p>
                <h3 className="mt-1 text-xl font-black">{pc.weakestAreas}</h3>
              </div>
              <Brain className="text-[var(--noviq-accent)]" size={22} />
            </div>
            <div className="space-y-3">
              {hasPlannerActivity ? (
                weaknessDashboard.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className="rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-bg)] px-4 py-3"
                  >
                    <p className="text-sm font-black text-[var(--noviq-text)]">
                      {index + 1}. {localizePlannerSection(item.label, locale)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--noviq-muted)]">
                      {localizePlannerSection(item.section, locale)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-bg)] px-4 py-3 text-sm font-semibold text-[var(--noviq-muted)]">
                  {pc.notEnoughActivity}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--noviq-muted)]">
                {pc.achievements}
              </p>
              <Award className="text-[var(--noviq-accent)]" size={21} />
            </div>
            <div className="grid gap-2">
              {[
                ["streak-7", pc.achievementStreak],
                ["vocabulary-master", pc.achievementVocabulary],
                ["listening-warrior", pc.achievementListening],
                ["writing-specialist", pc.achievementWriting],
                ["fast-improver", pc.achievementImprover],
                ["mission-champion", pc.achievementMission],
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
                        ? "border-[var(--noviq-accent)] bg-[var(--noviq-soft)]"
                        : "border-[var(--noviq-border)] bg-[var(--noviq-bg)]",
                    )}
                  >
                    {unlocked ? (
                      <Trophy size={17} className="text-[var(--noviq-accent)]" />
                    ) : (
                      <Lock size={17} className="text-[var(--noviq-muted)]" />
                    )}
                    <p
                      className={cn(
                        "text-sm font-black",
                        unlocked ? "text-[var(--noviq-accent)]" : "text-[var(--noviq-muted)]",
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
        <section className="mt-6 rounded-[1.75rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--noviq-soft)] text-[var(--noviq-accent)]">
              <CheckCircle2 size={23} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--noviq-muted)]">
                {pc.todaySummary}
              </p>
              <h3 className="mt-1 text-xl font-black text-[var(--noviq-text)]">
                {pc.dailyReflection}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--noviq-muted)]">
                {formatCopy(pc.reflection, {
                  tasks: plannerState.daily.reflection.tasksCompleted,
                  minutes: plannerState.daily.reflection.minutesStudied,
                  points: plannerState.daily.reflection.xpEarned,
                  strongest: localizePlannerSection(
                    plannerState.daily.reflection.strongestArea,
                    locale,
                  ),
                  weakest: localizePlannerSection(
                    plannerState.daily.reflection.needsImprovement,
                    locale,
                  ),
                  recommendation:
                    locale === "en"
                      ? plannerState.daily.reflection.recommendation
                      : pc.reflectionRecommendation,
                })}
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={activateRecoveryMode}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-card)] px-5 text-sm font-black text-[var(--noviq-text)] transition hover:border-[var(--noviq-accent)] hover:text-[var(--noviq-accent)]"
        >
          <RefreshCw size={17} />
          {pc.recoveryMode}
        </button>
        <button
          type="button"
          onClick={() => setView("roadmap")}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-card)] px-5 text-sm font-black text-[var(--noviq-text)] transition hover:border-[var(--noviq-accent)] hover:text-[var(--noviq-accent)]"
        >
          {pc.viewRoadmap}
          <ChevronRight size={17} />
        </button>
      </div>

      <PlannerSettingsDialog
        open={settingsOpen}
        form={plannerState.form}
        hasMission={plannerState.tasks.length > 0}
        weakAreasInvalid={weakAreasInvalid}
        validationMessage={planValidationMessage}
        weakAreasInputRef={weakAreasInputRef}
        onClose={() => setSettingsOpen(false)}
        onFormChange={rebuildWithForm}
        onModeChange={switchMode}
        onSectionScoreChange={updateSectionScore}
        onSubmit={
          plannerState.tasks.length ? savePlanSettings : createMission
        }
      />

{recommendationsOpen && <PlannerRecommendationsDialog locale={locale} loading={recommendationLoading} recommendation={recommendation} failed={recommendationFailed} onRetry={() => { void openRecommendations(); }}
        fallback={hasPlannerActivity ? formatCopy(pc.recommendationFallback, {weakest: localizePlannerSection(weaknessDashboard[0]?.label || weakest.name, locale)}) : t("planner.noMission")}
        onClose={() => setRecommendationsOpen(false)} />}

      {celebration && <PlannerCompletionDialog celebration={celebration} locale={locale} onClose={() => setCelebration(null)} />}
    </div>
  );
};
