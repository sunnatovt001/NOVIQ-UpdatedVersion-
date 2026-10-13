import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { AppLocale } from "@/src/contexts/LocaleContext";
import { useLocale } from "@/src/contexts/LocaleContext";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { getPlannerCopy } from "./plannerCopy";

export function PlannerRecommendationsDialog({locale, loading, recommendation, fallback, failed, onRetry, onClose}: {
  locale: AppLocale; loading: boolean; recommendation: string; fallback: string; failed: boolean; onRetry: () => void; onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const copy = getPlannerCopy(locale);
  const { t } = useLocale();
  useDialogFocus(true, panel, onClose);
  useBodyScrollLock(true);
  return createPortal(
    <div className="noviq-modal-backdrop z-[200]">
      <div className="noviq-modal-positioner noviq-modal-md">
        <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="planner-recommendations-title" tabIndex={-1}
          className="noviq-modal-panel CustomScrollbar relative rounded-3xl border border-[var(--noviq-border)] bg-[var(--noviq-card)] p-6 text-[var(--noviq-text)]">
          <button type="button" onClick={onClose} aria-label={copy.closeRecommendations}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--noviq-border)] text-[var(--noviq-muted)] transition-colors hover:bg-[var(--noviq-soft)]">
            <X size={18} aria-hidden="true" />
          </button>
          <p className="text-sm font-semibold text-[var(--noviq-accent)]">Saidamin AI</p>
          <h2 id="planner-recommendations-title" className="mt-2 pr-10 text-2xl font-bold">{copy.examRecommendations}</h2>
          <div className="mt-6 rounded-2xl border border-[var(--noviq-border)] p-5" aria-busy={loading}>
            {loading ? <p role="status" className="flex items-center gap-3 text-sm text-[var(--noviq-muted)]">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />{copy.generatingRecommendations}
            </p> : <p role={failed ? "alert" : undefined} className="whitespace-pre-wrap text-sm leading-7">{recommendation || fallback}</p>}
            {failed && <button type="button" onClick={onRetry} disabled={loading}
              className="mt-4 min-h-11 rounded-xl border border-[var(--noviq-border)] px-4 py-2 font-semibold transition-colors hover:bg-[var(--noviq-soft)] disabled:opacity-50">
              {t("planner.tryAgain")}
            </button>}
          </div>
        </div>
      </div>
    </div>, document.querySelector('.noviq-app') || document.body,
  );
}
