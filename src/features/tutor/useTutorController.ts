import { useVoiceMessage } from "@/src/features/tutor/useVoiceMessage";
import { getProfileAvatar } from '@/src/lib/profileAvatar';
import { createTutorRecognition, getTutorSpeechSynthesis, stopTutorRecognition, cancelTutorSpeech } from "@/src/features/tutor/browserSpeech";
import { useTutorModes } from '@/src/features/pro/TutorProControls';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { askTutor } from "@/src/lib/gemini";
import { trackUserEvent } from "@/src/lib/analytics";

import { classifyAiFailure, getAiFailureMessage, type AiFailureKind } from "@/src/lib/aiFailure";

import { FREE_LIMITS, getLocalDailyUsage, isPro, saveLocalDailyUsage } from "@/src/lib/subscription";
import { getLocalDayKey } from "@/src/lib/progress";
import { buildStudentTutorContext } from "@/src/lib/tutorContext";
import { isLocalAi, useDevelopmentAi } from "@/src/lib/auditMode";

import { useTutorHistory } from "@/src/lib/useTutorHistory";
import { fileToTutorAttachment, type TutorAttachment } from "@/src/features/tutor/tutorAttachments";
import { getTutorIntro, type TutorLanguage } from "@/src/features/tutor/tutorCopy";
import { useLocale } from "@/src/contexts/LocaleContext";
import { buildTutorRequestContext } from "@/src/features/tutor/tutorRequest";

import { INTRO_MESSAGE, type Message } from "@/src/features/tutor/TutorPresentation";

export function useTutorController(cinematic = false) {
  const { profile, user } = useAuth();
  const tutorModes=useTutorModes(user?.uid),{proTutorMode,explanationDepth,shareProContext}=tutorModes;
  const { locale, t } = useLocale();
  const chat = useTutorHistory(user?.uid);
  const [historyOpen, setHistoryOpen] = useState(false);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  const voiceLanguage: TutorLanguage =
    locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const intro = useMemo(
    () => ({ ...INTRO_MESSAGE, content: cinematic ? (locale === 'uz' ? 'Avval nimani o‘rganamiz?' : locale === 'ru' ? 'С чем помочь в первую очередь?' : 'What would you like help with first?') : getTutorIntro(voiceLanguage) }),
    [cinematic, locale, voiceLanguage],
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

  const voiceMessage = useVoiceMessage(
    file => setAttachedFiles(current => [...current, file]),
    message => setUploadError(message),
  );
  const handleToggleListening = () => { setUploadError(""); void voiceMessage.toggle(); };

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

  const userAvatar = getProfileAvatar(profile);

  const selectConversation = (id: string) => { chat.select(id); setAiError(""); setLastRequest(null); };
  const newConversation = () => { chat.newChat(); setAiError(""); setLastRequest(null); };
  const historyProps = { chat, disabled: isTyping, onSelect: selectConversation, onNew: newConversation };

  return { tutorModes, locale, t, chat, historyOpen, setHistoryOpen, closeHistory, messages, input, setInput, isTyping, isSpeaking, autoSpeak, setAutoSpeak, attachedFiles, uploadError, historyError, aiError, lastRequest, isDragging, setIsDragging, upgradeOpen, setUpgradeOpen, scrollRef, fileInputRef, activePro, localProvider, remainingTutorMessages, stopSpeaking, voiceMessage, handleToggleListening, addFiles, removeAttachment, submitPrompt, handleSend, userAvatar, newConversation, historyProps };
}
