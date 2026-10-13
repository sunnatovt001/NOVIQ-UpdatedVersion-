import React, { useEffect, useRef, useState } from "react";
import { useLocale } from "@/src/contexts/LocaleContext";
import { getOnboardingCopy, onboardingOptionLabel, onboardingOptionValue } from "@/src/features/onboarding/onboardingCopy";
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
  icon: LucideIcon;
}

const questions: OnboardingQuestion[] = [
  { id: "mainGoal", icon: Target },
  { id: "userType", icon: GraduationCap },
  { id: "struggle", icon: BookOpen },
];

const LOGO_SRC = "/noviq-logo.jpeg";

export const Onboarding = ({ onComplete }: OnboardingProps) => {
  const { locale } = useLocale();
  const copy = getOnboardingCopy(locale);
  const localizedQuestions = questions.map((question, index) => ({
    ...question, eyebrow: copy.eyebrows[index], title: copy.titles[index], options: copy.options[index],
  }));
  const [step, setStep] = useState(0);
  const [dark] = useState(() => {
    try { return window.localStorage.getItem("noviq-theme") === "dark"; }
    catch { return false; }
  });
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    mainGoal: "",
    userType: "",
    struggle: "",
  });
  const submittingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => { if (step > 0) headingRef.current?.focus(); }, [step]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const currentQuestion = localizedQuestions[step];
  const selectedAnswer = answers[currentQuestion.id];
  const answeredCount = questions.filter((question) => answers[question.id]).length;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const Icon = currentQuestion.icon;

  const handleSelect = async (option: string) => {
    if (submittingRef.current) return;

    const nextAnswers = {
      ...answers,
      [currentQuestion.id]: option,
    };

    setAnswers(nextAnswers);
    setErrorMessage("");

    if (step < questions.length - 1) {
      setStep(step + 1);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onComplete(nextAnswers);
    } catch (error) {
      console.error("Unable to complete onboarding:", error);
      if (mountedRef.current) {
        setErrorMessage(copy.failed);
        setIsSubmitting(false);
        submittingRef.current = false;
      }
    }
  };

  return (
    <div data-onboarding className={`noviq-app ${dark ? "dark" : ""} fixed inset-0 z-50 overflow-y-auto bg-[var(--noviq-bg)] text-[var(--noviq-text)]`}>
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-5 py-5 md:px-8 lg:grid lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-8 lg:px-12 lg:py-8">
        <section
          className="relative lg:p-8"
        >
          <div className="relative space-y-4 lg:space-y-8">
            <div className="flex items-center gap-4">
              <img
                src={LOGO_SRC}
                alt="Noviq logo"
                className="h-12 w-12 rounded-2xl border border-[var(--noviq-border)] object-cover"
              />
              <div>
                <p className="text-sm font-semibold text-[var(--noviq-accent)]">
                  {copy.setup}
                </p>
                <p className="mt-1 text-sm text-[var(--noviq-muted)]">{copy.profile}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-xl text-xl font-bold leading-tight tracking-tight lg:text-5xl">
                {copy.title}
              </h1>
              <p className="hidden max-w-lg text-sm leading-6 text-[var(--noviq-muted)] lg:block lg:text-base">
                {copy.description}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 text-sm font-medium text-[var(--noviq-muted)]">
                <span>
                  {copy.step.replace("{current}", String(step + 1)).replace("{total}", String(questions.length))}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--noviq-border)]">
                <div
                  style={{ width: `${progress}%` }}
                  className="h-full rounded-full bg-[var(--noviq-accent)]"
                />
              </div>
            </div>

            <div className="hidden gap-3 lg:grid">
              {localizedQuestions.map((question, index) => {
                const isAnswered = Boolean(answers[question.id]);
                const QuestionIcon = question.icon;

                return (
                  <div
                    key={question.id}
                    className={`flex items-center gap-3 rounded-xl border p-4 ${
                      index === step
                        ? "border-[var(--noviq-accent)] bg-[var(--noviq-soft)]"
                        : isAnswered
                          ? "border-[var(--noviq-border)] bg-[var(--noviq-card)]"
                          : "border-transparent"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isAnswered ? "bg-[var(--noviq-soft)] text-[var(--noviq-accent)]" : "text-[var(--noviq-muted)]"
                      }`}
                    >
                      {isAnswered ? <Check size={18} strokeWidth={3} /> : <QuestionIcon size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--noviq-muted)]">
                        {question.eyebrow}
                      </p>
                      <p className="text-sm font-semibold text-[var(--noviq-text)]">
                        {answers[question.id] ? onboardingOptionLabel(locale, index, answers[question.id]) : question.title}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-4 md:p-6">
            <div
              key={currentQuestion.id}
              className="p-2 md:p-4"
            >
              <div className="mb-7 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--noviq-soft)] text-[var(--noviq-accent)]">
                  <Icon size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--noviq-accent)]">
                    {currentQuestion.eyebrow}
                  </p>
                  <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-bold leading-tight text-[var(--noviq-text)] md:text-3xl">
                    {currentQuestion.title}
                  </h2>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {currentQuestion.options.map((option, optionIndex) => {
                  const value = onboardingOptionValue(step, optionIndex);
                  const isSelected = selectedAnswer === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelect(value)}
                      disabled={isSubmitting}
                      className={`group flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left text-sm font-semibold leading-5 transition-colors disabled:cursor-not-allowed ${
                        isSelected
                          ? "border-[var(--noviq-accent)] bg-[var(--noviq-soft)] text-[var(--noviq-text)]"
                          : "border-[var(--noviq-border)] bg-[var(--noviq-card)] text-[var(--noviq-text)] hover:border-[var(--noviq-accent)] hover:bg-[var(--noviq-soft)]"
                      }`}
                    >
                      <span>{option}</span>
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                          isSelected
                            ? "border-[var(--noviq-accent)] text-[var(--noviq-accent)]"
                            : "border-[var(--noviq-border)] text-transparent"
                        }`}
                      >
                        <Check size={15} strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div role="status" className="mt-7 min-h-6 text-center text-sm">
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2 text-[var(--noviq-accent)]">
                    <Loader2 size={14} className="animate-spin motion-reduce:animate-none" />
                    {copy.opening}
                  </span>
                ) : (
                  <span className="text-[var(--noviq-muted)]">{copy.select}</span>
                )}
              </div>

              {errorMessage && (
                <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
                  {errorMessage}
                </p>
              )}
            </div>
        </section>
      </main>
    </div>
  );
};
