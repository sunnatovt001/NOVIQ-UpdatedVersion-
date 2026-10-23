import {FocusReflection} from '@/src/features/pro/FocusReflection';
import {
  loadLocalData,
  trySaveLocalData as saveLocalData,
} from "@/src/lib/localStore";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { useLocale } from "@/src/contexts/LocaleContext";
import { trackUserEvent } from "@/src/lib/analytics";
import {
  calculateSessionXp,
  persistStudySession,
  startStudySession,
} from "@/src/lib/progress";
import {
  Play,
  Pause,
  RotateCcw,
  Brain,
  TimerReset,
  Coffee,
  Palmtree,
  Lightbulb,
  Target,
  Check,
  Clock3,
  Flame,
  Volume2,
  Leaf,
  SkipForward,
  Plus,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import { formatTime, cn } from "@/src/lib/utils";
import { withFocusTimeout } from "@/src/lib/focusTimer";
import { formatFocusCopy, getFocusCopy } from "@/src/features/focus/focusCopy";
import { focusContextKey, recordPlannerFocus, type PlannerFocusContext } from '@/src/features/planner/useSmartPlanner';
import {useStudyEvidence} from '@/src/features/pro/useStudyEvidence';
import {activityDay,actualDuration} from '@/src/features/pro/activitySummary';

const FOCUS_DURATION = 25 * 60;
const SHORT_BREAK_DURATION = 5 * 60;
const LONG_BREAK_DURATION = 15 * 60;
const DAILY_GOAL = 8;

const tracks = [
  {
    id: "focus-beats",
    nameKey: "trackFocusBeats" as const,
    icon: Volume2,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  },
  {
    id: "lo-fi",
    nameKey: "trackLofi" as const,
    icon: Brain,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  },
  {
    id: "nature",
    nameKey: "trackNature" as const,
    icon: Leaf,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  },
  {
    id: "white-noise",
    nameKey: "trackWhiteNoise" as const,
    icon: Volume2,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  },
] as const;

type FocusHistoryEntry = { id: string; duration: number; timestamp: string; origin?:'device'|'server'; status?:string };

export const Focus = () => {
  const { user, profile } = useAuth();
  const study = useStudyEvidence(user?.uid);
  const [plannerContext, setPlannerContext] = useState(() => user ? loadLocalData<PlannerFocusContext | null>(focusContextKey(user.uid), null) : null);
  const { locale } = useLocale();
  const copy = useMemo(() => getFocusCopy(locale), [locale]);
  const [cached] = useState(() =>
    loadLocalData<{
      time: number;
      mode: "focus" | "break";
      sessionId?: string;
      startedAt: number;
      localOnly?: boolean;
      localId?: string;
      breakDuration?: number;
      plannerTaskId?: string;
    } | null>(`noviq-focus-${user?.uid}`, null),
  );
  const validCache =
    cached &&
    cached.plannerTaskId === plannerContext?.taskId &&
    ["focus", "break"].includes(cached.mode) &&
    Date.now() - cached.startedAt < 8 * 3600000 &&
    Number.isFinite(cached.time) &&
    cached.time >= 0 &&
    cached.time <=
      (cached.mode === "focus"
        ? FOCUS_DURATION
        : cached.breakDuration === LONG_BREAK_DURATION
          ? LONG_BREAK_DURATION
          : SHORT_BREAK_DURATION);
  const [time, setTime] = useState(validCache ? cached.time : FOCUS_DURATION);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<"focus" | "break">(
    validCache ? cached.mode : "focus",
  );
  const [deepWork, setDeepWork] = useState(false);
  const [music, setMusic] = useState<string | null>(null);
  const [breakDuration, setBreakDuration] = useState(
    validCache && cached.breakDuration === LONG_BREAK_DURATION
      ? LONG_BREAK_DURATION
      : SHORT_BREAK_DURATION,
  );
  const [taskInputOpen, setTaskInputOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState("");
  const [focusTask, setFocusTask] = useState(() =>
    loadLocalData(`noviq-focus-task-${user?.uid}`, ""),
  );
  const [taskDone, setTaskDone] = useState(() =>
    loadLocalData(`noviq-focus-task-done-${user?.uid}`, false),
  );
  const [focusHistory, setFocusHistory] = useState<FocusHistoryEntry[]>(() =>
    loadLocalData(`noviq-focus-history-${user?.uid}`, []),
  );

  const timerRef = useRef<number | ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef<string | undefined>(
    validCache ? cached.sessionId : undefined,
  );
  const startedAtRef = useRef(validCache ? cached.startedAt : Date.now());
  const [sessionBusy, setSessionBusy] = useState(false);
  const startingRef = useRef(false);
  const completingRef = useRef(false);
  const deadlineRef = useRef(0);
  const [sessionError, setSessionError] = useState("");
  const [localOnly, setLocalOnly] = useState(
    Boolean(validCache && cached.localOnly),
  );
  const [verifying, setVerifying] = useState(false);
  const localIdRef = useRef(validCache ? cached.localId : undefined);
  const generationRef = useRef(0);

  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (
      user &&
      !saveLocalData(`noviq-focus-${user.uid}`, {
        time,
        mode,
        sessionId: sessionIdRef.current,
        startedAt: startedAtRef.current,
        localOnly,
        localId: localIdRef.current,
        breakDuration,
        plannerTaskId: plannerContext?.taskId,
      })
    )
      setSessionError(
        copy.storageUnavailable,
      );
  }, [time, mode, isActive, localOnly, breakDuration, user?.uid, copy.storageUnavailable, plannerContext?.taskId]);

  useEffect(() => {
    if (user) saveLocalData(`noviq-focus-task-${user.uid}`, focusTask);
  }, [focusTask, user?.uid]);

  useEffect(() => {
    if (user) saveLocalData(`noviq-focus-task-done-${user.uid}`, taskDone);
  }, [taskDone, user?.uid]);

  useEffect(() => {
    if (isActive) {
      timerRef.current = window.setInterval(() => {
        setTime(
          Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)),
        );
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  useEffect(() => {
    if (music) {
      if (audioRef.current) {
        audioRef.current.src =
          tracks.find((track) => track.id === music)?.url || "";
        audioRef.current.play().catch(() => setMusic(null));
      }
    } else {
      audioRef.current?.pause();
    }
    return () => audioRef.current?.pause();
  }, [music]);

  const recordFocusSession = async (sessionDuration: number) => {
    if (!user || sessionDuration < 60) {
      setSessionError(copy.minimumMinute);
      return false;
    }

    const completedAt = new Date();
    const xpEarned = calculateSessionXp("focus", sessionDuration);
    const sessionData = {
      userId: user.uid,
      duration: sessionDuration,
      subject: plannerContext?.subject || (deepWork ? "Deep Focus" : "Focus"),
      category: "focus" as const,
      xpEarned,
      timestamp: completedAt.toISOString(),
    };

    if (localOnly) {
      const key = `noviq-focus-history-${user.uid}`;
      const history = loadLocalData<FocusHistoryEntry[]>(key, []);
      const id = localIdRef.current || crypto.randomUUID();
      const savedSession = {
        id,
        duration: sessionDuration,
        timestamp: completedAt.toISOString(),
        origin: 'device' as const,
        status: 'completed',
      };
      const nextHistory = [
        savedSession,
        ...(Array.isArray(history) ? history : []).filter(
          (entry) => entry && entry.id !== id,
        ),
      ].slice(0, 100);
      if (!saveLocalData(key, nextHistory)) {
        setSessionError(
          copy.localSaveFailed,
        );
        return false;
      }
      setFocusHistory(nextHistory);
      window.dispatchEvent(new Event('noviq:focus-history'));
      try { recordPlannerFocus(user.uid, id, sessionDuration, completedAt.getTime(), false, plannerContext); } catch { setSessionError(copy.localSaveFailed); }
      setSessionError(
        copy.localSaved,
      );
      return true;
    }

    try {
      const recordedId = await withFocusTimeout(
        () =>
          persistStudySession(sessionData, profile, [], sessionIdRef.current),
        10000,
      );
      try { recordPlannerFocus(user.uid, recordedId, sessionDuration, completedAt.getTime(), true, plannerContext); } catch { setSessionError(copy.localSaveFailed); }
      sessionIdRef.current = undefined;
      const current=loadLocalData<FocusHistoryEntry[]>(`noviq-focus-history-${user.uid}`,[]);
      const next = [
          {
            id: recordedId,
            duration: sessionDuration,
            timestamp: completedAt.toISOString(),
            origin: 'server' as const,
            status: 'completed',
          },
          ...current.filter(record=>record.id!==recordedId),
        ].slice(0,100);
      saveLocalData(`noviq-focus-history-${user.uid}`,next);setFocusHistory(next);
      window.dispatchEvent(new Event('noviq:focus-history'));
      trackUserEvent(user.uid, "focus_session_completed", 0, {
        focusMinutes: Math.round(sessionDuration / 60),
        durationSeconds: sessionDuration,
        deepWork,
      }).catch(() => undefined);
      return true;
    } catch (error) {
      console.warn("Focus session sync failed", error);
      setSessionError(
        error instanceof Error
          ? error.message
          : copy.saveFailed,
      );
      return false;
    }
  };

  const completeCurrentFocusSession = async () => {
    if (mode !== "focus" || completingRef.current || verifying) return;
    const elapsedSeconds = FOCUS_DURATION - time;
    if (elapsedSeconds <= 0) return;
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    completingRef.current = true;
    setSessionBusy(true);
    try {
      if (await recordFocusSession(elapsedSeconds)) {
        setMode("break");
        setTime(breakDuration);
      }
    } finally {
      completingRef.current = false;
      setSessionBusy(false);
    }
  };

  const handleTimerComplete = async () => {
    if (completingRef.current) return;
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);

    if (mode === "focus") {
      completingRef.current = true;
      setSessionBusy(true);
      try {
        if (await recordFocusSession(FOCUS_DURATION)) {
          setMode("break");
          setTime(breakDuration);
        } else setTime(1);
      } finally {
        completingRef.current = false;
        setSessionBusy(false);
      }
    } else {
      setLocalOnly(false);
      localIdRef.current = undefined;
      sessionIdRef.current = undefined;
      setSessionError("");
      setMode("focus");
      setTime(FOCUS_DURATION);
    }
  };

  useEffect(() => {
    if (time === 0) void handleTimerComplete();
  }, [time]);

  const toggleTimer = () => {
    if (completingRef.current) return;
    if (
      !isActive &&
      mode === "focus" &&
      !sessionIdRef.current &&
      !localOnly &&
      !startingRef.current
    ) {
      startingRef.current = true;
      setVerifying(true);
      setLocalOnly(true);
      localIdRef.current = crypto.randomUUID();
      startedAtRef.current = Date.now();
      setSessionError("");
      const generation = ++generationRef.current;
      void withFocusTimeout(() => startStudySession("focus", "focus", true))
        .then((id) => {
          if (generation !== generationRef.current) return;
          sessionIdRef.current = id;
          setLocalOnly(false);
        })
        .catch(() => {
          if (generation !== generationRef.current) return;
          setSessionError(
            copy.serverUnavailable,
          );
        })
        .finally(() => {
          if (generation !== generationRef.current) return;
          startingRef.current = false;
          setVerifying(false);
        });
    }
    if (!isActive) deadlineRef.current = Date.now() + time * 1000;
    setIsActive((current) => !current);
  };

  const preservePartial = () => {
    const elapsed=FOCUS_DURATION-time;
    if(!user || mode!=='focus' || elapsed<=0)return;
    const id=sessionIdRef.current || localIdRef.current || crypto.randomUUID();
    const row:FocusHistoryEntry={id,duration:elapsed,timestamp:new Date().toISOString(),origin:'device',status:'partial'};
    const previous=loadLocalData<FocusHistoryEntry[]>(`noviq-focus-history-${user.uid}`,[]);
    const next=[row,...previous.filter(item=>item.id!==id)].slice(0,100);
    saveLocalData(`noviq-focus-history-${user.uid}`,next);setFocusHistory(next);
    window.dispatchEvent(new Event('noviq:focus-history'));
  };
  const resetTimer = () => {
    if (completingRef.current) return;
    preservePartial();
    generationRef.current += 1;
    startingRef.current = false;
    setVerifying(false);
    setLocalOnly(false);
    localIdRef.current = undefined;
    setSessionError("");
    startedAtRef.current = Date.now();
    sessionIdRef.current = undefined;
    setIsActive(false);
    setTime(mode === "focus" ? FOCUS_DURATION : breakDuration);
  };

  const selectTimerMode = (
    nextMode: "focus" | "break",
    nextDuration: number,
  ) => {
    if (completingRef.current || sessionBusy) return;
    preservePartial();
    generationRef.current += 1; sessionIdRef.current=undefined;localIdRef.current=undefined;setLocalOnly(false);
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setMode(nextMode);
    setTime(nextDuration);
    setSessionError("");
  };

  const updateFocusTask = () => {
    const nextTask = taskDraft.trim();
    if (!nextTask) return;
    setPlannerContext(null);
    if (user) saveLocalData(focusContextKey(user.uid), null);
    setFocusTask(nextTask.slice(0, 120));
    setTaskDraft("");
    setTaskDone(false);
    setTaskInputOpen(false);
  };

  const skipTimer = () => {
    if (sessionBusy || verifying) return;
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (mode === "focus") {
      selectTimerMode("break", breakDuration);
    } else {
      setLocalOnly(false);
      localIdRef.current = undefined;
      sessionIdRef.current = undefined;
      selectTimerMode("focus", FOCUS_DURATION);
    }
  };

  const timezone='Asia/Tashkent';
  const todaySessions=study.records.filter(session=>session.category==='focus' && activityDay(Date.parse(session.timestamp),timezone)===activityDay(Date.now(),timezone));
  const completedToday=todaySessions.filter(session=>session.status!=='partial').length;
  const focusMinutes=Math.floor(todaySessions.reduce((total,session)=>total+session.duration,0)/60);
  const progress = Math.min(
    100,
    Math.max(
      0,
      (((mode === "focus" ? FOCUS_DURATION : breakDuration) - time) /
        (mode === "focus" ? FOCUS_DURATION : breakDuration)) *
        100,
    ),
  );
  const sessionNumber = (completedToday % 4) + 1;

  return (
    <div
      className={cn(
        "pro-focus-workspace min-h-[calc(100dvh-9rem)] rounded-[32px] border border-slate-200/90 bg-[#f8fbff] p-3 text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.05)] sm:p-4 dark:border-slate-800 dark:bg-slate-950",
        deepWork && "dark:bg-black",
      )}
    >
      <audio ref={audioRef} loop />
      {(study.error || !study.ready || study.deviceSeconds>0) && <p role="status" className="mb-3 text-sm">{study.error ? (locale==='uz'?'Server tarixi olinmadi; qurilmadagi yozuvlar saqlangan.':locale==='ru'?'История сервера недоступна. Данные устройства сохранены.':'Server history unavailable; device records are preserved.') : !study.ready ? (locale==='uz'?'Tarix yuklanmoqda…':locale==='ru'?'Загрузка истории…':'Loading activity history…') : (locale==='uz'?'Qurilmada saqlangan, sinxronlanmagan vaqt ham kiritilgan.':locale==='ru'?'Включена активность, сохранённая только на устройстве.':'Includes activity saved only on this device.')} <button className="underline" onClick={study.retry}>{locale==='uz'?'Qayta urinish':locale==='ru'?'Повторить':'Retry'}</button></p>}
      <div className="mx-auto grid w-full max-w-none gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5 lg:p-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                <TimerReset size={31} />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  {copy.title}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {copy.subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-expanded={helpOpen}
              aria-controls="focus-help"
              onClick={() => setHelpOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700"
            >
              <Lightbulb size={16} /> {copy.howItWorks}
            </button>
          </header>
          {helpOpen && (
            <p
              id="focus-help"
              className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-500/10 dark:text-blue-100"
            >
              {copy.help}
            </p>
          )}

          <div className="mt-7 grid grid-cols-3 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-800">
            {[
              {
                label: copy.focus,
                duration: FOCUS_DURATION,
                icon: TimerReset,
                active: mode === "focus",
                mode: "focus" as const,
              },
              {
                label: copy.shortBreak,
                duration: SHORT_BREAK_DURATION,
                icon: Coffee,
                active:
                  mode === "break" && breakDuration === SHORT_BREAK_DURATION,
                mode: "break" as const,
              },
              {
                label: copy.longBreak,
                duration: LONG_BREAK_DURATION,
                icon: Palmtree,
                active:
                  mode === "break" && breakDuration === LONG_BREAK_DURATION,
                mode: "break" as const,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.duration !== FOCUS_DURATION)
                      setBreakDuration(item.duration);
                    selectTimerMode(item.mode, item.duration);
                  }}
                  className={cn(
                    "flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 text-left transition",
                    item.active
                      ? "bg-blue-50 text-blue-600 shadow-sm dark:bg-blue-500/15"
                      : "text-slate-500 hover:bg-white dark:hover:bg-slate-700",
                  )}
                >
                  <Icon size={21} />
                  <span className="leading-tight">
                    <span className="block text-xs font-black">
                      {item.label}
                    </span>
                    <span className="block text-sm font-bold">
                      {formatFocusCopy(copy.minutes, { count: item.duration / 60 })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {(verifying || localOnly || sessionError || sessionBusy) && (
            <div className="mt-4" aria-live="polite">
              {sessionError ? (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:bg-red-950/50 dark:text-red-200"
                >
                  {sessionError}
                </p>
              ) : (
                <p
                  role="status"
                  className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                >
                  {sessionBusy
                    ? copy.savingSession
                    : verifying
                      ? copy.connecting
                      : copy.deviceOnly}
                </p>
              )}
            </div>
          )}

          <div
            className="pro-focus-dial mx-auto mt-6 grid h-[clamp(270px,31vw,340px)] w-[clamp(270px,31vw,340px)] place-items-center rounded-full bg-[conic-gradient(var(--focus-ring)_0%,#e8eff9_var(--focus-ring)_100%)] p-3 shadow-[0_0_0_16px_rgba(37,99,235,0.05)]"
            style={{ "--focus-ring": `${progress}%` } as React.CSSProperties}
          >
            <svg className="liquid-timer-progress hidden" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" pathLength="100" strokeDasharray={`${progress} 100`}/></svg>
            <div className="grid h-full w-full place-items-center rounded-full bg-white text-center shadow-inner dark:bg-slate-900">
              <div>
                <Brain className="mx-auto text-blue-600" size={34} />
                <p className="mt-3 text-lg font-black">
                  {mode === "focus"
                    ? copy.focusSession
                    : breakDuration === LONG_BREAK_DURATION
                      ? copy.longBreak
                      : copy.shortBreak}
                </p>
                <p className="text-sm text-slate-500">
                  {mode === "focus" ? copy.pomodoroMode : copy.mindfulPause}
                </p>
                <button
                  type="button"
                  aria-label={isActive ? copy.pauseTimer : copy.startTimer}
                  disabled={sessionBusy}
                  onClick={toggleTimer}
                  className="mt-2 text-[clamp(4rem,9vw,6.5rem)] font-black leading-none tracking-[-0.08em] text-slate-900 transition hover:text-blue-600 disabled:opacity-50 dark:text-white"
                >
                  {formatTime(time)}
                </button>
                <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Leaf size={15} />{" "}
                  {isActive
                    ? copy.stayInFlow
                    : mode === "focus"
                      ? copy.timeToFocus
                      : copy.enjoyBreak}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)_minmax(8.5rem,1.7fr)_minmax(0,1fr)] items-center gap-2 sm:flex sm:justify-center sm:gap-7">
            <button
              type="button"
              aria-label={copy.resetTimer}
              disabled={sessionBusy}
              onClick={resetTimer}
              className="inline-flex min-w-0 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-3 text-xs font-bold text-slate-500 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 sm:min-w-28 sm:gap-2 sm:px-5 sm:text-sm"
            >
              <RotateCcw size={18} /> <span className="hidden min-[350px]:inline">{copy.reset}</span>
            </button>
            <button
              type="button"
              aria-label={isActive ? copy.pauseTimer : copy.startTimer}
              disabled={sessionBusy}
              onClick={toggleTimer}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full bg-blue-600 px-3 py-4 text-base font-black text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-500 disabled:opacity-50 sm:min-w-48 sm:gap-3 sm:px-8 sm:text-lg"
            >
              {isActive ? (
                <Pause size={23} fill="currentColor" />
              ) : (
                <Play size={23} fill="currentColor" />
              )}{" "}
              {isActive ? copy.pause : copy.start}
            </button>
            <button
              type="button"
              aria-label={copy.skipTimer}
              disabled={sessionBusy || verifying}
              onClick={skipTimer}
              className="inline-flex min-w-0 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-3 text-xs font-bold text-slate-500 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 sm:min-w-28 sm:gap-2 sm:px-5 sm:text-sm"
            >
              <SkipForward size={18} /> <span className="hidden min-[350px]:inline">{copy.skip}</span>
            </button>
          </div>
          {mode === "focus" && time < FOCUS_DURATION && (
            <button
              type="button"
              disabled={sessionBusy || verifying || time > FOCUS_DURATION - 60}
              onClick={completeCurrentFocusSession}
              className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300"
            >
              <CheckCircle2 size={17} />{" "}
              {sessionBusy ? copy.savingSession : copy.completeSession}
            </button>
          )}
          <div className="mt-6 text-center">
            <p className="text-sm font-semibold text-slate-500">
              {formatFocusCopy(copy.sessionOf, { current: sessionNumber, total: 4 })}
            </p>
            <div className="mt-2 flex justify-center gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-3 w-3 rounded-full border",
                    index === sessionNumber - 1
                      ? "border-blue-600 bg-blue-600"
                      : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800",
                  )}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="pro-focus-context space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Target className="text-blue-600" size={24} /> {copy.todaysFocus}
              </h2>
              <button
                type="button"
                aria-label={copy.addTask}
                onClick={() => setTaskInputOpen((current) => !current)}
                className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50"
              >
                <Plus size={16} /> {copy.addTask}
              </button>
            </div>
            {taskInputOpen && (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateFocusTask();
                }}
              >
                <input
                  autoFocus
                  value={taskDraft}
                  onChange={(event) => setTaskDraft(event.target.value)}
                  maxLength={120}
                  required
                  aria-label={copy.focusTask}
                  placeholder={copy.taskPlaceholder}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-3 text-sm font-bold text-white"
                >
                  {copy.save}
                </button>
              </form>
            )}
            {focusTask ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-800">
                <button
                  type="button"
                  aria-label={copy.completeTask}
                  aria-pressed={taskDone}
                  onClick={() => setTaskDone((current) => !current)}
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border-2",
                    taskDone
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-400",
                  )}
                >
                  {taskDone && <Check size={15} strokeWidth={3} />}
                </button>
                <p
                  className={cn(
                    "min-w-0 flex-1 font-semibold",
                    taskDone && "text-slate-400 line-through",
                  )}
                >
                  {focusTask}
                </p>
                <button
                  type="button"
                  aria-label={copy.editTask}
                  onClick={() => {
                    setTaskDraft(focusTask);
                    setTaskInputOpen(true);
                  }}
                  className="text-slate-400 hover:text-blue-600"
                >
                  <Pencil size={17} />
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800">
                {copy.noTask}
              </p>
            )}
          </section>
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <Check size={22} />
              </span>
              <p className="mt-4 text-3xl font-black">{completedToday}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {copy.completedToday}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Clock3 size={22} />
              </span>
              <p className="mt-4 text-3xl font-black">{focusMinutes}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {copy.focusMinutes}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-500">
                <Flame size={22} />
              </span>
              <p className="mt-4 text-3xl font-black text-orange-500">
                {profile?.streak || 0}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {copy.currentStreak}
              </p>
            </div>
          </section>
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Target className="text-emerald-500" size={22} /> {copy.dailyGoal}
              </h2>
              <span className="font-black text-slate-700 dark:text-slate-200">
                {completedToday} / {DAILY_GOAL}{" "}
                <span className="text-sm text-slate-500">{copy.pomodoros}</span>
              </span>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(100, (completedToday / DAILY_GOAL) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {completedToday
                ? formatFocusCopy(copy.goalProgress, { percent: Math.round((completedToday / DAILY_GOAL) * 100) })
                : copy.goalStart}
            </p>
          </section>
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Volume2 size={22} /> {copy.ambientSound}
              </h2>
              <span className="text-sm font-bold text-blue-600">
                {copy.focusMode}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
              {tracks.map((track) => {
                const Icon = track.icon;
                const selected = music === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMusic(selected ? null : track.id)}
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 text-sm font-bold transition",
                      selected
                        ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-500/10"
                        : "border-slate-100 bg-slate-50 text-slate-500 hover:border-blue-200 dark:border-slate-800 dark:bg-slate-800",
                    )}
                  >
                    <Icon size={23} />
                    {copy[track.nameKey]}
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
      <FocusReflection/>
    </div>
  );
};
