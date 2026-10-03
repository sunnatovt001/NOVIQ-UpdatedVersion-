import {
  loadLocalData,
  trySaveLocalData as saveLocalData,
} from "@/src/lib/localStore";
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { trackUserEvent } from "@/src/lib/analytics";
import {
  calculateSessionXp,
  persistStudySession,
  startStudySession,
} from "@/src/lib/progress";
import { motion, AnimatePresence } from "motion/react";
import {
  Play,
  Pause,
  RotateCcw,
  Brain,
  Moon,
  Sun,
  Music,
  CheckCircle2,
} from "lucide-react";
import { formatTime, cn } from "@/src/lib/utils";
import { withFocusTimeout } from "@/src/lib/focusTimer";

export const Focus = () => {
  const { user, profile } = useAuth();
  const [cached] = useState(() =>
    loadLocalData<{
      time: number;
      mode: "focus" | "break";
      sessionId?: string;
      startedAt: number;
      localOnly?: boolean;
      localId?: string;
    } | null>(`noviq-focus-${user?.uid}`, null),
  );
  const validCache =
    cached &&
    ["focus", "break"].includes(cached.mode) &&
    Date.now() - cached.startedAt < 8 * 3600000 &&
    Number.isFinite(cached.time) &&
    cached.time >= 0 &&
    cached.time <= (cached.mode === "break" ? 300 : 1500);
  const [time, setTime] = useState(validCache ? cached.time : 25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<"focus" | "break">(
    validCache ? cached.mode : "focus",
  );
  const [deepWork, setDeepWork] = useState(false);
  const [music, setMusic] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
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
      })
    )
      setSessionError(
        "Device storage is unavailable. Keep this page open to preserve your timer.",
      );
  }, [time, mode, isActive, localOnly, user?.uid]);

  const tracks = [
    {
      id: "ambient-bedtime",
      name: "Ambient Bedtime",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    },
    {
      id: "laidback-lofi",
      name: "Laidback Lo-fi",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    },
    {
      id: "momentum-beats",
      name: "Momentum Beats",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    },
    {
      id: "calm-piano",
      name: "Calm Piano",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    },
  ];

  useEffect(() => {
    if (isActive && time > 0) {
      timerRef.current = setInterval(() => {
        setTime(
          Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)),
        );
      }, 1000);
    } else if (time === 0) {
      handleTimerComplete();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, time]);

  useEffect(() => {
    if (music) {
      if (audioRef.current) {
        audioRef.current.src = tracks.find((t) => t.id === music)?.url || "";
        audioRef.current.play().catch(() => setMusic(null));
      }
    } else {
      audioRef.current?.pause();
    }
  }, [music]);

  const recordFocusSession = async (sessionDuration: number) => {
    if (!user || sessionDuration < 60) {
      setSessionError("Study for at least one minute before completing.");
      return false;
    }

    const completedAt = new Date();
    const xpEarned = calculateSessionXp("focus", sessionDuration);
    const sessionData = {
      userId: user.uid,
      duration: sessionDuration,
      subject: deepWork ? "Deep Focus" : "Focus",
      category: "focus" as const,
      xpEarned,
      timestamp: completedAt.toISOString(),
    };

    if (localOnly) {
      const key = `noviq-focus-history-${user.uid}`;
      const history = loadLocalData<
        Array<{ id: string; duration: number; timestamp: string }>
      >(key, []);
      const id = localIdRef.current || crypto.randomUUID();
      if (
        !saveLocalData(
          key,
          [
            {
              id,
              duration: sessionDuration,
              timestamp: completedAt.toISOString(),
            },
            ...(Array.isArray(history) ? history : []).filter(
              (entry) => entry && entry.id !== id,
            ),
          ].slice(0, 100),
        )
      ) {
        setSessionError(
          "Could not save on this device. Free up browser storage and try again.",
        );
        return false;
      }
      setSessionError(
        "Session saved on this device. XP is unavailable because the server could not verify this session.",
      );
      return true;
    }

    try {
      await withFocusTimeout(
        () =>
          persistStudySession(sessionData, profile, [], sessionIdRef.current),
        10000,
      );
      sessionIdRef.current = undefined;
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
          : "Could not save this session. Please try again.",
      );
      return false;
    }
  };

  const completeCurrentFocusSession = async () => {
    if (mode !== "focus" || completingRef.current || verifying) return;
    const elapsedSeconds = 25 * 60 - time;
    if (elapsedSeconds <= 0) return;
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    completingRef.current = true;
    setSessionBusy(true);
    try {
      if (await recordFocusSession(elapsedSeconds)) {
        setMode("break");
        setTime(5 * 60);
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
        if (await recordFocusSession(25 * 60)) {
          setMode("break");
          setTime(5 * 60);
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
      setTime(25 * 60);
    }
  };

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
            "The session server is unavailable. Your timer still works; completed sessions are saved on this device without XP.",
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

  const resetTimer = () => {
    if (completingRef.current) return;
    generationRef.current += 1;
    startingRef.current = false;
    setVerifying(false);
    setLocalOnly(false);
    localIdRef.current = undefined;
    setSessionError("");
    startedAtRef.current = Date.now();
    sessionIdRef.current = undefined;
    setIsActive(false);
    setTime(mode === "focus" ? 25 * 60 : 5 * 60);
  };

  return (
    <div
      className={cn(
        "min-h-[85vh] rounded-[40px] transition-all duration-1000 flex flex-col items-center justify-center relative overflow-hidden",
        deepWork ? "bg-black" : "bg-[#0B1020]",
      )}
    >
      <audio ref={audioRef} loop />
      {verifying && (
        <p role="status" className="relative z-10 text-sm text-blue-200">
          Timer started. Connecting to the session server...
        </p>
      )}
      {localOnly && !verifying && !sessionError && (
        <p role="status" className="relative z-10 text-sm text-blue-200">
          Device-only session: saved locally without XP.
        </p>
      )}
      {sessionError && (
        <p
          role="alert"
          className="relative z-10 max-w-md px-6 text-center text-sm text-red-300"
        >
          {sessionError}
        </p>
      )}
      {sessionBusy && (
        <p role="status" className="relative z-10 text-blue-200">
          Please wait...
        </p>
      )}
      {/* Animated Orbitals */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-blue-500/30 rounded-full"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-purple-500/20 rounded-full"
        />
      </div>

      <div className="relative z-10 text-center space-y-10 max-w-4xl w-full px-6">
        <header className="space-y-2">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-blue-400"
          >
            {mode === "focus" ? <Brain size={14} /> : <Sun size={14} />}
            {mode === "focus" ? "Focus Session" : "Short Break"}
          </motion.div>
          <h2 className="text-xl text-slate-500 font-medium tracking-wide">
            Silence the world. Master your mind.
          </h2>
        </header>

        {/* Timer Display */}
        <button
          type="button"
          aria-label={isActive ? "Pause timer" : "Start timer"}
          disabled={sessionBusy}
          className="relative group mx-auto block disabled:opacity-50"
          onClick={toggleTimer}
        >
          <div className="absolute -inset-8 bg-blue-500/5 blur-[80px] rounded-full group-hover:bg-blue-500/10 transition-all duration-700" />
          <div className="text-[100px] sm:text-[140px] md:text-[180px] font-black font-display tracking-tighter leading-none relative text-white select-none cursor-pointer">
            {formatTime(time)}
          </div>
        </button>

        {/* Music Options */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
          {tracks.map((track) => (
            <button
              key={track.id}
              onClick={(e) => {
                e.stopPropagation();
                setMusic(music === track.id ? null : track.id);
              }}
              className={cn(
                "py-3 px-4 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2",
                music === track.id
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-white/5 border-white/10 text-slate-500 hover:bg-white/10",
              )}
            >
              <Music size={12} />
              {track.name}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-8">
          <button
            aria-label="Reset timer"
            disabled={sessionBusy}
            onClick={(e) => {
              e.stopPropagation();
              resetTimer();
            }}
            className="p-5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-slate-500 hover:text-white"
          >
            <RotateCcw size={24} />
          </button>

          <button
            aria-label={isActive ? "Pause timer" : "Start timer"}
            disabled={sessionBusy}
            onClick={(e) => {
              e.stopPropagation();
              toggleTimer();
            }}
            className="w-24 h-24 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-2xl shadow-blue-500/30 transition-all active:scale-90"
          >
            {isActive ? (
              <Pause size={40} fill="currentColor" />
            ) : (
              <Play size={40} fill="currentColor" className="ml-2" />
            )}
          </button>

          <button
            aria-label="Toggle deep work"
            aria-pressed={deepWork}
            onClick={(e) => {
              e.stopPropagation();
              setDeepWork(!deepWork);
            }}
            className={cn(
              "p-5 rounded-full border transition-all duration-500",
              deepWork
                ? "bg-white text-black border-white"
                : "bg-white/5 text-slate-500 border-white/10 hover:text-white",
            )}
          >
            <Moon size={24} className={cn(deepWork && "fill-black")} />
          </button>
        </div>

        {mode === "focus" && time < 25 * 60 && (
          <button
            type="button"
            disabled={sessionBusy || verifying || time > 24 * 60}
            onClick={(e) => {
              e.stopPropagation();
              completeCurrentFocusSession();
            }}
            className="mx-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 text-sm font-black text-emerald-200 transition hover:bg-emerald-500/20"
          >
            <CheckCircle2 size={18} />
            {sessionBusy ? "Saving session..." : "Complete focus session"}
          </button>
        )}
      </div>

      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-12 text-blue-500/50 text-[10px] font-bold tracking-[0.4em] uppercase"
        >
          Session Running
        </motion.div>
      )}
    </div>
  );
};
