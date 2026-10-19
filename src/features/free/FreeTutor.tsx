import { createTutorRecognition, getTutorSpeechSynthesis, stopTutorRecognition, cancelTutorSpeech } from "@/src/features/tutor/browserSpeech";
import {TutorProControls,useTutorModes} from '@/src/features/pro/TutorProControls';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { askTutor } from "@/src/lib/gemini";
import { trackUserEvent } from "@/src/lib/analytics";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertCircle,
  MessageSquare,
  SquarePen,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  RefreshCcw,
  Send,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/src/lib/utils";
import { classifyAiFailure, getAiFailureMessage, type AiFailureKind } from "@/src/lib/aiFailure";
import { UpgradeModal } from "@/src/components/UpgradeModal";
import { FREE_LIMITS, getLocalDailyUsage, isPro, saveLocalDailyUsage } from "@/src/lib/subscription";
import { getLocalDayKey } from "@/src/lib/progress";
import { buildStudentTutorContext } from "@/src/lib/tutorContext";
import { isLocalAi, useDevelopmentAi } from "@/src/lib/auditMode";
import { TutorChatHistory, TutorHistoryDrawer } from "@/src/components/TutorChatHistory";
import { TutorSaveStatus } from "@/src/components/TutorSaveStatus";
import {useTutorHistory} from "@/src/lib/useTutorHistory";
import {
  fileToTutorAttachment,
  formatBytes,
  type TutorAttachment,
} from "@/src/features/tutor/tutorAttachments";
import {
  getTutorIntro,
  TUTOR_LANGUAGE_OPTIONS,
  type TutorLanguage,
} from "@/src/features/tutor/tutorCopy";
import { useLocale } from "@/src/contexts/LocaleContext";
import { buildTutorRequestContext } from "@/src/features/tutor/tutorRequest";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  attachments?: (Pick<TutorAttachment, "id" | "name" | "mimeType" | "size" | "previewUrl"> & {
    text?: string;
    contentStored?: boolean;
  })[];
}

const ASSISTANT_AVATAR =
  "/saidamin-avatar.jpg";

const INTRO_MESSAGE: Message = {
  id: "intro",
  role: "assistant",
  content: getTutorIntro("en-US"),
};

const Avatar = ({ src, alt, size = "sm" }: { src: string; alt: string; size?: "sm" | "lg" }) => {
  const outerSize = size === "lg" ? "h-10 w-10 sm:h-14 sm:w-14" : "h-10 w-10";
  const dotSize = size === "lg" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full bg-gradient-to-tr from-fuchsia-500 via-amber-300 to-cyan-300 p-[2px] shadow-lg shadow-cyan-500/10",
        outerSize
      )}
    >
      <div className="h-full w-full rounded-full bg-slate-950 p-[2px]">
        <img src={src} alt={alt} className="h-full w-full rounded-full object-cover object-top" />
      </div>
      <span
        className={cn(
          "absolute bottom-0 right-0 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]",
          dotSize
        )}
      />
    </div>
  );
};

export const Tutor = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const { profile, user } = useAuth();
  const tutorModes=useTutorModes(user?.uid),{proTutorMode,explanationDepth,shareProContext}=tutorModes;
  const { locale, setLocale, t } = useLocale();
  const chat = useTutorHistory(user?.uid);
  const [historyOpen, setHistoryOpen] = useState(false);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  const voiceLanguage: TutorLanguage =
    locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const intro = useMemo(
    () => ({ ...INTRO_MESSAGE, content: getTutorIntro(voiceLanguage) }),
    [voiceLanguage],
  );
  const messages: Message[] = useMemo(
    () => (chat.messages.length ? chat.messages : [intro]),
    [chat.messages, intro],
  );
  const ownerRef = useRef(user?.uid); ownerRef.current=user?.uid;
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const aiRequestRef = useRef(false);
  const aiGenerationRef = useRef(0);
  useEffect(() => {
    aiGenerationRef.current += 1;
    aiRequestRef.current = false;
    setIsTyping(false);
    setAiError("");
    setLastRequest(null);
    return () => { aiGenerationRef.current += 1; };
  }, [user?.uid]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<TutorAttachment[]>([]);
  const [uploadError, setUploadError] = useState("");
  const historyError = chat.error;
  const [aiFailure, setAiError] = useState<"" | { kind: AiFailureKind } | { speech: true }>("");
  const aiError = aiFailure === "" ? "" : "kind" in aiFailure ? getAiFailureMessage(aiFailure.kind, locale) : t("tutor.speechUnsupported");
  const [lastRequest, setLastRequest] = useState<{ prompt: string; attachments: TutorAttachment[] } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [tutorUsage, setTutorUsage] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(getTutorSpeechSynthesis());
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const persistedMessages = useMemo(() => messages.filter((message) => message.id !== "intro"), [messages]);
  const dayKey = getLocalDayKey();
  const activePro = isPro(profile);
  const tutorLimit = FREE_LIMITS.aiTutorMessagesPerDay;
  const localProvider = isLocalAi || useDevelopmentAi;
  const remainingTutorMessages = activePro ? Infinity : Math.max(0, tutorLimit - tutorUsage);

  useEffect(() => {
    if (!user) return;
    const cloudUsage = profile?.usage?.aiTutor?.[dayKey];
    const localUsage = getLocalDailyUsage(user.uid, "aiTutor", dayKey);
    // Server usage can decrease after a correction. A stale browser counter
    // must not keep blocking requests; the callable enforces the actual limit.
    setTutorUsage(typeof cloudUsage === 'number' && Number.isFinite(cloudUsage) ? cloudUsage : localUsage);
  }, [dayKey, profile?.usage?.aiTutor, user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping, attachedFiles, aiError, historyError, chat.saveError]);

  useEffect(() => {
    recognitionRef.current = createTutorRecognition(voiceLanguage);
    if (recognitionRef.current) {
      recognitionRef.current.onresult = (event: any) => {
        setInput(event.results[0][0].transcript);
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }

    return () => {
      stopTutorRecognition(recognitionRef.current);
    };
  }, [voiceLanguage]);

  useEffect(() => {
    return () => {
      attachedFiles.forEach((file) => {
        if (file.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(file.previewUrl);
      });
      cancelTutorSpeech(synthesisRef.current);
      stopTutorRecognition(recognitionRef.current);
    };
  }, [attachedFiles]);

  const speak = (text: string) => {
    if (!autoSpeak || !synthesisRef.current) return;
    cancelTutorSpeech(synthesisRef.current);
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*`_]/g, ""));
    utterance.lang = voiceLanguage;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechUtteranceRef.current = utterance;
    synthesisRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    cancelTutorSpeech(synthesisRef.current);
    speechUtteranceRef.current = null;
    setIsSpeaking(false);
  };

  const handleToggleListening = () => {
    if (!recognitionRef.current) {
      setAiError({ speech: true });
      return;
    }

    if (isListening) {
      stopTutorRecognition(recognitionRef.current);
      setIsListening(false);
      return;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (error) {
      console.warn("Speech recognition failed to start", error);
      setIsListening(false);
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;

    setUploadError("");

    try {
      const processed = await Promise.all(
        fileArray.map(fileToTutorAttachment),
      );
      setAttachedFiles((current) => [...current, ...processed]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("tutor.uploadFailed"));
    }
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles((current) => current.filter((file) => file.id !== id));
  };

  const submitPrompt = async (prompt: string, files: TutorAttachment[], retry = false) => {
    if (!user) return;
    if ((!prompt.trim() && files.length === 0) || aiRequestRef.current) return;
    if (!retry && !localProvider && !activePro && tutorUsage >= tutorLimit) {
      setUpgradeOpen(true);
      return;
    }

    const cleanPrompt = prompt.trim() || t("tutor.analyzeFile");
    aiRequestRef.current = true;
    const attachmentMeta = files.map(({ id, name, mimeType, size, text }) => ({
      id,
      name,
      mimeType,
      size,
      text: text?.slice(0, 50000),
      contentStored: Boolean(text),
    }));

    setInput("");
    setAttachedFiles([]);
    setUploadError("");
    setAiError("");
    setIsTyping(true);
    setLastRequest({ prompt: cleanPrompt, attachments: files });

    const requestOwner = user.uid;
    const generation = aiGenerationRef.current;
    const isCurrent = () => ownerRef.current === requestOwner && aiGenerationRef.current === generation;
    const conversationId = chat.activeId;
    if (!retry) chat.add({role:"user",content:cleanPrompt,attachments:attachmentMeta},conversationId);

    const nextUsage = tutorUsage + 1;
    if (!retry && user && !activePro && !localProvider) {
      setTutorUsage(nextUsage);
      try { saveLocalDailyUsage(user.uid, "aiTutor", nextUsage, dayKey); }
      catch { console.warn("Tutor usage cache unavailable; server limits still apply"); }
    }

    try {
      trackUserEvent(user.uid, "tutor_message_sent", 0, { tutorMessagesSent: 1 }).catch(() => undefined);
      const studentContext = activePro && proTutorMode!=='standard' && !shareProContext ? '' : buildStudentTutorContext(profile, user?.uid);
      const tutorContext = buildTutorRequestContext(voiceLanguage, studentContext, files);

      const response = await askTutor(cleanPrompt, tutorContext, voiceLanguage, {
        history: persistedMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        attachments: files,
        ...(activePro&&proTutorMode!=='standard'?{premiumMode:proTutorMode,depth:explanationDepth}:{}),
        retries: 2,
      });

      if (!isCurrent()) return;
      chat.add({role:"assistant",content:response},conversationId);
      speak(response);
    } catch (error) {
      if (!isCurrent()) return;
      setAiError({ kind: classifyAiFailure(error) });
    } finally {
      if (isCurrent()) {
        aiRequestRef.current = false;
        setIsTyping(false);
      }
    }
  };

  const handleSend = () => submitPrompt(input, attachedFiles);

  const userAvatar =
    profile?.photoURL ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
      profile?.displayName || profile?.email || "student"
    )}&backgroundColor=ffd5dc,c0aede,d1d4f9&radius=50`;

  const selectConversation = (id: string) => { chat.select(id); setAiError(""); setLastRequest(null); };
  const newConversation = () => { chat.newChat(); setAiError(""); setLastRequest(null); };
  const historyProps = { chat, disabled: isTyping, onSelect: selectConversation, onNew: newConversation };

  return (
    <div className="tutor-workspace flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 shadow-xl sm:rounded-[1.5rem]">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 xl:block" style={{background: "var(--noviq-card)"}}>
        <TutorChatHistory {...historyProps} />
      </aside>
      <TutorHistoryDrawer {...historyProps} open={historyOpen} onClose={closeHistory} />
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-950/70 backdrop-blur-2xl",
        isDragging ? "border-cyan-300/50 ring-4 ring-cyan-300/10" : "border-white/10"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 text-[#111827] xl:hidden">
        <button type="button" aria-expanded={historyOpen} aria-haspopup="dialog" onClick={() => setHistoryOpen(true)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-white/10">
          <MessageSquare size={18} /> {t("tutor.chats")}
        </button>
        <button type="button" disabled={isTyping} onClick={newConversation} className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          <SquarePen size={17} /> {t("tutor.newChat")}
        </button>
      </div>
      <UpgradeModal
        open={upgradeOpen}
        variant="tutor"
        onClose={() => setUpgradeOpen(false)}
        onUpgrade={() => {
          setUpgradeOpen(false);
          setActiveTab("pricing");
        }}
      />

      {activePro&&<TutorProControls isTyping={isTyping} {...tutorModes}/> }
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.docx,.txt,.md,.csv,.json"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="flex shrink-0 flex-col gap-2 border-b border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-4">
          <Avatar src={ASSISTANT_AVATAR} alt="Noviq Tutor" size="lg" />
          <div>
            <h2 className="font-display text-base font-bold text-white sm:text-xl">Saidamin - Noviq Tutor</h2>
            <p className="hidden text-[10px] font-black uppercase tracking-widest text-cyan-300 sm:block">
              {t("tutor.coaching")}
            </p>
          </div>
        </div>
        <div className="flex max-w-full items-center gap-2 overflow-x-auto">
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-300">
            {localProvider ? "Saidamin AI" : activePro ? "Pro AI" : t("tutor.freeRemaining").replace("{count}", String(remainingTutorMessages))}
          </div>
          <select
            value={voiceLanguage}
            onChange={(event) => {
              const language = event.target.value as TutorLanguage;
              setLocale(
                language === "uz-UZ" ? "uz" : language === "ru-RU" ? "ru" : "en",
              );
            }}
            aria-label={t("tutor.languageLabel")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none transition hover:border-blue-400 focus:border-blue-400"
          >
            {TUTOR_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAutoSpeak(!autoSpeak)}
            className={cn(
              "rounded-xl border p-2.5 transition-all",
              autoSpeak ? "border-blue-500/20 bg-blue-600/20 text-blue-300" : "border-white/10 bg-white/5 text-slate-500"
            )}
            aria-label={t("tutor.voiceToggle")}
          >
            {autoSpeak ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button
            type="button"
            onClick={stopSpeaking}
            disabled={!isSpeaking}
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
              {t("tutor.stop")}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="CustomScrollbar tutor-messages min-h-0 flex-1 space-y-5 overflow-y-auto p-3 sm:p-5">
      {historyError && <div role="alert" className="z-10 shrink-0 bg-amber-50 p-3 text-sm text-amber-900 xl:hidden">{historyError} <button onClick={chat.retry} className="underline">{t("tutor.retryHistory")}</button></div>}
      <TutorSaveStatus message={chat.saveError} retry={chat.retrySaving} />
        {messages.map((message) => (
          <div key={message.id} className={cn("flex gap-2.5 sm:gap-3", message.role === "user" && "flex-row-reverse")}>
            <Avatar
              src={message.role === "assistant" ? ASSISTANT_AVATAR : userAvatar}
              alt={message.role === "assistant" ? "Saidamin" : "You"}
            />
            <div
              className={cn(
                "min-w-0 max-w-[calc(100%-3.25rem)] break-words rounded-2xl p-3 text-sm leading-relaxed sm:p-4 sm:text-base",
                message.role === "assistant"
                  ? "border border-white/10 bg-white/[0.04] text-slate-200"
                  : "chat-user-message bg-blue-600 text-white shadow-xl shadow-blue-600/20"
              )}
            >
              {message.attachments && message.attachments.length > 0 && (
                <div className="mb-4 grid gap-2">
                  {message.attachments.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 rounded-xl bg-black/10 p-2 text-xs">
                      {file.previewUrl ? (
                        <img src={file.previewUrl} alt={file.name} className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <FileText size={18} />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold">{file.name}</p>
                        <p className="opacity-70">{formatBytes(file.size)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="mb-4 list-disc pl-4">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
                  li: ({ children }) => <li className="mb-2">{children}</li>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-4 pl-2">
            <Avatar src={ASSISTANT_AVATAR} alt="Noviq Tutor" />
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <Loader2 size={16} className="animate-spin text-cyan-300" />
              <span role="status" className="text-[10px] font-black uppercase tracking-widest text-cyan-300">
                 {t("tutor.analyzing")}
              </span>
            </div>
          </motion.div>
        )}
        <AnimatePresence>
          {(attachedFiles.length > 0 || uploadError || aiError) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-4 space-y-3 overflow-hidden"
            >
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex max-w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-2 pr-3 text-xs font-bold text-white"
                    >
                      {file.previewUrl ? (
                        <img src={file.previewUrl} alt={file.name} className="h-9 w-9 rounded-xl object-cover" />
                      ) : file.mimeType.startsWith("image/") ? (
                        <ImageIcon size={16} className="text-blue-300" />
                      ) : (
                        <FileText size={16} className="text-purple-300" />
                      )}
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <span className="text-slate-500">{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(file.id)}
                        className="rounded-lg p-1 text-slate-500 transition hover:bg-white/10 hover:text-red-300"
                        aria-label={t("tutor.removeAttachment", { name: file.name })}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploadError && (
                <div className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200">
                  <AlertCircle size={16} />
                  {uploadError}
                </div>
              )}

              {aiError && lastRequest && (
                <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-[var(--noviq-danger-border)] bg-[var(--noviq-danger-bg)] px-4 py-3 text-sm text-[var(--noviq-danger)] sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold">{aiError}</span>
                  <button
                    type="button"
                    onClick={() => submitPrompt(lastRequest.prompt, lastRequest.attachments, true)}
                    disabled={isTyping}
                    className="btn-secondary text-xs"
                  >
                    <RefreshCcw size={14} />
                    {t("tutor.retryAnswer")}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-auto shrink-0 border-t border-white/10 bg-white/[0.02] p-3 sm:p-4">


        <div className="tutor-composer rounded-2xl border border-white/10 bg-white/5 p-2 transition-colors focus-within:border-slate-400">
          <textarea
            aria-label={t("tutor.messageLabel")}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder={t("tutor.askPlaceholder")}
            className="CustomScrollbar max-h-36 min-h-12 w-full resize-none bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 sm:text-base"
          />
          <div className="flex items-center justify-between gap-2 border-t border-white/10 px-1 pt-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                <Paperclip size={18} />
                 <span className="sr-only sm:not-sr-only">{t("tutor.uploadFile")}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                <ImageIcon size={18} />
                 <span className="sr-only sm:not-sr-only">{t("tutor.uploadImage")}</span>
              </button>
              <button
                type="button"
                onClick={handleToggleListening}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all",
                  isListening ? "bg-red-500 text-white" : "bg-white/5 text-slate-400 hover:text-white"
                )}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                 <span className="sr-only sm:not-sr-only">{t("tutor.voice")}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || isTyping}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-xl shadow-blue-500/20 transition hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
               {t("tutor.send")}
            </button>
          </div>
        </div>
        <p className="mt-2 hidden text-center text-[11px] font-medium text-slate-500 sm:block">
          {t("tutor.fileHelp")}
        </p>
      </div>
    </div>
    </div>
  );
};
