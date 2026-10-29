import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Globe, Loader2, X, Youtube } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useLocale } from "@/src/contexts/LocaleContext";

export type NotebookSourceTab = "url" | "youtube";

type NotebookSourceDialogProps = {
  open: boolean;
  error?: string;
  dialogRef: RefObject<HTMLDivElement | null>;
  activeTab: NotebookSourceTab;
  sourceUrl: string;
  youtubeUrl: string;
  youtubeTranscript: string;
  loading: boolean;
  onClose: () => void;
  onTabChange: (tab: NotebookSourceTab) => void;
  onSourceUrlChange: (value: string) => void;
  onYoutubeUrlChange: (value: string) => void;
  onYoutubeTranscriptChange: (value: string) => void;
  onAddWebsite: () => void;
  onAnalyzeTranscript: () => void;
};

export const NotebookSourceDialog = ({
  open,
  error,
  dialogRef,
  activeTab,
  sourceUrl,
  youtubeUrl,
  youtubeTranscript,
  loading,
  onClose,
  onTabChange,
  onSourceUrlChange,
  onYoutubeUrlChange,
  onYoutubeTranscriptChange,
  onAddWebsite,
  onAnalyzeTranscript,
}: NotebookSourceDialogProps) => {
  const { t } = useLocale();
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="noviq-modal-backdrop z-[190]"
        >
          <div className="noviq-modal-positioner noviq-modal-lg">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="noviq-modal-panel CustomScrollbar rounded-[1.5rem] border border-slate-200 bg-white p-4 text-slate-950 shadow-2xl sm:rounded-[1.75rem] sm:p-6 dark:border-white/10 dark:bg-[#0B1020] dark:text-white"
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="notebook-source-title"
              tabIndex={-1}
            >
              <div className="mb-5 flex items-start justify-between gap-4 sm:mb-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                    {t("notebook.addSource")}
                  </p>
                  <h3
                    id="notebook-source-title"
                    className="mt-1 text-2xl font-black sm:text-3xl"
                  >
                    {t("notebook.sourceDialogTitle")}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label={t("notebook.closeSource")}
                  onClick={onClose}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5 grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                <button
                  type="button"
                  onClick={() => onTabChange("url")}
                  className={cn(
                    "min-h-11 rounded-xl px-3 text-sm font-bold",
                    activeTab === "url"
                      ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-slate-950"
                      : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {t("notebook.website")}
                </button>
                <button
                  type="button"
                  onClick={() => onTabChange("youtube")}
                  className={cn(
                    "min-h-11 rounded-xl px-3 text-sm font-bold",
                    activeTab === "youtube"
                      ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-slate-950"
                      : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {t("notebook.youtubeTranscript")}
                </button>
              </div>

              {error ? <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
              {activeTab === "url" ? (
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-black text-slate-500 dark:text-slate-400">
                      {t("notebook.websiteUrl")}
                    </span>
                    <input
                      type="url"
                      inputMode="url"
                      value={sourceUrl}
                      onChange={(event) =>
                        onSourceUrlChange(event.target.value)
                      }
                      placeholder="https://example.com/article"
                      className="premium-input"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onAddWebsite}
                    disabled={!sourceUrl.trim() || loading}
                    className="premium-action flex min-h-12 w-full items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Globe size={18} />
                    )}
                    {t("notebook.addWebsite")}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-black text-slate-500 dark:text-slate-400">
                      {t("notebook.youtubeOptional")}
                    </span>
                    <input
                      type="url"
                      inputMode="url"
                      value={youtubeUrl}
                      onChange={(event) =>
                        onYoutubeUrlChange(event.target.value)
                      }
                      placeholder="https://youtube.com/watch?v=…"
                      className="premium-input"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-black text-slate-500 dark:text-slate-400">
                      {t("notebook.transcript")}
                    </span>
                    <textarea
                      value={youtubeTranscript}
                      onChange={(event) =>
                        onYoutubeTranscriptChange(event.target.value)
                      }
                      placeholder={t("notebook.transcriptPlaceholder")}
                      className="premium-input min-h-44 resize-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onAnalyzeTranscript}
                    disabled={(!youtubeTranscript.trim() && !youtubeUrl.trim()) || loading}
                    className="premium-action flex min-h-12 w-full items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Youtube size={18} />
                    )}
                    {t("notebook.analyzeTranscript")}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.querySelector(".noviq-app") || document.body,
  );
};
