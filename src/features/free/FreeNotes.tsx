
import './free-library.css';
import { Book, FileText, Globe, Highlighter, Link as LinkIcon, Loader2, Plus, Search, Trash2, Upload, X, Youtube } from "lucide-react";

import { cn } from "@/src/lib/utils";

import { ref } from '@/src/lib/storageStore';

import ReactMarkdown from "react-markdown";

import { formatBytes } from "@/src/features/notebook/notebookModel";
import { NotebookSourceDialog } from "@/src/features/notebook/NotebookSourceDialog";
import { NotebookAiPanel } from "@/src/features/notebook/NotebookAiPanel";

import { useNotesController } from '@/src/features/notebook/useNotesController';
import { NotebookDraftStatus } from '@/src/features/notebook/NotebookDraftStatus';

export const Notes = () => {
  const { locale, t, notes, sources, messages, activeNoteId, setActiveNoteId, search, setSearch, collectionFilter, setCollectionFilter, chatInput, setChatInput, isSavingNote, isAiLoading, aiError, lastAiPrompt, isSourceLoading, status, mobileView, setMobileView, aiOpenerRef, aiPanelRef, sourceDialogRef, openEditor, closeEditor, closeAiPanel, showSourceModal, setShowSourceModal, sourceUrl, setSourceUrl, sourceError, setSourceError, youtubeUrl, setYoutubeUrl, youtubeTranscript, setYoutubeTranscript, activeSourceTab, setActiveSourceTab, cloudSyncBlocked, sourceInputRef, editorRef, activeNote, draftTitle, setDraftTitle, draftContent, setDraftContent, draftRef, draftConflict, draftStorageError, changeDraft, showAiSourcePreviews, filteredNotes, filteredSources, handleCreateNote, handleSaveNote, handleDeleteNote, handleHighlightSelection, handleUploadSources, handleAddUrlSource, handleAddYoutubeSource, runNotebookAi, formatSelection } = useNotesController();
  return (
    <div className="free-library flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <header className="fl-heading"><div><h1>{locale==='uz'?'O‘quv kutubxonangiz':locale==='ru'?'Ваша учебная библиотека':'Your study library'}</h1><p>{locale==='uz'?'Qaydlar va manbalaringizni bir joyda saqlang.':locale==='ru'?'Храните заметки и источники в одном месте.':'Keep your notes and sources in one clear place.'}</p></div><div><button type="button" className="fl-primary" onClick={handleCreateNote}><Plus size={17}/>{t('notebook.createNote')}</button><button type="button" disabled={isSourceLoading} onClick={()=>sourceInputRef.current?.click()}><Upload size={17}/>{t('notebook.upload')}</button><button type="button" onClick={()=>{setSourceError("");setShowSourceModal(true)}}><LinkIcon size={17}/>{t('notebook.link')}</button></div></header>
      <div className="fl-columns grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[230px_minmax(0,1fr)_290px]">
      <input
        ref={sourceInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,image/*"
        onChange={(event) => {
          handleUploadSources(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <aside className={cn("glass flex h-full min-w-0 flex-col overflow-hidden border-white/10 bg-white/[0.02]", mobileView !== "notes" && mobileView !== "sources" && "hidden xl:flex")}>
        <header className="shrink-0 space-y-4 border-b border-white/10 p-4">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white">{t("notebook.title")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("notebook.subtitle")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => sourceInputRef.current?.click()}
              disabled={isSourceLoading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {isSourceLoading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {t("notebook.upload")}
            </button>
            <button
              type="button"
              onClick={() => { setSourceError(""); setShowSourceModal(true); }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-300 hover:bg-white/10"
            >
              <LinkIcon size={15} />
              {t("notebook.link")}
            </button>
          </div>
          <button
            type="button"
            onClick={handleCreateNote}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-bold text-white shadow-xl shadow-blue-500/20 transition hover:bg-blue-500"
          >
            <Plus size={18} />
            {t("notebook.createNote")}
          </button>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("notebook.search")}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </div>
        </header>

        <div className="CustomScrollbar flex-1 space-y-5 overflow-y-auto p-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{t("notebook.sources")}</h3>
              <span className="text-[10px] font-bold text-slate-500">{filteredSources.length}</span>
            </div>
            {filteredSources.map((source) => (
              <article key={source.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
                    {source.type === "url" ? <Globe size={16} /> : source.type === "youtube" ? <Youtube size={16} /> : <FileText size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-bold text-white">{source.title}</h4>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                      {source.type} {source.size ? `/ ${formatBytes(source.size)}` : ""}
                    </p>
                  </div>
                </div>
                {showAiSourcePreviews && source.summary && (
                  <div className="mt-3 line-clamp-3 text-xs leading-5 text-slate-400">
                    <ReactMarkdown>{source.summary}</ReactMarkdown>
                  </div>
                )}
              </article>
            ))}
            {filteredSources.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/15 p-5 text-center">
                <FileText className="mx-auto text-slate-600" size={28} />
                <p className="mt-3 text-sm font-bold text-white">{t("notebook.noSources")}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{t("notebook.noSourcesHint")}</p>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{t("notebook.notes")}</h3>
              <span className="text-[10px] font-bold text-slate-500">{filteredNotes.length}</span>
            </div>
          {filteredNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => {
                setActiveNoteId(note.id);
                openEditor();
              }}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition",
                activeNoteId === note.id
                  ? "border-blue-500/25 bg-blue-600/10"
                  : "border-transparent hover:border-white/10 hover:bg-white/[0.05]"
              )}
            >
              <h4 className="truncate text-sm font-bold text-white">{note.title}</h4>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{note.content || t("notebook.emptyNote")}</p>
              <div className="mt-3 flex gap-1">
                {note.tags.slice(0, 2).map((tag) => (
                  <span key={tag} className="rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-bold uppercase text-blue-300">
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {filteredNotes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 p-5 text-center">
              <FileText className="mx-auto text-slate-600" size={28} />
              <p className="mt-3 text-sm font-bold text-white">{search.trim() ? t("notebook.noMatch") : t("notebook.noNotes")}</p>
            </div>
          )}
          </section>
        </div>
      </aside>

      <main className={cn("glass flex min-w-0 flex-col overflow-hidden border-white/10 bg-white/[0.02]", mobileView !== "editor" && "hidden xl:flex")}>
        <NotebookDraftStatus locale={locale} conflict={draftConflict} storageError={draftStorageError}/>
        {activeNote ? (
          <>
            <header className="border-b border-white/10 p-4 sm:p-6">
              <div className="flex min-w-0 flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  aria-label={t("notebook.noteTitle")}
                  value={draftTitle}
                  onChange={(event) => changeDraft(event.target.value,draftContent)}
                  className="w-full truncate bg-transparent font-display text-2xl font-bold text-white outline-none"
                />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t("notebook.sourceMeta", { count: sources.length })}
                </p>
                {(cloudSyncBlocked || sources.some(source => source.syncStatus === "failed")) && (
                  <p className="text-xs font-semibold text-amber-300">
                    {t("notebook.cloudWaiting")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" aria-label={t("notebook.closeEditor")} onClick={closeEditor} className="min-h-11 min-w-11 rounded-xl bg-white/5 p-3 text-slate-400 xl:hidden">
                  <X size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleHighlightSelection}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/10"
                >
                  <Highlighter size={16} />
                  {t("notebook.highlight")}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileView("sources")}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/10 xl:hidden"
                >
                  {t("notebook.sources")}
                </button>
                <button
                  type="button"
                  onClick={() => { aiOpenerRef.current = document.activeElement as HTMLElement; setMobileView("chat"); }}
                  className="rounded-2xl bg-blue-600 px-4 py-3 text-xs font-bold text-white xl:hidden"
                >
                  {t("notebook.ai")}
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={isSavingNote}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {isSavingNote ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {t("notebook.save")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(activeNote)}
                  aria-label={t("notebook.delete")}
                  className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-red-200 hover:bg-red-400/15"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              </div>
            </header>

            <div className="fl-format" role="group" aria-label="Markdown formatting"><button type="button" aria-label="Bold" onClick={()=>formatSelection('**','**')}><strong>B</strong></button><button type="button" aria-label="Italic" onClick={()=>formatSelection('*','*')}><em>I</em></button><button type="button" onClick={()=>formatSelection('\n- ')}>• List</button><small>Markdown</small></div>
            <textarea
              ref={editorRef}
              aria-label={t("notebook.noteContent")}
              value={draftContent}
              onChange={(event) => changeDraft(draftTitle,event.target.value)}
              placeholder={t("notebook.contentPlaceholder")}
              className="CustomScrollbar flex-1 resize-none bg-transparent p-6 text-base leading-8 text-slate-200 outline-none placeholder:text-slate-600 sm:p-10"
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <Book size={40} className="text-slate-600" />
            <h3 className="mt-4 text-2xl font-bold text-white">{t("notebook.selectNote")}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{t("notebook.savedHint")}</p>
          </div>
        )}
      </main>

      <NotebookAiPanel
        panelRef={aiPanelRef}
        mobileOpen={mobileView === "chat"}
        sourceCount={sources.length}
        messages={messages}
        input={chatInput}
        loading={isAiLoading}
        error={aiError}
        onInputChange={setChatInput}
        onAsk={(prompt) => void runNotebookAi(prompt)}
        onRetry={() => void runNotebookAi(lastAiPrompt, false)}
        onClose={closeAiPanel}
      />
      </div>

      {status && (
        <div className="fixed bottom-6 left-1/2 z-[140] -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-white shadow-2xl">
          {status}
        </div>
      )}

      <NotebookSourceDialog
        error={sourceError}
        open={showSourceModal}
        dialogRef={sourceDialogRef}
        activeTab={activeSourceTab}
        sourceUrl={sourceUrl}
        youtubeUrl={youtubeUrl}
        youtubeTranscript={youtubeTranscript}
        loading={isSourceLoading}
        onClose={() => setShowSourceModal(false)}
        onTabChange={setActiveSourceTab}
        onSourceUrlChange={setSourceUrl}
        onYoutubeUrlChange={setYoutubeUrl}
        onYoutubeTranscriptChange={setYoutubeTranscript}
        onAddWebsite={handleAddUrlSource}
        onAnalyzeTranscript={handleAddYoutubeSource}
      />

    </div>
  );
};
