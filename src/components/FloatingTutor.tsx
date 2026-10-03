import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { ChevronRight, Loader2, Maximize2, MessageCircle, Minimize2, Send, Sparkles, X } from "lucide-react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { askTutor } from "@/src/lib/gemini";
import { useAuth } from "@/src/contexts/AuthContext";
import { trackUserEvent } from "@/src/lib/analytics";
import { db } from "@/src/lib/firebase";
import { getAppErrorMessage } from "@/src/lib/errors";
import { cn } from "@/src/lib/utils";
import { buildStudentTutorContext } from "@/src/lib/tutorContext";
import { makeSyncId } from "@/src/lib/localStore";
import { writeDocWithQueue } from "@/src/lib/offlineSync";

const SAIDAMIN_AVATAR = "/saidamin-avatar.jpg";

type FloatingTutorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const INTRO_MESSAGE: FloatingTutorMessage = {
  id: "intro",
  role: "assistant",
  content:
    "Salom, men Saidamin. Maqsadim oddiy javob emas, imtihon natijangizni oshirish. Dars, test, reja yoki xatoni yuboring.",
};

const QUICK_PROMPTS = [
  "Bugungi o'qish rejamni tuzib ber",
  "Eng zaif joyimni tuzat",
  "Menga 5 ta exam-style savol ber",
];

export const FloatingTutor = ({ activeTab }: { activeTab?: string }) => {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<FloatingTutorMessage[]>([INTRO_MESSAGE]);
  const [cloudHistory, setCloudHistory] = useState<FloatingTutorMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const history = useMemo(
    () =>
      [...cloudHistory, ...messages]
        .filter((message) => message.id !== "intro")
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content })),
    [cloudHistory, messages]
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping, isOpen]);

  useEffect(() => {
    if (!user) return undefined;

    const historyQuery = query(
      collection(db, "users", user.uid, "tutorMessages"),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    return onSnapshot(
      historyQuery,
      (snapshot) => {
        const remoteHistory = snapshot.docs
          .map((document) => {
            const data = document.data();
            return {
              id: document.id,
              role: data.role,
              content: data.content,
            } as FloatingTutorMessage;
          })
          .reverse();
        setCloudHistory(remoteHistory);
      },
      (error) => {
        console.warn(getAppErrorMessage(error));
      }
    );
  }, [user]);

  const persistMessage = async (message: Omit<FloatingTutorMessage, "id">) => {
    if (!user) return;
    const messageId = makeSyncId("floating-tutor-message");
    await writeDocWithQueue({
      userId: user.uid,
      path: ["users", user.uid, "tutorMessages", messageId],
      data: {
      role: message.role,
      content: message.content,
      source: "floating-widget",
      createdAt: new Date().toISOString(),
      },
      merge: true,
    });
  };

  const sendPrompt = async (rawPrompt = input) => {
    const prompt = rawPrompt.trim();
    if (!prompt || isTyping || !user) return;

    const userMessage: FloatingTutorMessage = {
      id: `floating-user-${Date.now()}`,
      role: "user",
      content: prompt,
    };

    setInput("");
    setError("");
    setIsTyping(true);
    setMessages((current) => [...current, userMessage]);
    trackUserEvent(user.uid, "tutor_message_sent", 0, { tutorMessagesSent: 1, surface: "floating" }).catch(() => undefined);
    persistMessage({ role: "user", content: prompt }).catch((err) => console.warn(getAppErrorMessage(err)));

    try {
      const context = [
        "You are Saidamin, the Noviq Tutor.",
        "Answer in the user's language. If the user writes Uzbek, answer naturally in Uzbek Latin.",
        "Be concise, exam-focused, and always end with the next study action.",
        activeTab ? `Current app screen: ${activeTab}.` : "",
        buildStudentTutorContext(profile, user.uid),
      ]
        .filter(Boolean)
        .join("\n");

      const answer = await askTutor(prompt, context, "uz-UZ", {
        history,
        retries: 2,
      });

      const assistantMessage: FloatingTutorMessage = {
        id: `floating-assistant-${Date.now()}`,
        role: "assistant",
        content: answer,
      };

      setMessages((current) => [...current, assistantMessage]);
      persistMessage({ role: "assistant", content: answer }).catch((err) => console.warn(getAppErrorMessage(err)));
    } catch (err) {
      const message = getAppErrorMessage(err);
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: `floating-error-${Date.now()}`,
          role: "assistant",
          content: `Hozir javob berishda muammo bo'ldi.\n\n${message}`,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed bottom-3 left-3 right-3 z-[180] flex flex-col items-end gap-3 sm:bottom-7 sm:left-auto sm:right-7",
        activeTab === "admin" && "max-sm:hidden"
      )}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.section
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={cn(
              "noviq-popover-viewport rounded-[2rem] border border-[#E5E7EB] bg-white text-[#111827] shadow-[0_24px_80px_rgba(17,24,39,0.14)]",
              "w-full sm:w-[min(calc(100vw-1.5rem),430px)]",
              isCompact ? "h-[440px]" : "h-[min(72vh,640px)]"
            )}
          >
            <header className="relative border-b border-[#E5E7EB] bg-[#FAFAF8] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
                  <img src={SAIDAMIN_AVATAR} alt="Saidamin" className="h-full w-full object-cover object-top" />
                  <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white bg-[#3F7D58]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-black tracking-tight">Saidamin</h2>
                    <span className="rounded-full border border-[#3F7D58]/20 bg-[#F0FDF4] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[#3F7D58]">
                      Live
                    </span>
                  </div>
                  <p className="truncate text-xs font-medium text-[#6B7280]">Exam mentor / next score move</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCompact((current) => !current)}
                  className="hidden rounded-xl border border-[#E5E7EB] bg-white p-2 text-[#6B7280] transition hover:border-[#3F7D58] hover:bg-[#F0FDF4] hover:text-[#111827] sm:block"
                  aria-label={isCompact ? "Expand tutor" : "Compact tutor"}
                >
                  {isCompact ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-[#E5E7EB] bg-white p-2 text-[#6B7280] transition hover:border-[#3F7D58] hover:bg-[#F0FDF4] hover:text-[#111827]"
                  aria-label="Close Saidamin tutor"
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            <div ref={scrollRef} className="CustomScrollbar h-[calc(100%-154px)] space-y-4 overflow-y-auto px-4 py-4">
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
                          ? "rounded-br-md bg-[#3F7D58] text-white shadow-none"
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
                  Saidamin javob yozmoqda...
                </div>
              )}

              {error && <p className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs font-semibold text-red-100">{error}</p>}
            </div>

            <div className="border-t border-[#E5E7EB] bg-[#FAFAF8] p-3">
              {messages.length === 1 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {QUICK_PROMPTS.map((prompt) => (
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
              <div className="flex items-end gap-2 rounded-[1.35rem] border border-[#E5E7EB] bg-white p-2 focus-within:border-[#3F7D58]">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendPrompt();
                    }
                  }}
                  rows={1}
                  placeholder="Saidamindan so'rang..."
                  className="CustomScrollbar min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-[#111827] outline-none placeholder:text-[#9CA3AF]"
                />
                <button
                  type="button"
                  onClick={() => sendPrompt()}
                  disabled={!input.trim() || isTyping}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#3F7D58] text-white transition hover:bg-[#2F6145] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
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
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-3 rounded-full border border-[#E5E7EB] bg-white p-2 pr-4 text-left text-[#111827] shadow-[0_18px_50px_rgba(17,24,39,0.12)]"
          aria-label="Open Saidamin Noviq Tutor"
        >
          <span className="relative h-16 w-16 overflow-hidden rounded-full border-4 border-[#3F7D58]/30 bg-white">
            <img src={SAIDAMIN_AVATAR} alt="Saidamin" className="h-full w-full object-cover object-top" />
          </span>
          <span className="relative hidden sm:block">
            <span className="flex items-center gap-2 text-sm font-black">
              Saidamin <Sparkles size={14} className="text-[#3F7D58]" />
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-[#6B7280]">
              Ask Noviq Tutor <ChevronRight size={13} />
            </span>
          </span>
        </motion.button>
      )}

      {!isOpen && activeTab !== "tutor" && (
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="pointer-events-none hidden rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-xs font-bold text-[#6B7280] shadow-[0_18px_50px_rgba(17,24,39,0.10)] sm:block"
        >
          <span className="inline-flex items-center gap-2">
            <MessageCircle size={14} className="text-[#3F7D58]" />
            Stuck? Saidamindan so'rang.
          </span>
        </motion.div>
      )}
    </div>
  );
};
