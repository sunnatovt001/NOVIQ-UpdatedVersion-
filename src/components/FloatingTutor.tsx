import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { ChevronRight, MessageSquare, SquarePen, ArrowLeft, Loader2, Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";
import { askTutor } from "@/src/lib/gemini";
import { useAuth } from "@/src/contexts/AuthContext";
import { trackUserEvent } from "@/src/lib/analytics";
import { getAppErrorMessage } from "@/src/lib/errors";
import { cn } from "@/src/lib/utils";
import { buildStudentTutorContext } from "@/src/lib/tutorContext";
import { TutorChatHistory } from "@/src/components/TutorChatHistory";
import { TutorSaveStatus } from "@/src/components/TutorSaveStatus";
import {useTutorHistory} from "@/src/lib/useTutorHistory";
import { useLocale } from "@/src/contexts/LocaleContext";
import { getTutorIntro, type TutorLanguage } from "@/src/features/tutor/tutorCopy";
import './floating-tutor.css';

const SAIDAMIN_AVATAR = "/saidamin-avatar.jpg";

type FloatingTutorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export const FloatingTutor = ({ activeTab }: { activeTab?: string }) => {
  const { user, profile } = useAuth();
  const { locale, t } = useLocale();
  const tutorLanguage: TutorLanguage =
    locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const introMessage = useMemo<FloatingTutorMessage>(
    () => ({
      id: "intro",
      role: "assistant",
      content: getTutorIntro(tutorLanguage),
    }),
    [tutorLanguage],
  );
  const quickPrompts = useMemo(
    () => [
      t("tutor.promptPlan"),
      t("tutor.promptWeakness"),
      t("tutor.promptQuestions"),
    ],
    [t],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [input, setInput] = useState("");
  const chat=useTutorHistory(user?.uid);
  const messages=useMemo(()=>chat.messages.length?chat.messages:[introMessage],[chat.messages, introMessage]);
  const ownerRef=useRef(user?.uid);ownerRef.current=user?.uid;
  const requestRef=useRef(false);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const [lastPrompt,setLastPrompt]=useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(()=>inputRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setIsOpen(false); requestAnimationFrame(() => launcherRef.current?.focus()); }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const history = useMemo(
    () =>
      messages
        .filter((message) => message.id !== "intro")
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content })),
    [messages]
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping, isOpen]);

  const sendPrompt = async (rawPrompt = input, retry=false) => {
    const prompt = rawPrompt.trim();
    if (!prompt || requestRef.current || !user) return;
    requestRef.current=true;
    const requestOwner=user.uid,conversationId=chat.activeId;
    setLastPrompt(prompt);

    setInput("");
    setError("");
    setIsTyping(true);
    if(!retry)chat.add({role:"user",content:prompt},conversationId);
    trackUserEvent(user.uid, "tutor_message_sent", 0, { tutorMessagesSent: 1, surface: "floating" }).catch(() => undefined);


    try {
      const context = [
        "You are Saidamin, the Noviq Tutor.",
        `The interface language is ${tutorLanguage}. Answer in that language unless the user clearly asks for another one.`,
        "Be concise, exam-focused, and always end with the next study action.",
        activeTab ? `Current app screen: ${activeTab}.` : "",
        buildStudentTutorContext(profile, user.uid),
      ]
        .filter(Boolean)
        .join("\n");

      const answer = await askTutor(prompt, context, tutorLanguage, {
        history,
        retries: 2,
      });

      if(ownerRef.current!==requestOwner)return;
      chat.add({role:"assistant",content:answer},conversationId);
    } catch (err) {
      if(ownerRef.current!==requestOwner)return;
      const message = getAppErrorMessage(err);
      setError(message);
    } finally {
      requestRef.current=false;
      setIsTyping(false);
    }
  };

  return (
    <div
      data-floating-tutor
      className={cn(
        "fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-[100] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 sm:right-5 lg:bottom-5"
      )}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.section
            role="dialog" aria-label="Saidamin tutor"
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={cn(
              "saidamin-glass-chat noviq-popover-viewport flex min-h-0 flex-col rounded-[2rem] border border-[#E5E7EB] bg-white text-[#111827] shadow-[0_24px_80px_rgba(17,24,39,0.14)]",
              "w-full sm:w-[min(calc(100vw-1.5rem),480px)]",
              isCompact ? "h-[min(60dvh,440px)]" : "h-[min(85dvh,720px)]"
            )}
          >
            <header className="relative shrink-0 border-b border-[#E5E7EB] bg-[#FAFAF8] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
                  <img src={SAIDAMIN_AVATAR} alt="Saidamin" className="h-full w-full object-cover object-top" />
                  <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white bg-[#3F7D58]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-black tracking-tight">Saidamin</h2>
                    <span className="rounded-full border border-[#3F7D58]/20 bg-[#F0FDF4] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[#3F7D58]">
                      Tutor
                    </span>
                  </div>
                  <p className="truncate text-xs font-medium text-[#6B7280]">{t("tutor.subtitle")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCompact((current) => !current)}
                  className="hidden rounded-xl border border-[#E5E7EB] bg-white p-2 text-[#6B7280] transition hover:border-[#3F7D58] hover:bg-[#F0FDF4] hover:text-[#111827] sm:block"
                  aria-label={isCompact ? t("tutor.expand") : t("tutor.compact")}
                >
                  {isCompact ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-[#E5E7EB] bg-white p-2 text-[#6B7280] transition hover:border-[#3F7D58] hover:bg-[#F0FDF4] hover:text-[#111827]"
                  aria-label={t("tutor.close")}
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 p-2 text-sm">
              <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 font-semibold hover:bg-slate-50">
                {historyOpen ? <ArrowLeft size={17} /> : <MessageSquare size={17} />}{historyOpen ? t("tutor.backToChat") : t("tutor.chats")}
              </button>
              <button type="button" disabled={isTyping} onClick={() => { chat.newChat(); setError(""); setLastPrompt(""); setHistoryOpen(false); }} className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-3 font-semibold text-white disabled:opacity-50"><SquarePen size={16} /> {t("tutor.newChat")}</button>
            </div>
            {historyOpen && <div className="min-h-0 flex-1" style={{background: "var(--noviq-card)"}}>
              <TutorChatHistory compact chat={chat} disabled={isTyping} onSelect={id => { chat.select(id); setError(""); setLastPrompt(""); setHistoryOpen(false); }} onNew={() => { chat.newChat(); setError(""); setLastPrompt(""); setHistoryOpen(false); }} />
            </div>}
            <div ref={scrollRef} className={cn("CustomScrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4", historyOpen && "hidden")}>
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div key={message.id} className={cn("flex gap-3", isUser && "justify-end")}>
                    {!isUser && (
                      <img
                        src={SAIDAMIN_AVATAR}
                        alt="Saidamin"
                        className="mt-1 h-8 w-8 shrink-0 rounded-full border border-white/10 object-cover object-top"
                      />
                    )}
                    <div
                      className={cn(
                        "max-w-[82%] rounded-[1.35rem] px-4 py-3 text-sm leading-6 shadow-xl",
                        isUser
                          ? "chat-user-message rounded-br-md bg-[#3F7D58] text-white shadow-none"
                          : "rounded-bl-md border border-[#E5E7EB] bg-[#FAFAF8] text-[#111827] shadow-none"
                      )}
                    >
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className={cn("font-black", isUser ? "text-white" : "text-[#111827]")}>{children}</strong>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F0FDF4] px-4 py-3 text-sm font-bold text-[#3F7D58]">
                  <Loader2 size={16} className="animate-spin" />
                  {t("tutor.typing")}
                </div>
              )}

              {error && <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">{error} <button type="button" disabled={isTyping} onClick={()=>void sendPrompt(lastPrompt,true)} className="ml-2 underline">{t("tutor.retryAnswer")}</button></div>}
              {chat.error && <div role="alert" className="text-sm text-amber-900">{chat.error} <button type="button" onClick={chat.retry} className="underline">{t("tutor.retryHistory")}</button></div>}
              <TutorSaveStatus message={chat.saveError} retry={chat.retrySaving} />
              {chat.hasOlder && <button type="button" disabled={chat.loadingOlder} onClick={()=>void chat.loadOlder()} className="text-sm underline">{t("tutor.loadOlder")}</button>}
            </div>

            <div className="shrink-0 border-t border-[#E5E7EB] bg-[#FAFAF8] p-3">
              {!historyOpen && messages.length === 1 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendPrompt(prompt)}
                      className="shrink-0 rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#6B7280] transition hover:border-[#3F7D58] hover:bg-[#F0FDF4] hover:text-[#111827]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
              <div className="tutor-composer flex items-end gap-2 rounded-[1.35rem] border border-[#E5E7EB] bg-white p-2 focus-within:border-slate-400">
                <textarea
                  ref={inputRef}
                  aria-label={t("tutor.messageLabel")}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      sendPrompt();
                    }
                  }}
                  rows={1}
                  placeholder={t("tutor.askPlaceholder")}
                  className="CustomScrollbar min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-[#111827] outline-none placeholder:text-[#9CA3AF]"
                />
                <button
                  type="button"
                  onClick={() => sendPrompt()}
                  disabled={!input.trim() || isTyping || !user}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#3F7D58] text-white transition hover:bg-[#2F6145] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t("tutor.send")}
                >
                  {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {!isOpen && (
        <motion.button
          type="button"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
            ref={launcherRef}
            onClick={() => setIsOpen(true)}
          className="saidamin-glass-launcher group relative flex items-center gap-3 rounded-full border border-[#E5E7EB] bg-white p-2 pr-4 text-left text-[#111827] shadow-[0_18px_50px_rgba(17,24,39,0.12)]"
          aria-label={t("tutor.open")}
        >
          <span className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-[#3F7D58]/30 bg-white">
            <img src={SAIDAMIN_AVATAR} alt="Saidamin" className="h-full w-full object-cover object-top" />
          </span>
          <span className="relative hidden sm:block">
            <span className="flex items-center gap-2 text-sm font-black">
              Saidamin <Sparkles size={14} className="text-[#3F7D58]" />
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-[#6B7280]">
              {t("tutor.launcher")} <ChevronRight size={13} />
            </span>
          </span>
        </motion.button>
      )}

    </div>
  );
};
