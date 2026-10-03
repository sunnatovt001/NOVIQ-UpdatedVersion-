import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Clock, CheckCircle2, Play } from "lucide-react";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";

interface TaskStarterModalProps {
  task: {
    id: string;
    title: string;
    time: string;
    duration: number; // minutes
  };
  onClose: () => void;
  onComplete: (sessionTime: number) => void;
}

export const TaskStarterModal = ({ task, onClose, onComplete }: TaskStarterModalProps) => {
  useBodyScrollLock(true);

  const [step, setStep] = useState<"confirm" | "timer" | "complete">("confirm");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setElapsedTime((prev) => {
          const newTime = prev + 1;
          if (newTime >= task.duration * 60) {
            setIsRunning(false);
            setStep("complete");
            return newTime;
          }
          return newTime;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, task.duration]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const progress = (elapsedTime / (task.duration * 60)) * 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="noviq-modal-backdrop z-50"
      >
        <div className="noviq-modal-positioner noviq-modal-md">
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="noviq-modal-panel CustomScrollbar relative rounded-[3rem] border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>

          <AnimatePresence mode="wait">
            {/* Confirm Step */}
            {step === "confirm" && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-2xl font-black text-white mb-2">Ready to Start?</h2>
                  <p className="text-slate-400 text-sm">Complete this task to improve your profile</p>
                </div>

                <div className="space-y-4 bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Task</p>
                    <p className="text-lg font-bold text-white">{task.title}</p>
                  </div>
                  <div className="h-px bg-white/10" />
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-blue-400" />
                      <p className="text-sm text-slate-300">{task.duration} min</p>
                    </div>
                    <div className="h-1 flex-1 bg-white/10 rounded-full" />
                    <p className="text-xs text-slate-500">{task.time}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setStep("timer");
                      setIsRunning(true);
                    }}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-black flex items-center justify-center gap-2 hover:from-blue-500 hover:to-cyan-400 transition-all shadow-lg shadow-blue-600/30"
                  >
                    <Play size={18} />
                    Start Session
                  </button>
                </div>
              </motion.div>
            )}

            {/* Timer Step */}
            {step === "timer" && (
              <motion.div
                key="timer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6 text-center"
              >
                <div>
                  <h2 className="text-xl font-black text-white mb-1">Session in Progress</h2>
                  <p className="text-slate-400 text-sm">{task.title}</p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 bg-blue-600/10 rounded-full blur-[60px]" />
                  <div className="relative text-6xl font-black font-display text-white tracking-tighter mb-6">
                    {formatTime(elapsedTime)}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-400">Progress</span>
                    <span className="text-blue-400">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ type: "tween", ease: "linear" }}
                      className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsRunning(!isRunning);
                  }}
                  className={`w-full py-3 rounded-xl font-bold transition-all ${
                    isRunning
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      : "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                  }`}
                >
                  {isRunning ? "Pause" : "Resume"}
                </button>

                <p className="text-xs text-slate-500">
                  Target: {task.duration} min - keep focusing.
                </p>
              </motion.div>
            )}

            {/* Complete Step */}
            {step === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6 text-center"
              >
                <div className="flex justify-center mb-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2 }}
                    className="p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-full"
                  >
                    <CheckCircle2 size={48} className="text-emerald-400" />
                  </motion.div>
                </div>

                <div>
                  <h2 className="text-2xl font-black text-white mb-2">Task Completed!</h2>
                  <p className="text-slate-400 text-sm">Great session! Keep up the momentum.</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Time Spent</span>
                    <span className="text-xl font-bold text-blue-400">{formatTime(elapsedTime)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Status</span>
                    <span className="text-xl font-bold text-emerald-400">Completed</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onComplete(elapsedTime);
                    onClose();
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-black hover:from-blue-500 hover:to-cyan-400 transition-all shadow-lg shadow-blue-600/30"
                >
                  Continue
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
