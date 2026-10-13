import { useRef } from "react";
import { createPortal } from "react-dom";
import { Trophy, Zap } from "lucide-react";
import type { AppLocale } from "@/src/contexts/LocaleContext";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import type { Celebration } from "./plannerTypes";
import { getPlannerCopy } from "./plannerCopy";
import { ConfettiBurst } from "./ConfettiBurst";

export function PlannerCompletionDialog({celebration, locale, onClose}: {
  celebration: Celebration; locale: AppLocale; onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const copy = getPlannerCopy(locale);
  useDialogFocus(true, panel, onClose);
  useBodyScrollLock(true);
  return createPortal(
    <div className="noviq-modal-backdrop z-[210]">
      <div className="noviq-modal-positioner noviq-modal-sm">
        <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="planner-completion-title" tabIndex={-1}
          className="noviq-modal-panel CustomScrollbar relative rounded-3xl border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6 text-center text-[var(--noviq-text)] sm:p-8">
          <ConfettiBurst large={celebration.type === "mission"} />
          <div className="relative z-10 mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--noviq-soft)] text-[var(--noviq-accent)]">
            {celebration.type === "mission" ? <Trophy size={32} aria-hidden="true" /> : <Zap size={30} aria-hidden="true" />}
          </div>
          <h2 id="planner-completion-title" className="relative z-10 mt-5 text-3xl font-bold">{celebration.title}</h2>
          <p className="relative z-10 mt-2 text-sm text-[var(--noviq-muted)]">{celebration.subtitle}</p>
          <div className="relative z-10 mt-5 rounded-2xl border border-[var(--noviq-border)] bg-[var(--noviq-soft)] px-5 py-4">
            <p className="text-2xl font-bold text-[var(--noviq-accent)]">{copy.practicePoints.replace("{count}", `+${celebration.xp}`)}</p>
            <p className="mt-1 text-sm text-[var(--noviq-muted)]">{celebration.bonusXp ? copy.streakUpdated : copy.progressUpdated}</p>
          </div>
          <button type="button" onClick={onClose} className="relative z-10 mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[var(--noviq-accent)] bg-[var(--noviq-soft)] px-5 text-sm font-semibold text-[var(--noviq-text)] hover:bg-[var(--noviq-card)]">{copy.continue}</button>
        </div>
      </div>
    </div>, document.querySelector('.noviq-app') || document.body,
  );
}
