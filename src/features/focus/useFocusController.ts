
import { useVerifiedFocusSession } from '@/src/lib/useVerifiedFocusSession';
import type { XpReceipt } from '@/src/lib/verifiedProgress';

import { loadLocalData, trySaveLocalData as saveLocalData } from "@/src/lib/localStore";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { useLocale } from "@/src/contexts/LocaleContext";
import { trackUserEvent } from "@/src/lib/analytics";
import { calculateSessionXp, persistStudySession, startStudySession } from "@/src/lib/progress";
import { Brain, Volume2, Leaf } from "lucide-react";

import { withFocusTimeout } from "@/src/lib/focusTimer";
import { getFocusCopy } from "@/src/features/focus/focusCopy";
import { focusContextKey, recordPlannerFocus, type PlannerFocusContext } from '@/src/features/planner/useSmartPlanner';
import { useStudyEvidence } from '@/src/features/pro/useStudyEvidence';
import { activityDay } from '@/src/features/pro/activitySummary';

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

export function useFocusController() {
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
  const [xpReceipt, setXpReceipt] = useState<XpReceipt | null>(null);
  const verificationWarning = useCallback(() => undefined, []);
  useVerifiedFocusSession(sessionIdRef, isActive && mode === 'focus', localOnly, verifying, verificationWarning);

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

    setXpReceipt(null);
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
      let confirmedReceipt: XpReceipt | undefined;
      const recordedId = await withFocusTimeout(
        () =>
          persistStudySession(sessionData, profile, [], sessionIdRef.current, receipt => { confirmedReceipt = receipt; setXpReceipt(receipt); }),
        10000,
      );
      try { recordPlannerFocus(user.uid, recordedId, confirmedReceipt?.duration ?? sessionDuration, completedAt.getTime(), confirmedReceipt?.status !== 'unverified', plannerContext); } catch { setSessionError(copy.localSaveFailed); }
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

  return { FOCUS_DURATION, SHORT_BREAK_DURATION, LONG_BREAK_DURATION, DAILY_GOAL, tracks, profile, study, locale, copy, time, isActive, mode, deepWork, music, setMusic, breakDuration, setBreakDuration, taskInputOpen, setTaskInputOpen, helpOpen, setHelpOpen, taskDraft, setTaskDraft, focusTask, taskDone, setTaskDone, audioRef, sessionBusy, sessionError, localOnly, verifying, xpReceipt, completeCurrentFocusSession, toggleTimer, resetTimer, selectTimerMode, updateFocusTask, skipTimer, completedToday, focusMinutes, progress, sessionNumber };
}
