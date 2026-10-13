import type { GeneratedActivity } from "./plannerTypes";
import type { getPlannerCopy } from "./plannerCopy";

type Copy = ReturnType<typeof getPlannerCopy>;
interface Props {
  activity: GeneratedActivity;
  value: string;
  copy: Copy;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const PlannerWritingActivity = ({ activity, value, copy, onChange, onSubmit, wordCount }: Props & { wordCount: number }) => (
<div className="space-y-4">
                  <div className="rounded-[1.25rem] border border-[var(--noviq-border)] bg-[var(--noviq-bg)] p-5">
                    <p className="text-sm font-black text-[var(--noviq-text)]">{copy.prompt}</p>
                    <p className="mt-2 text-base leading-7 text-[var(--noviq-text)]">
                      {activity.writingPrompt}
                    </p>
                  </div>
                  <label htmlFor="planner-writing-answer" className="block text-sm font-semibold text-[var(--noviq-text)]">{copy.writingAnswer}</label>
                  <textarea
                    id="planner-writing-answer"
                    value={value}
                    onChange={(event) =>
                      onChange(event.target.value)
                    }
                    className="min-h-64 w-full rounded-[1.25rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-4 text-sm leading-6 text-[var(--noviq-text)] outline-none focus:border-[var(--noviq-accent)] focus:ring-4 focus:ring-[var(--noviq-soft)]"
                    placeholder={copy.writingPlaceholder}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-[var(--noviq-muted)]">
                      {wordCount} /{" "}
                      {activity.minWords || 90} {copy.words}
                    </p>
                    <button
                      type="button"
                      onClick={onSubmit}
                      className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[var(--noviq-accent)] bg-[var(--noviq-soft)] px-5 text-sm font-black text-[var(--noviq-accent)]"
                    >
                      {copy.submitWriting}
                    </button>
                  </div>
                </div>
);

export const PlannerSpeakingActivity = ({ activity, value, copy, onChange, onSubmit }: Props) => (
<div className="space-y-4">
                  <div className="rounded-[1.25rem] border border-[var(--noviq-border)] bg-[var(--noviq-bg)] p-5">
                    <p className="text-sm font-black text-[var(--noviq-text)]">
                      {copy.speakingPrompt}
                    </p>
                    <p className="mt-2 text-base leading-7 text-[var(--noviq-text)]">
                      {activity.speakingPrompt}
                    </p>
                  </div>
                  <label htmlFor="planner-speaking-notes" className="block text-sm font-semibold text-[var(--noviq-text)]">{copy.speakingNotes}</label>
                  <textarea
                    id="planner-speaking-notes"
                    value={value}
                    onChange={(event) =>
                      onChange(event.target.value)
                    }
                    className="min-h-40 w-full rounded-[1.25rem] border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-4 text-sm leading-6 text-[var(--noviq-text)] outline-none focus:border-[var(--noviq-accent)] focus:ring-4 focus:ring-[var(--noviq-soft)]"
                    placeholder={copy.speakingPlaceholder}
                  />
                  <button
                    type="button"
                    onClick={onSubmit}
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[var(--noviq-accent)] bg-[var(--noviq-soft)] px-5 text-sm font-black text-[var(--noviq-accent)]"
                  >
                    {copy.finishSpeaking}
                  </button>
                </div>
);
