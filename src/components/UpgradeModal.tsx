import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";

interface UpgradeModalProps {
  open: boolean;
  title?: string;
  message?: string;
  onClose: () => void;
  onUpgrade: () => void;
}

export const UpgradeModal = ({
  open,
  title = "You have reached today's free limit",
  message = "Upgrade to Noviq Pro for unlimited exam assistance and advanced academic intelligence.",
  onClose,
  onUpgrade,
}: UpgradeModalProps) => {
  useBodyScrollLock(open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="noviq-modal-backdrop z-[220]"
        >
          <div className="noviq-modal-positioner noviq-modal-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="noviq-modal-panel CustomScrollbar relative rounded-[2rem] border border-[#E5E7EB] bg-white p-6 text-[#111827] shadow-[0_30px_90px_rgba(17,24,39,0.18)]"
            >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#6B7280] transition hover:text-[#111827]"
            aria-label="Close upgrade prompt"
          >
            <X size={17} />
          </button>

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0FDF4] text-[#3F7D58]">
            <Sparkles size={22} />
          </div>

          <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-[#3F7D58]">Noviq Pro</p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-[#6B7280]">{message}</p>

          <div className="mt-6 rounded-2xl border border-[#E5E7EB] bg-[#FAFAF8] p-4">
            <p className="text-sm font-bold text-[#111827]">Pro includes unlimited Noviq Tutor, AI Writing and Speaking Evaluation, Weakness Intelligence, Success Probability, and Advanced Analytics.</p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onUpgrade}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#3F7D58] px-5 text-sm font-black text-white transition hover:bg-[#2F6145]"
            >
              Upgrade to Pro
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-5 text-sm font-bold text-[#111827] transition hover:bg-[#FAFAF8]"
            >
              Keep Free
            </button>
          </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
