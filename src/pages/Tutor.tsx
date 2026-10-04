import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { AiAttachment, askTutor } from "@/src/lib/gemini";
import { trackUserEvent } from "@/src/lib/analytics";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertCircle,
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
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { getAppErrorMessage } from "@/src/lib/errors";
import { UpgradeModal } from "@/src/components/UpgradeModal";
import { FREE_LIMITS, getLocalDailyUsage, isPro, saveLocalDailyUsage } from "@/src/lib/subscription";
import { getLocalDayKey } from "@/src/lib/progress";
import { buildStudentTutorContext } from "@/src/lib/tutorContext";
import { makeSyncId } from "@/src/lib/localStore";
import { writeDocWithQueue } from "@/src/lib/offlineSync";
import { isLocalAi } from "@/src/lib/auditMode";

interface TutorAttachment extends AiAttachment {
  id: string;
  size: number;
  previewUrl?: string;
}

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

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const INTRO_MESSAGE: Message = {
  id: "intro",
  role: "assistant",
  content:
    "Assalomu alaykum!\nMen Saidamin, Noviq Tutorman. Maqsadim oddiy javob berish emas, IELTS, SAT, HSK, CEFR, maktab fanlari yoki universitet imtihonida natijangizni oshirish.\nSavolingizni yozing yoki darslik, konspekt, test, maqola va boshqa akademik hujjatlarni yuklang. Men javobni maqsadingiz, darajangiz va xatolaringizga bog'lab beraman.",
};

const messageTimeToMs = (value: unknown) => {
  if (!value) return Date.now();
  if (typeof value === "number") return Number.isFinite(value) ? value : Date.now();
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  if (typeof value === "object" && value !== null) {
    const timestamp = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
    if (typeof timestamp.toDate === "function") return timestamp.toDate().getTime();
    if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  }
  return Date.now();
};

const isUserMessageOnDay = (data: Record<string, unknown>, dayKey: string) =>
  data.role === "user" && getLocalDayKey(new Date(messageTimeToMs(data.createdAt))) === dayKey;

const Avatar = ({ src, alt, size = "sm" }: { src: string; alt: string; size?: "sm" | "lg" }) => {
  const outerSize = size === "lg" ? "h-14 w-14" : "h-10 w-10";
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

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const readAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const shouldReadText = (file: File) =>
  file.type.startsWith("text/") ||
  /\.(txt|md|csv|json|log|html|css|js|ts|tsx)$/i.test(file.name);

const isDocxFile = (file: File) =>
  file.type === DOCX_MIME_TYPE || /\.docx$/i.test(file.name);

const getSupportedInlineMimeType = (file: File) => {
  if (file.type.startsWith("image/")) return file.type;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "application/pdf";
  return "";
};

const isLegacyOfficeFile = (file: File) => /\.(doc|ppt|pptx)$/i.test(file.name) && !isDocxFile(file);

const extractDocxText = async (file: File) => {
  const mammothModule = (await import("mammoth")) as unknown as {
    extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    default?: { extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
  };
  const mammoth = mammothModule.extractRawText ? mammothModule : mammothModule.default;
  if (!mammoth?.extractRawText) throw new Error("DOCX reader is unavailable.");

  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = result.value.trim();
  if (!text) throw new Error(`${file.name} has no readable text. Export it as PDF or paste the text.`);
  return text;
};

const fileToAttachment = async (file: File): Promise<TutorAttachment> => {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`);
  }

  if (isLegacyOfficeFile(file)) {
    throw new Error(`${file.name} is not supported directly. Upload PDF, DOCX, TXT, image, or paste the text.`);
  }

  if (isDocxFile(file)) {
    return {
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      mimeType: DOCX_MIME_TYPE,
      size: file.size,
      text: await extractDocxText(file),
    };
  }

  if (shouldReadText(file)) {
    return {
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      mimeType: file.type || "text/plain",
      size: file.size,
      text: await readAsText(file),
    };
  }

  const inlineMimeType = getSupportedInlineMimeType(file);
  if (!inlineMimeType) {
    throw new Error(`${file.name} is not supported by the AI service. Upload PDF, DOCX, TXT, image, or paste the text.`);
  }

  const dataUrl = await readAsDataUrl(file);
  const [, data = ""] = dataUrl.split(",");

  return {
    id: `${Date.now()}-${file.name}`,
    name: file.name,
    mimeType: inlineMimeType,
    size: file.size,
    data,
    previewUrl: file.type.startsWith("image/") ? dataUrl : undefined,
  };
};

export const Tutor = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const { profile, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([INTRO_MESSAGE]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const aiRequestRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<TutorAttachment[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [aiError, setAiError] = useState("");
  const [lastRequest, setLastRequest] = useState<{ prompt: string; attachments: TutorAttachment[] } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<"uz-UZ" | "en-US" | "ru-RU">("uz-UZ");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [tutorUsage, setTutorUsage] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(typeof window !== "undefined" ? window.speechSynthesis : null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const persistedMessages = useMemo(() => messages.filter((message) => message.id !== "intro"), [messages]);
  const dayKey = getLocalDayKey();
  const activePro = isPro(profile);
  const tutorLimit = FREE_LIMITS.aiTutorMessagesPerDay;
  const remainingTutorMessages = activePro ? Infinity : Math.max(0, tutorLimit - tutorUsage);

  useEffect(() => {
    if (!user) return;
    const cloudUsage = profile?.usage?.aiTutor?.[dayKey] || 0;
    const localUsage = getLocalDailyUsage(user.uid, "aiTutor", dayKey);
    setTutorUsage(Math.max(cloudUsage, localUsage));
  }, [dayKey, profile?.usage?.aiTutor, user]);

  useEffect(() => {
    if (!user) return undefined;

    const messagesQuery = query(
      collection(db, "users", user.uid, "tutorMessages"),
      orderBy("createdAt", "asc"),
      limit(80)
    );

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        const remoteMessages = snapshot.docs.map((document) => {
          const data = document.data();
          return {
            id: document.id,
            role: data.role,
            content: data.content,
            attachments: data.attachments || [],
            createdAt: messageTimeToMs(data.createdAt),
          } as Message;
        });
        const remoteUsage = snapshot.docs.filter((document) =>
          isUserMessageOnDay(document.data() as Record<string, unknown>, dayKey)
        ).length;
        const localUsage = getLocalDailyUsage(user.uid, "aiTutor", dayKey);
        setTutorUsage(Math.max(remoteUsage, localUsage));

        setMessages(remoteMessages.length ? remoteMessages : [INTRO_MESSAGE]);
      },
      (error) => {
        console.warn(getAppErrorMessage(error));
      }
    );
  }, [dayKey, user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  // Update intro message when language changes so initial greeting matches selected language
  useEffect(() => {
    const introIndex = messages.findIndex((m) => m.id === "intro");
    if (introIndex === -1) return;
    const localized =
      voiceLanguage === "en-US"
        ? `Hello!\nI'm Saidamin, your Noviq Tutor. My job is not to give generic answers; it is to help raise your exam score for IELTS, SAT, HSK, CEFR, school subjects, or university entrance prep. Send a question or upload files (PDF, DOCX, TXT), and I will connect the answer to your goal, level, and mistakes.`
        : voiceLanguage === "ru-RU"
        ? `Здравствуйте!\nЯ Noviq Tutor. Моя задача - не давать общие ответы, а помогать повышать ваш экзаменационный результат. Отправьте вопрос или загрузите файл (PDF, DOCX, TXT), и я свяжу ответ с вашей целью, уровнем и ошибками.`
        : `Assalomu alaykum!\nMen Saidamin, Noviq Tutorman. Maqsadim oddiy javob berish emas, IELTS, SAT, HSK, CEFR, maktab fanlari yoki universitet imtihonida natijangizni oshirish.\nSavolingizni yozing yoki darslik, konspekt, test, maqola va boshqa akademik hujjatlarni yuklang. Men javobni maqsadingiz, darajangiz va xatolaringizga bog'lab beraman.`;

    setMessages((current) => {
      const copy = [...current];
      if (copy[0] && copy[0].id === "intro") {
        copy[0] = { ...copy[0], content: localized };
      }
      return copy;
    });
  }, [voiceLanguage]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = voiceLanguage;
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onresult = (event: any) => {
        setInput(event.results[0][0].transcript);
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }

    return () => {
      recognitionRef.current?.stop?.();
    };
  }, [voiceLanguage]);

  useEffect(() => {
    return () => {
      attachedFiles.forEach((file) => {
        if (file.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(file.previewUrl);
      });
      synthesisRef.current?.cancel();
      recognitionRef.current?.stop?.();
    };
  }, [attachedFiles]);

  const speak = (text: string) => {
    if (!autoSpeak || !synthesisRef.current) return;
    synthesisRef.current.cancel();
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
    synthesisRef.current?.cancel();
    speechUtteranceRef.current = null;
    setIsSpeaking(false);
  };

  const handleToggleListening = () => {
    if (!recognitionRef.current) {
      setAiError("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
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

  const persistMessage = async (message: Omit<Message, "id">) => {
    if (!user || isLocalAi) return;

    const messageId = makeSyncId("tutor-message");
    await writeDocWithQueue({
      userId: user.uid,
      path: ["users", user.uid, "tutorMessages", messageId],
      data: {
      role: message.role,
      content: message.content,
      attachments: message.attachments || [],
      createdAt: new Date().toISOString(),
      },
      merge: true,
    });
  };

  const addFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;

    setUploadError("");

    try {
      const processed = await Promise.all(fileArray.map(fileToAttachment));
      setAttachedFiles((current) => [...current, ...processed]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "File upload failed.");
    }
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles((current) => current.filter((file) => file.id !== id));
  };

  const submitPrompt = async (prompt: string, files: TutorAttachment[], retry = false) => {
    if (!user) return;
    if ((!prompt.trim() && files.length === 0) || aiRequestRef.current) return;
    if (!isLocalAi && !activePro && tutorUsage >= tutorLimit) {
      setUpgradeOpen(true);
      return;
    }

    const cleanPrompt = prompt.trim() || "Analyze the uploaded file and explain the most important points.";
    aiRequestRef.current = true;
    const attachmentMeta = files.map(({ id, name, mimeType, size, previewUrl, text }) => ({
      id,
      name,
      mimeType,
      size,
      previewUrl,
      text: text?.slice(0, 50000),
      contentStored: Boolean(text),
    }));

    setInput("");
    setAttachedFiles([]);
    setUploadError("");
    setAiError("");
    setIsTyping(true);
    setLastRequest({ prompt: cleanPrompt, attachments: files });

    const optimisticUserMessage: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content: cleanPrompt,
      attachments: attachmentMeta,
    };
    if (!retry) setMessages((current) => [...current.filter((message) => message.id !== "intro"), optimisticUserMessage]);

    const nextUsage = tutorUsage + 1;
    if (user && !activePro && !isLocalAi) {
      setTutorUsage(nextUsage);
      saveLocalDailyUsage(user.uid, "aiTutor", nextUsage, dayKey);
    }

    try {
      trackUserEvent(user.uid, "tutor_message_sent", 0, { tutorMessagesSent: 1 }).catch(() => undefined);
      if (!retry) persistMessage({
        role: "user",
        content: cleanPrompt,
        attachments: attachmentMeta,
      }).catch((error) => console.warn(getAppErrorMessage(error)));

      const languageInstruction =
        voiceLanguage === "en-US"
          ? "Answer naturally in English."
          : voiceLanguage === "ru-RU"
            ? "Answer naturally in Russian."
            : "Answer naturally in Uzbek.";
      const studentContext = buildStudentTutorContext(profile, user?.uid);
      const materialInstruction = files.length
        ? `Uploaded materials in this request: ${files.map((file) => file.name).join(", ")}. Use these materials first and reference them by name.`
        : "";
      const tutorContext = [languageInstruction, studentContext, materialInstruction].filter(Boolean).join("\n\n");

      const response = await askTutor(cleanPrompt, tutorContext, voiceLanguage, {
        history: persistedMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        attachments: files,
        retries: 2,
      });

      const botMsg: Message = {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content: response,
      };
      setMessages((current) => [...current, botMsg]);
      persistMessage({ role: "assistant", content: response }).catch((error) => console.warn(getAppErrorMessage(error)));
      speak(response);
    } catch (error) {
      const message = getAppErrorMessage(error);
      setAiError(message);
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `I could not complete that request.\n\n${message}`,
        },
      ]);
    } finally {
      aiRequestRef.current = false;
      setIsTyping(false);
    }
  };

  const handleSend = () => submitPrompt(input, attachedFiles);

  const userAvatar =
    profile?.photoURL ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
      profile?.displayName || profile?.email || "student"
    )}&backgroundColor=ffd5dc,c0aede,d1d4f9&radius=50`;

  return (
    <div
      className={cn(
        "relative flex h-[calc(100vh-140px)] flex-col overflow-hidden rounded-[2rem] border bg-slate-950/70 shadow-3xl backdrop-blur-2xl",
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
      <UpgradeModal
        open={upgradeOpen}
        title="You have used today's free AI tutor messages."
        message="Upgrade to Pro for unlimited exam assistance, faster responses, and advanced academic intelligence."
        onClose={() => setUpgradeOpen(false)}
        onUpgrade={() => {
          setUpgradeOpen(false);
          setActiveTab("pricing");
        }}
      />

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

      <div className="flex shrink-0 flex-col gap-4 border-b border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <Avatar src={ASSISTANT_AVATAR} alt="Noviq Tutor" size="lg" />
          <div>
            <h2 className="font-display text-xl font-bold text-white">Saidamin - Noviq Tutor</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">
              Goal-aware exam coaching
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-300">
            {isLocalAi ? "Local AI · 10 requests/min" : activePro ? "Pro unlimited" : `${remainingTutorMessages} free left`}
          </div>
          <select
            value={voiceLanguage}
            onChange={(event) => setVoiceLanguage(event.target.value as "uz-UZ" | "en-US" | "ru-RU")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none transition hover:border-blue-400 focus:border-blue-400"
          >
            <option value="uz-UZ">Uzbek</option>
            <option value="en-US">English</option>
            <option value="ru-RU">Russian</option>
          </select>
          <button
            type="button"
            onClick={() => setAutoSpeak(!autoSpeak)}
            className={cn(
              "rounded-xl border p-2.5 transition-all",
              autoSpeak ? "border-blue-500/20 bg-blue-600/20 text-blue-300" : "border-white/10 bg-white/5 text-slate-500"
            )}
            aria-label="Toggle voice output"
          >
            {autoSpeak ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button
            type="button"
            onClick={stopSpeaking}
            disabled={!isSpeaking}
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Stop
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="CustomScrollbar flex-1 space-y-6 overflow-y-auto p-4 pb-10 sm:p-6">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex gap-4", message.role === "user" && "flex-row-reverse")}>
            <Avatar
              src={message.role === "assistant" ? ASSISTANT_AVATAR : userAvatar}
              alt={message.role === "assistant" ? "Saidamin" : "You"}
            />
            <div
              className={cn(
                "max-w-[88%] rounded-[1.5rem] p-4 text-sm leading-relaxed sm:p-5 sm:text-base",
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
              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-300">
                Analyzing context...
              </span>
            </div>
          </motion.div>
        )}
      </div>

      <div className="mt-auto border-t border-white/10 bg-white/[0.02] p-4 sm:p-6">
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
                        aria-label={`Remove ${file.name}`}
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
                <div className="flex flex-col gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold">{aiError}</span>
                  <button
                    type="button"
                    onClick={() => submitPrompt(lastRequest.prompt, lastRequest.attachments, true)}
                    disabled={isTyping}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <RefreshCcw size={14} />
                    Retry
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-2 transition-all focus-within:border-blue-500/50 focus-within:bg-white/[0.08]">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask an exam question, or upload a study file for Noviq Tutor..."
            className="CustomScrollbar max-h-36 min-h-14 w-full resize-none bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 sm:text-base"
          />
          <div className="flex flex-col gap-3 border-t border-white/10 px-1 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                <Paperclip size={18} />
                Upload file
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                <ImageIcon size={18} />
                Upload image
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
                Voice
              </button>
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || isTyping}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-xl shadow-blue-500/20 transition hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Send
            </button>
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] font-medium text-slate-500">
          Drag and drop academic files anywhere in this chat. Supported: images, PDF, DOCX, TXT and exam prep files.
        </p>
      </div>
    </div>
  );
};
