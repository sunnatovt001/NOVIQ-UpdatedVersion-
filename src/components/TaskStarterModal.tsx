import React, { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Clock3, Pause, Play, X } from "lucide-react";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { useLocale, type AppLocale } from "@/src/contexts/LocaleContext";

interface TaskStarterModalProps {
  task: { id: string; title: string; time: string; duration: number };
  onClose: () => void;
  onComplete: (sessionTime: number) => void;
}

const TASK_COPY = {
  en: {
    close: "Close task session", ready: "Ready to start?", readyBody: "Complete one focused task, then decide what comes next.", task: "Task", minutes: "{count} min", cancel: "Cancel", start: "Start session", running: "Session in progress", progress: "Progress", pause: "Pause", resume: "Resume", target: "Target: {count} min · keep focusing.", completedTitle: "Task completed", completedBody: "Good work. Your focused time is ready to be saved.", timeSpent: "Time spent", status: "Status", completed: "Completed", continue: "Continue",
  },
  uz: {
    close: "Vazifa sessiyasini yopish", ready: "Boshlashga tayyormisiz?", readyBody: "Bitta vazifaga diqqat qarating, so‘ng keyingi qadamni tanlang.", task: "Vazifa", minutes: "{count} daqiqa", cancel: "Bekor qilish", start: "Sessiyani boshlash", running: "Sessiya davom etmoqda", progress: "Natija", pause: "To‘xtatish", resume: "Davom ettirish", target: "Maqsad: {count} daqiqa · diqqatni saqlang.", completedTitle: "Vazifa bajarildi", completedBody: "Yaxshi ishladingiz. Fokus vaqtingiz saqlashga tayyor.", timeSpent: "Sarflangan vaqt", status: "Holat", completed: "Bajarildi", continue: "Davom etish",
  },
  ru: {
    close: "Закрыть учебную сессию", ready: "Готовы начать?", readyBody: "Сосредоточьтесь на одной задаче, затем выберите следующий шаг.", task: "Задача", minutes: "{count} мин", cancel: "Отмена", start: "Начать сессию", running: "Сессия идёт", progress: "Прогресс", pause: "Пауза", resume: "Продолжить", target: "Цель: {count} мин · сохраняйте фокус.", completedTitle: "Задача выполнена", completedBody: "Отличная работа. Время фокуса готово к сохранению.", timeSpent: "Затраченное время", status: "Статус", completed: "Выполнено", continue: "Продолжить",
  },
} satisfies Record<AppLocale, Record<string, string>>;

const interpolate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );

const formatTime = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export const TaskStarterModal = ({ task, onClose, onComplete }: TaskStarterModalProps) => {
  const { locale } = useLocale();
  const copy = TASK_COPY[locale];
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<"confirm" | "timer" | "complete">("confirm");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  useBodyScrollLock(true);
  useDialogFocus(true, dialogRef, onClose);

  React.useEffect(() => {
    if (!isRunning) return undefined;
    const interval = window.setInterval(() => {
      setElapsedTime((previous) => {
        const next = previous + 1;
        if (next >= task.duration * 60) { setIsRunning(false); setStep("complete"); }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, task.duration]);

  const progress = Math.min(100, (elapsedTime / Math.max(task.duration * 60, 1)) * 100);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="noviq-modal-backdrop z-[210]">
        <div className="noviq-modal-positioner noviq-modal-md">
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-session-title"
            tabIndex={-1}
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="noviq-modal-panel relative rounded-[1.75rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-5 text-[var(--noviq-text)] shadow-2xl sm:p-7"
          >
            <button type="button" onClick={onClose} aria-label={copy.close} className="absolute right-4 top-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--noviq-border)] bg-[var(--noviq-soft)] text-[var(--noviq-muted)] transition-colors hover:text-[var(--noviq-text)]">
              <X size={18} />
            </button>

            <AnimatePresence mode="wait" initial={false}>
              {step === "confirm" ? (
                <motion.div key="confirm" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-5 pr-12">
                  <div>
                    <h2 id="task-session-title" className="font-display text-2xl font-bold tracking-tight">{copy.ready}</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--noviq-muted)]">{copy.readyBody}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-soft)] p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--noviq-muted)]">{copy.task}</p>
                    <p className="mt-2 text-lg font-bold">{task.title}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--noviq-muted)]">
                      <span className="inline-flex items-center gap-2"><Clock3 size={16} />{interpolate(copy.minutes, { count: task.duration })}</span>
                      {task.time ? <span>· {task.time}</span> : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={onClose} className="min-h-12 rounded-xl border border-[var(--noviq-border)] px-4 text-sm font-semibold">{copy.cancel}</button>
                    <button type="button" onClick={() => { setStep("timer"); setIsRunning(true); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#315EFB] px-4 text-sm font-bold text-white hover:bg-[#244BD3]">
                      <Play size={17} fill="currentColor" />{copy.start}
                    </button>
                  </div>
                </motion.div>
              ) : step === "timer" ? (
                <motion.div key="timer" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6 pr-12">
                  <div>
                    <h2 id="task-session-title" className="font-display text-2xl font-bold tracking-tight">{copy.running}</h2>
                    <p className="mt-2 text-sm text-[var(--noviq-muted)]">{task.title}</p>
                  </div>
                  <p className="font-display text-5xl font-bold tabular-nums tracking-[-0.06em] sm:text-6xl">{formatTime(elapsedTime)}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold"><span className="text-[var(--noviq-muted)]">{copy.progress}</span><span>{Math.round(progress)}%</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[var(--noviq-soft)]"><motion.div animate={{ width: `${progress}%` }} transition={{ duration: 0.2 }} className="h-full rounded-full bg-[#315EFB]" /></div>
                  </div>
                  <button type="button" onClick={() => setIsRunning((current) => !current)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--noviq-border)] bg-[var(--noviq-soft)] px-4 text-sm font-bold">
                    {isRunning ? <Pause size={17} /> : <Play size={17} />}{isRunning ? copy.pause : copy.resume}
                  </button>
                  <p className="text-center text-xs text-[var(--noviq-muted)]">{interpolate(copy.target, { count: task.duration })}</p>
                </motion.div>
              ) : (
                <motion.div key="complete" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F7F1] text-[#237A5C]"><CheckCircle2 size={27} /></span>
                  <div>
                    <h2 id="task-session-title" className="font-display text-2xl font-bold tracking-tight">{copy.completedTitle}</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--noviq-muted)]">{copy.completedBody}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-soft)] p-4 text-left">
                    <div><p className="text-xs text-[var(--noviq-muted)]">{copy.timeSpent}</p><p className="mt-1 font-bold tabular-nums">{formatTime(elapsedTime)}</p></div>
                    <div><p className="text-xs text-[var(--noviq-muted)]">{copy.status}</p><p className="mt-1 font-bold text-[#237A5C]">{copy.completed}</p></div>
                  </div>
                  <button type="button" onClick={() => { onComplete(elapsedTime); onClose(); }} className="min-h-12 w-full rounded-xl bg-[#315EFB] px-5 text-sm font-bold text-white hover:bg-[#244BD3]">{copy.continue}</button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
