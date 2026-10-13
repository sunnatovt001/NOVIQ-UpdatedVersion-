import type { RefObject } from "react";
import {
  Book,
  Brain,
  FileText,
  Highlighter,
  Loader2,
  Map,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/src/lib/utils";
import { formatUnknownDate, type NotebookMessage } from "./notebookModel";
import { useLocale, type TranslationKey } from "@/src/contexts/LocaleContext";

const QUICK_ACTIONS = [
  {
    labelKey: "notebook.actionMastery" as TranslationKey,
    Icon: Sparkles,
    prompt:
      "Create a source-grounded mastery digest with summary, key insights, evidence, exam connection, traps, recall, application, exam question, and next best action.",
  },
  {
    labelKey: "notebook.actionConcepts" as TranslationKey,
    Icon: Book,
    prompt:
      "Extract the exam-relevant concepts from my active note and sources. For each concept include meaning, why it matters, exam relevance, difficulty, common trap, and likely question type.",
  },
  {
    labelKey: "notebook.actionTraps" as TranslationKey,
    Icon: Brain,
    prompt:
      "Identify the highest-risk exam traps and misconceptions in these sources. Explain the gap, consequence, fix, and give practice for each.",
  },
  {
    labelKey: "notebook.actionRecall" as TranslationKey,
    Icon: Highlighter,
    prompt:
      "Generate an active recall session from these sources: recall questions, application questions, exam-style questions, answers, and a spaced-repetition plan.",
  },
  {
    labelKey: "notebook.actionFlashcards" as TranslationKey,
    Icon: FileText,
    prompt:
      "Create application-based flashcards from these sources. Avoid definition-only cards; test problem solving, selection, correction, and exam reasoning.",
  },
  {
    labelKey: "notebook.actionGraph" as TranslationKey,
    Icon: Map,
    prompt:
      "Build a markdown knowledge graph connecting ideas across sources. Include prerequisite links, related materials, weak-topic opportunities, and a learning roadmap.",
  },
] as const;

const splitCitations = (rawContent: string) => {
  const citations: string[] = [];
  const content = rawContent.replace(/\[Source:([^\]]+)\]/g, (_, match) => {
    citations.push(String(match).trim());
    return "";
  });
  return { citations, content };
};

type NotebookAiPanelProps = {
  panelRef: RefObject<HTMLElement | null>;
  mobileOpen: boolean;
  sourceCount: number;
  messages: NotebookMessage[];
  input: string;
  loading: boolean;
  error: string;
  onInputChange: (value: string) => void;
  onAsk: (prompt: string) => void;
  onRetry: () => void;
  onClose: () => void;
};

export const NotebookAiPanel = ({
  panelRef,
  mobileOpen,
  sourceCount,
  messages,
  input,
  loading,
  error,
  onInputChange,
  onAsk,
  onRetry,
  onClose,
}: NotebookAiPanelProps) => {
  const { t } = useLocale();
  const submit = () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    onAsk(prompt);
    onInputChange("");
  };

  return (
    <aside
      ref={panelRef}
      aria-label={t("notebook.aiPanel")}
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-white/10 dark:bg-[#111827] dark:text-white",
        !mobileOpen && "hidden xl:flex",
      )}
    >
      <header className="shrink-0 border-b border-slate-200 p-4 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
              Notebook AI
            </p>
            <h3 className="mt-1 text-xl font-black">{t("notebook.buildMastery")}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {t("notebook.sourcesAvailable", { count: sourceCount })}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("notebook.closeAi")}
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:text-slate-950 xl:hidden dark:bg-white/5 dark:text-slate-400 dark:hover:text-white"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 border-b border-slate-200 p-3 dark:border-white/10">
        {QUICK_ACTIONS.map(({ labelKey, Icon, prompt }) => (
          <button
            key={labelKey}
            type="button"
            onClick={() => onAsk(prompt)}
            disabled={loading}
            className="inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-800 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-emerald-300"
          >
            <Icon size={16} aria-hidden="true" />
            <span className="truncate">{t(labelKey)}</span>
          </button>
        ))}
      </div>

      <div className="CustomScrollbar flex-1 space-y-4 overflow-y-auto p-3 [overscroll-behavior:contain]">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
            {t("notebook.aiEmpty")}
          </div>
        ) : null}

        {messages.map((message) => {
          const isUser = message.role === "user";
          const { citations, content } = splitCitations(
            String(message.content || ""),
          );

          return (
            <div
              key={message.id}
              className={cn(
                "flex min-w-0 items-start gap-2.5",
                isUser && "flex-row-reverse",
              )}
            >
              {isUser ? (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white">
                  {t("notebook.you")}
                </div>
              ) : (
                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-tr from-emerald-600 via-amber-300 to-sky-400 p-[2px]">
                  <img
                    src="/saidamin-avatar.jpg"
                    alt="Saidamin"
                    className="h-full w-full rounded-full bg-white object-cover object-top"
                  />
                </div>
              )}

              <div
                className={cn(
                  "min-w-0 max-w-[82%] rounded-2xl p-3 text-sm leading-6",
                  isUser
                    ? "bg-emerald-700 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200",
                )}
              >
                {!isUser ? (
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">Saidamin</strong>
                    <span className="text-[11px] text-slate-400">
                      {formatUnknownDate(message.createdAt)}
                    </span>
                  </div>
                ) : null}

                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="mb-4 last:mb-0">{children}</p>
                    ),
                  }}
                >
                  {content}
                </ReactMarkdown>

                {citations.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {citations.map((citation) => (
                      <span
                        key={citation}
                        className="rounded-full bg-black/5 px-3 py-1 text-xs font-bold dark:bg-white/5"
                      >
                        {t("notebook.sourceCitation", { name: citation })}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {loading ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
          >
            <Loader2 size={16} className="animate-spin" />
            {t("notebook.aiReading")}
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200 p-3 dark:border-white/10">
        {error ? (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-[var(--noviq-danger-border)] bg-[var(--noviq-danger-bg)] p-3 text-sm text-[var(--noviq-danger)]"
          >
            <p>{error}</p>
            <button
              type="button"
              disabled={loading}
              className="mt-2 min-h-11 font-bold underline"
              onClick={onRetry}
            >
              {t("notebook.retryAi")}
            </button>
          </div>
        ) : null}
        <label className="sr-only" htmlFor="notebook-ai-message">
          {t("notebook.askAi")}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="notebook-ai-message"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={t("notebook.aiPlaceholder")}
            className="CustomScrollbar min-h-14 min-w-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
          />
          <button
            type="button"
            aria-label={t("notebook.askAi")}
            onClick={submit}
            disabled={!input.trim() || loading}
            className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-3 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50 2xl:px-4"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
            <span className="sr-only 2xl:not-sr-only">{t("notebook.ask")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
