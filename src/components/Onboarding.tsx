import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Check,
  GraduationCap,
  Loader2,
  Target,
  type LucideIcon,
} from "lucide-react";

interface OnboardingProps {
  onComplete: (answers: OnboardingAnswers) => void | Promise<void>;
}

export interface OnboardingAnswers {
  mainGoal: string;
  userType: string;
  struggle: string;
}

type QuestionId = keyof OnboardingAnswers;

interface OnboardingQuestion {
  id: QuestionId;
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  options: string[];
}

const questions: OnboardingQuestion[] = [
  {
    id: "mainGoal",
    eyebrow: "Goal",
    title: "What's your main goal?",
    icon: Target,
    options: [
      "Prepare for IELTS",
      "Prepare for SAT",
      "Prepare for HSK",
      "Reach a CEFR level",
      "Improve school grades",
      "Prepare for university entrance",
      "Stay consistent with exam prep",
    ],
  },
  {
    id: "userType",
    eyebrow: "Profile",
    title: "What best describes you?",
    icon: GraduationCap,
    options: [
      "High school student",
      "University student",
      "IELTS learner",
      "SAT learner",
      "HSK learner",
      "CEFR learner",
      "University entrance candidate",
    ],
  },
  {
    id: "struggle",
    eyebrow: "Challenge",
    title: "What do you struggle with most?",
    icon: BookOpen,
    options: [
      "Staying consistent",
      "Procrastination",
      "Distractions",
      "Organizing study materials",
      "Time management",
      "Remembering information",
      "Exam anxiety",
    ],
  },
];

const LOGO_SRC = "/noviq-logo.jpeg";

export const Onboarding = ({ onComplete }: OnboardingProps) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    mainGoal: "",
    userType: "",
    struggle: "",
  });
  const [isMoving, setIsMoving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const currentQuestion = questions[step];
  const selectedAnswer = answers[currentQuestion.id];
  const answeredCount = questions.filter((question) => answers[question.id]).length;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const Icon = currentQuestion.icon;

  const handleSelect = (option: string) => {
    if (isMoving || isSubmitting) return;

    const nextAnswers = {
      ...answers,
      [currentQuestion.id]: option,
    };

    setAnswers(nextAnswers);
    setErrorMessage("");

    if (step < questions.length - 1) {
      setIsMoving(true);
      window.setTimeout(() => {
        setStep((currentStep) => Math.min(currentStep + 1, questions.length - 1));
        setIsMoving(false);
      }, 520);
      return;
    }

    setIsSubmitting(true);
    window.setTimeout(async () => {
      try {
        await onComplete(nextAnswers);
      } catch (error) {
        console.error("Unable to complete onboarding:", error);
        setErrorMessage("Profile setup failed. Please try again.");
        setIsSubmitting(false);
      }
    }, 650);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[radial-gradient(circle_at_12%_8%,rgba(245,158,11,0.13),transparent_28%),radial-gradient(circle_at_90%_18%,rgba(14,165,233,0.12),transparent_25%),linear-gradient(180deg,#070a14_0%,#03040c_100%)] text-white selection:bg-amber-400/30">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-5 py-8 md:px-8 lg:grid lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-12">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-3xl backdrop-blur-2xl md:p-8"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
          <div className="relative space-y-8">
            <div className="flex items-center gap-4">
              <img
                src={LOGO_SRC}
                alt="Noviq logo"
                className="h-12 w-12 rounded-2xl border border-white/10 object-cover shadow-lg shadow-cyan-500/10"
              />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">
                  Noviq setup
                </p>
                <p className="mt-1 text-sm text-slate-400">Academic exam profile</p>
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-black leading-tight tracking-tight md:text-5xl">
                Answer a few quick questions
              </h1>
              <p className="max-w-lg text-sm leading-6 text-slate-400 md:text-base">
                Choose one answer for each step. Noviq builds your exam preparation workspace automatically.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                <span>
                  Step {step + 1} of {questions.length}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 via-cyan-300 to-emerald-300"
                />
              </div>
            </div>

            <div className="grid gap-3">
              {questions.map((question, index) => {
                const isAnswered = Boolean(answers[question.id]);
                const QuestionIcon = question.icon;

                return (
                  <div
                    key={question.id}
                    className={`flex items-center gap-3 rounded-2xl border p-4 transition ${
                      index === step
                        ? "border-amber-300/40 bg-amber-300/10"
                        : isAnswered
                          ? "border-emerald-400/25 bg-emerald-400/10"
                          : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isAnswered ? "bg-emerald-300 text-slate-950" : "bg-slate-900 text-slate-500"
                      }`}
                    >
                      {isAnswered ? <Check size={18} strokeWidth={3} /> : <QuestionIcon size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                        {question.eyebrow}
                      </p>
                      <p className="truncate text-sm font-bold text-white">
                        {answers[question.id] || question.title}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-3xl backdrop-blur-2xl md:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -18, filter: "blur(8px)" }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:p-8"
            >
              <div className="mb-7 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-amber-300">
                  <Icon size={24} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.26em] text-amber-300">
                    {currentQuestion.eyebrow}
                  </p>
                  <h2 className="mt-2 text-3xl font-black leading-tight text-white md:text-4xl">
                    {currentQuestion.title}
                  </h2>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {currentQuestion.options.map((option) => {
                  const isSelected = selectedAnswer === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelect(option)}
                      disabled={isMoving || isSubmitting}
                      className={`group flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left text-sm font-bold leading-5 transition active:scale-[0.99] disabled:cursor-not-allowed ${
                        isSelected
                          ? "border-amber-300/70 bg-amber-300 text-slate-950 shadow-lg shadow-amber-300/15"
                          : "border-white/10 bg-slate-900/60 text-slate-200 hover:border-cyan-300/40 hover:bg-slate-800"
                      }`}
                    >
                      <span>{option}</span>
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                          isSelected
                            ? "border-slate-950 bg-slate-950 text-amber-300"
                            : "border-white/10 text-transparent group-hover:border-cyan-300/50"
                        }`}
                      >
                        <Check size={15} strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-7 min-h-6 text-center text-xs font-black uppercase tracking-[0.22em]">
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2 text-emerald-300">
                    <Loader2 size={14} className="animate-spin" />
                    Opening dashboard
                  </span>
                ) : isMoving ? (
                  <span className="text-cyan-300">Moving to next question</span>
                ) : (
                  <span className="text-slate-500">Select one answer</span>
                )}
              </div>

              {errorMessage && (
                <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">
                  {errorMessage}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
};
