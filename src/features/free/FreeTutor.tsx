
import './free-tutor.css';

import { TutorProControls } from '@/src/features/pro/TutorProControls';

import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, MessageSquare, SquarePen, FileText, Image as ImageIcon, Loader2, Mic, MicOff, Paperclip, RefreshCcw, Send, Volume2, VolumeX, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/src/lib/utils";

import { UpgradeModal } from "@/src/components/UpgradeModal";

import { TutorChatHistory, TutorHistoryDrawer } from "@/src/components/TutorChatHistory";
import { TutorSaveStatus } from "@/src/components/TutorSaveStatus";

import { formatBytes } from "@/src/features/tutor/tutorAttachments";

import { Avatar, ASSISTANT_AVATAR } from "@/src/features/tutor/TutorPresentation";

import { useTutorController } from '@/src/features/tutor/useTutorController';

export const Tutor = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const { tutorModes, locale, t, chat, historyOpen, setHistoryOpen, closeHistory, messages, input, setInput, isTyping, isSpeaking, autoSpeak, setAutoSpeak, attachedFiles, uploadError, historyError, aiError, lastRequest, isDragging, setIsDragging, upgradeOpen, setUpgradeOpen, scrollRef, fileInputRef, activePro, localProvider, remainingTutorMessages, stopSpeaking, voiceMessage, handleToggleListening, addFiles, removeAttachment, submitPrompt, handleSend, userAvatar, newConversation, historyProps } = useTutorController();
  return (
    <div className="free-tutor-workspace tutor-workspace flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 shadow-xl sm:rounded-[1.5rem]">
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
        accept="image/*,audio/*,video/*,.pdf,.docx,.txt,.md,.csv,.json"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="ftu-chat-header flex shrink-0 flex-col gap-2 border-b border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-4">
          <Avatar src={ASSISTANT_AVATAR} alt="Noviq Tutor" size="lg" />
          <div>
            <h2 className="font-display text-base font-bold text-white sm:text-xl">Saidamin</h2>
            <p className="hidden text-[10px] font-black uppercase tracking-widest text-cyan-300 sm:block">
              {t("tutor.coaching")}
            </p>
          </div>
        </div>
        <div className="flex max-w-full items-center gap-2 overflow-x-auto">
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-300">
            {localProvider ? "Saidamin AI" : activePro ? "Pro AI" : t("tutor.freeRemaining").replace("{count}", String(remainingTutorMessages))}
          </div>
          <span className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300" role="status">
            {locale === 'uz' ? 'Javob tili: avtomatik' : locale === 'ru' ? 'Язык ответа: автоматически' : 'Reply language: automatic'}
          </span>
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
          {isSpeaking && <button
            type="button"
            onClick={stopSpeaking}
            disabled={!isSpeaking}
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
              {t("tutor.stop")}
          </button>}
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

      <div className="ftu-compose-wrap mt-auto shrink-0 border-t border-white/10 bg-white/[0.02] p-3 sm:p-4">
        {!isTyping&&!input.trim()&&<div className="ftu-prompts">{(locale==='uz'?['Sodda qilib tushuntir','Mashq savolini ber','Javobimni tekshir']:locale==='ru'?['Объясни проще','Дай вопрос для практики','Проверь мой ответ']:['Explain simply','Give me a practice question','Check my answer']).map(prompt=><button type="button" key={prompt} onClick={()=>setInput(prompt)}>{prompt}</button>)}</div>}

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
                disabled={isTyping || voiceMessage.busy}
                aria-pressed={voiceMessage.recording}
                aria-label={voiceMessage.recording ? "Stop recording" : t("tutor.voice")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all",
                  voiceMessage.recording ? "bg-red-500 text-white" : "bg-white/5 text-slate-400 hover:text-white"
                )}
              >
                {voiceMessage.recording ? <MicOff size={18} /> : <Mic size={18} />}
                 <span className="sr-only sm:not-sr-only">{voiceMessage.recording ? "Stop" : t("tutor.voice")}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || isTyping || voiceMessage.recording || voiceMessage.busy}
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
