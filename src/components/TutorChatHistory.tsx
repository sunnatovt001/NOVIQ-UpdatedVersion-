import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Search, SquarePen, X, Loader2, ChevronDown } from "lucide-react";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import type { useTutorHistory } from "@/src/lib/useTutorHistory";
import { cn } from "@/src/lib/utils";
import { useLocale } from "@/src/contexts/LocaleContext";

type Props = {
  chat: ReturnType<typeof useTutorHistory>;
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  compact?: boolean;
};

/** Shared list: real saved conversations only; pagination never hides older records. */
export function TutorChatHistory({ chat, disabled, onSelect, onNew, compact = false }: Props) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const titleOf = (title: string) =>
    title === "Old conversations"
      ? t("tutor.olderChats")
      : title === "New conversation"
        ? t("tutor.newChat")
        : title;
  const dayGroup = (timestamp: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (timestamp >= today.getTime()) return t("tutor.today");
    if (timestamp >= yesterday.getTime()) return t("tutor.yesterday");
    return t("tutor.olderChats");
  };
  const groups = useMemo(() => {
    const result = new Map<string, typeof chat.conversations>();
    const term = search.trim().toLocaleLowerCase();
    for (const item of chat.conversations) {
      if (!titleOf(item.title).toLocaleLowerCase().includes(term)) continue;
      const group = dayGroup(item.updatedAt);
      result.set(group, [...(result.get(group) || []), item]);
    }
    return [...result.entries()];
  }, [chat.conversations, search, t]);

  return <nav aria-label={t("tutor.historyTitle")} className="flex h-full min-h-0 flex-col text-[#111827]">
    <div className={cn("shrink-0 space-y-3 px-3", compact ? "py-2" : "pb-3 pt-4")}>
      {!compact && <div className="px-1">
        <h3 className="text-base font-bold">{t("tutor.historyTitle")}</h3>
        <p className="mt-1 text-xs text-[#6B7280]">{t("tutor.historySubtitle")}</p>
      </div>}
      {!compact && <button type="button" disabled={disabled} onClick={onNew}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">
        <SquarePen size={17} aria-hidden="true" /> {t("tutor.newChat")}
      </button>}
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <Search size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
        <input type="search" aria-label={t("tutor.searchLabel")} placeholder={t("tutor.searchPlaceholder")} value={search} onChange={event => setSearch(event.target.value)}
          style={{ outline: "none" }} className="w-full min-w-0 bg-transparent py-2 text-sm placeholder:text-slate-400" />
      </div>
    </div>
    <div className="CustomScrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3" aria-busy={chat.loadingOlder}>
      {groups.map(([group, items]) => <section key={group} aria-label={group} className="mb-4">
        <h4 className="px-3 pb-2 pt-2 text-xs font-semibold text-[#6B7280]">{group}</h4>
        <ul className="space-y-1">
          {items.map(item => <li key={item.id}>
            <button type="button" data-conversation-id={item.id} aria-current={chat.activeId === item.id ? "true" : undefined}
              title={titleOf(item.title)} disabled={disabled} onClick={() => onSelect(item.id)}
              className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50",
                chat.activeId === item.id ? "bg-blue-50 font-semibold text-blue-700 ring-1 ring-inset ring-blue-100" : "text-[#6B7280] hover:bg-slate-100 dark:hover:bg-white/10")}>
              <MessageSquare size={17} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{titleOf(item.title)}</span>
            </button>
          </li>)}
        </ul>
      </section>)}
      {groups.length === 0 && <p role="status" className="px-3 py-6 text-center text-sm text-[#6B7280]">{t("tutor.noMatches")}</p>}
      {chat.hasOlder && <button type="button" disabled={chat.loadingOlder} onClick={() => void chat.loadOlder()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#6B7280] hover:bg-slate-50 disabled:opacity-50">
        {chat.loadingOlder ? <Loader2 size={16} className="animate-spin" /> : <ChevronDown size={16} />}
        {chat.loadingOlder ? t("tutor.loading") : t("tutor.loadOlder")}
      </button>}
      {chat.hasOlder && search.trim() && <p className="px-3 pt-2 text-xs text-[#6B7280]">{t("tutor.searchHint")}</p>}
      {chat.error && <div role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{chat.error}
        <button type="button" onClick={chat.retry} className="mt-2 block font-semibold underline">{t("tutor.retryHistory")}</button>
      </div>}
    </div>
  </nav>;
}

export function TutorHistoryDrawer({ open, onClose, ...props }: Props & { open: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(open, ref, onClose);
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    const wasInert = root?.inert;
    const overflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1280px)");
    const handleResize = () => { if (desktop.matches) onClose(); };
    desktop.addEventListener("change", handleResize);
    return () => {
      if (root) root.inert = wasInert || false;
      document.body.style.overflow = overflow;
      desktop.removeEventListener("change", handleResize);
    };
  }, [open, onClose]);
  if (!open) return null;
  const dark = document.querySelector(".noviq-app")?.classList.contains("dark");
  return createPortal(<div className="fixed inset-0 z-[200] bg-slate-950/40 backdrop-blur-sm" onClick={onClose}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={t("tutor.historyTitle")} tabIndex={-1} onClick={event => event.stopPropagation()}
      className={cn("noviq-app flex h-[100dvh] w-[min(360px,calc(100vw-24px))] flex-col border-r border-slate-200 pb-[env(safe-area-inset-bottom)] shadow-2xl", dark && "dark")}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 text-[#111827]">
        <span className="text-sm font-semibold">Noviq Tutor</span>
        <button type="button" aria-label={t("tutor.closeHistory")} onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-200 dark:hover:bg-white/10"><X size={20} /></button>
      </div>
      <TutorChatHistory {...props} onSelect={id => { props.onSelect(id); onClose(); }} onNew={() => { props.onNew(); onClose(); }} />
    </div>
  </div>, document.body);
}
