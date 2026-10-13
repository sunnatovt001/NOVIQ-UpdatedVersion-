import { Check, Lock, Play } from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { localizeRoadmapPhases } from "./plannerCopy";

interface Props { phases: ReturnType<typeof localizeRoadmapPhases> }

export const PlannerRoadmapCards = ({ phases }: Props) => (
  <div className="grid gap-5 lg:grid-cols-3">
    {phases.map(phase => {
      const isCurrent = phase.state === "current";
      const isDone = phase.state === "done";
      return (
        <article key={phase.phase} className={cn(
          "rounded-[1.5rem] border bg-[var(--noviq-card)] p-6",
          isCurrent ? "border-[var(--noviq-accent)]" : "border-[var(--noviq-border)]",
        )}>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--noviq-muted)]">{phase.phase}</p>
              <h3 className="mt-2 text-2xl font-black text-[var(--noviq-text)]">{phase.title}</h3>
            </div>
            <div className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full",
              isDone ? "bg-[var(--noviq-soft)] text-[var(--noviq-accent)]"
                : isCurrent ? "bg-[var(--noviq-accent)] text-[var(--noviq-on-accent)]"
                  : "bg-[var(--noviq-bg)] text-[var(--noviq-muted)]",
            )}>
              {isDone ? <Check size={20} /> : isCurrent ? <Play size={18} fill="currentColor" /> : <Lock size={18} />}
            </div>
          </div>
          <p className="mb-5 text-sm font-black text-[var(--noviq-accent)]">{phase.status}</p>
          <div className="space-y-3">
            {phase.weeks.map(week => (
              <div key={week} className="rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-bg)] px-4 py-3 text-sm font-semibold text-[var(--noviq-text)]">{week}</div>
            ))}
          </div>
        </article>
      );
    })}
  </div>
);
