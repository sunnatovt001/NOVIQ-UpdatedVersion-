import type { GeneratedActivity, TaskProgress } from "./plannerTypes";
import { cn } from "@/src/lib/utils";

interface Props {
  activity: GeneratedActivity;
  progress: TaskProgress;
  submitLabel: string;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onSubmit: () => void;
}

export const PlannerQuizActivity = ({ activity, progress, submitLabel, onAnswer, onSubmit }: Props) => (
<div className="space-y-5">
                  {(activity.questions || []).map((question, index) => (
                    <div
                      key={question.id}
                      className="rounded-[1.25rem] border border-[var(--noviq-border)] bg-[var(--noviq-bg)] p-5"
                    >
                      <p className="text-sm font-black text-[var(--noviq-text)]">
                        {index + 1}. {question.prompt}
                      </p>
                      <div className="mt-4 grid gap-2">
                        {question.options.map((option, optionIndex) => {
                          const selected =
                            progress.quizAnswers[question.id] ===
                            optionIndex;
                          const submitted = progress.submitted;
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
                              aria-pressed={selected}
                              onClick={() =>
                                onAnswer(question.id, optionIndex)
                              }
                              className={cn(
                                "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                                correct
                                  ? "border-[var(--noviq-accent)] bg-[var(--noviq-soft)] text-[var(--noviq-accent)]"
                                  : wrong
                                    ? "border-[var(--noviq-danger-border)] bg-[var(--noviq-danger-bg)] text-[var(--noviq-danger)]"
                                    : selected
                                      ? "border-[var(--noviq-accent)] bg-[var(--noviq-card)] text-[var(--noviq-text)]"
                                      : "border-[var(--noviq-border)] bg-[var(--noviq-card)] text-[var(--noviq-text)] hover:border-[var(--noviq-accent)]",
                              )}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      {progress.submitted && (
                        <p className="mt-3 text-sm font-semibold text-[var(--noviq-muted)]">
                          {question.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={progress.submitted}
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[var(--noviq-accent)] bg-[var(--noviq-soft)] px-5 text-sm font-black text-[var(--noviq-accent)] disabled:cursor-not-allowed disabled:border-[var(--noviq-border)] disabled:bg-[var(--noviq-bg)] disabled:text-[var(--noviq-muted)]"
                  >
                    {submitLabel}
                  </button>
                </div>
);
