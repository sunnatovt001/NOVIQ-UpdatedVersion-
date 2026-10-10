import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { useLocale } from "@/src/contexts/LocaleContext";
import { getUpgradeCopy } from "@/src/features/pricing/upgradeCopy";

interface UpgradeModalProps {
  open: boolean;
  title?: string;
  message?: string;
  variant?: "default" | "tutor";
  onClose: () => void;
  onUpgrade: () => void;
}

export const UpgradeModal = ({
  open,
  title,
  message,
  variant = "default",
  onClose,
  onUpgrade,
}: UpgradeModalProps) => {
  const { locale } = useLocale();
  const copy = getUpgradeCopy(locale);
  const panel = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  useBodyScrollLock(open);
  useDialogFocus(open, panel, onClose);
  const resolvedTitle = title || (variant === "tutor" ? copy.tutorTitle : copy.defaultTitle);
  const resolvedMessage = message || (variant === "tutor" ? copy.tutorMessage : copy.defaultMessage);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.14 }}
          className="noviq-modal-backdrop z-[220]"
          onClick={onClose}
        >
          <div className="noviq-modal-positioner noviq-modal-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: reduceMotion ? 0 : 0.14, ease: "easeOut" }}
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="upgrade-modal-title"
              onClick={(event) => event.stopPropagation()}
              className="noviq-modal-panel CustomScrollbar relative rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-950 shadow-[0_30px_90px_rgba(17,24,39,0.18)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
            aria-label={copy.close}
          >
            <X size={17} aria-hidden="true" />
          </button>

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            <Sparkles size={22} aria-hidden="true" />
          </div>

          <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">Noviq Pro</p>
          <h2 id="upgrade-modal-title" className="mt-3 text-2xl font-black tracking-tight">{resolvedTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{resolvedMessage}</p>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{copy.includes}</p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onUpgrade}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
            >
              {copy.upgrade}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {copy.keepFree}
            </button>
          </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
