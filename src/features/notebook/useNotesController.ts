import { useEffect, useMemo, useRef, useState } from "react";
import "@/src/features/notebook/notebook-liquid.css";

import { type AiAttachment, askNotebook, readNotebookLink } from "@/src/lib/gemini";

import { useAuth } from "@/src/contexts/AuthContext";
import { trackUserEvent } from "@/src/lib/analytics";
import { buildXpAwardPatch, NOVIQ_XP, persistXpAwards, XP_KEYS } from "@/src/lib/progress";
import { collection, onSnapshot, orderBy, query } from '@/src/lib/dataStore';
import { getDownloadURL, ref, uploadBytes } from '@/src/lib/storageStore';
import { db, storage } from "@/src/lib/firebase";

import { getAppErrorMessage } from "@/src/lib/errors";
import { classifyAiFailure, getAiFailureMessage, type AiFailureKind } from "@/src/lib/aiFailure";
import { loadLocalData, makeSyncId, saveLocalData } from "@/src/lib/localStore";
import { useNotebookDraft } from '@/src/features/pro/useNotebookDraft';
import { notebookDraftKey } from '@/src/features/pro/notebookDraft';

import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { isReadOnlyAudit, isLocalAi } from "@/src/lib/auditMode";
import { buildStudentTutorContext } from "@/src/lib/tutorContext";
import { writeDocWithQueue } from "@/src/lib/offlineSync";
import { isNotificationPreferenceEnabled } from "@/src/lib/preferences";
import { buildNotebookContext, debugNotebookMetricsWrite, formatBytes, isTextbookUpload, isTextLike, MAX_SOURCE_FILE_BYTES, mergeLocalRemote, readAsDataUrl, type NotebookMessage, type NotebookNote, type NotebookSource } from "@/src/features/notebook/notebookModel";
import { type NotebookSourceTab } from "@/src/features/notebook/NotebookSourceDialog";

import { useNotebookAiScope } from "@/src/features/notebook/useNotebookAiScope";
import { summarizeUploadedSource } from "@/src/features/notebook/notebookSourceAnalysis";
import { createSourceBatch, highlightNotebookSelection, withSingleSourceRequest } from "@/src/features/notebook/sourceBatch";
import { useLocale } from "@/src/contexts/LocaleContext";
import type { TutorLanguage } from "@/src/features/tutor/tutorCopy";

export function useNotesController() {
  const { user, profile, updateLocalProfile } = useAuth();
  const { locale, t } = useLocale();
  const notebookLanguage: TutorLanguage =
    locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const [notes, setNotes] = useState<NotebookNote[]>([]);
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [messages, setMessages] = useState<NotebookMessage[]>([]);
  const [activeNoteId, setActiveNoteId] = useState("");
  const notebookOwnerRef=useRef(user?.uid);notebookOwnerRef.current=user?.uid;
  const [search, setSearch] = useState("");
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'notes' | 'documents' | 'links'>('all');
  const [chatInput, setChatInput] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const { aiRequestRef, aiGenerationRef, aiOwnerRef } = useNotebookAiScope(user?.uid, () => {
    setIsAiLoading(false);
    setAiError("");
    setLastAiPrompt("");
  });
  const [aiFailure, setAiError] = useState<"" | AiFailureKind>("");
  const aiError = aiFailure ? getAiFailureMessage(aiFailure, locale) : "";
  const [lastAiPrompt, setLastAiPrompt] = useState("");
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [mobileView, setMobileView] = useState<"notes" | "editor" | "sources" | "chat">("notes");
  const editorOpenerRef = useRef<HTMLElement | null>(null);
  const aiOpenerRef = useRef<HTMLElement | null>(null);
  const aiPanelRef = useRef<HTMLElement>(null);
  const sourceDialogRef = useRef<HTMLDivElement>(null);
  const restorePanelFocusRef = useRef<HTMLElement | null>(null);
  const saveNoteRequestRef = useRef(false);
  const sourceRequestRef = useRef(false);
  const openEditor = () => {
    editorOpenerRef.current = document.activeElement as HTMLElement;
    setMobileView("editor");
  };
  const closeEditor = () => {
    setMobileView("notes");
    requestAnimationFrame(() => editorOpenerRef.current?.focus());
  };
  const closeAiPanel = () => {
    restorePanelFocusRef.current = aiOpenerRef.current;
    setMobileView("editor");
  };
  const [showSourceModal, setShowSourceModal] = useState(false);
  useDialogFocus(showSourceModal, sourceDialogRef, () => setShowSourceModal(false));
  useBodyScrollLock(showSourceModal);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTranscript, setYoutubeTranscript] = useState("");
  const [activeSourceTab, setActiveSourceTab] =
    useState<NotebookSourceTab>("url");
  const [localReady, setLocalReady] = useState(false);
  const [cloudSyncBlocked, setCloudSyncBlocked] = useState(false);
  const cloudLoadedCollectionsRef = useRef<Set<string>>(new Set());

  const sourceInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(max-width: 1279px)").matches) return;
    const frame = requestAnimationFrame(() => {
      if (restorePanelFocusRef.current) {
        restorePanelFocusRef.current.focus();
        restorePanelFocusRef.current = null;
      } else if (mobileView === "editor") editorRef.current?.focus();
      if (mobileView === "chat") aiPanelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || showSourceModal) return;
      if (mobileView === "editor") closeEditor();
      if (mobileView === "chat") closeAiPanel();
    };
    document.addEventListener("keydown", handleEscape);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", handleEscape); };
  }, [mobileView, showSourceModal]);

  const activeNote = useMemo(() => notes.find((note) => note.id === activeNoteId) || null, [activeNoteId, notes]);
  const {draftTitle,setDraftTitle,draftContent,setDraftContent,draftRef,draftConflict,setDraftConflict,draftStorageError,setDraftStorageError,changeDraft}=useNotebookDraft(user?.uid,activeNote,isSavingNote);
  const showAiSourcePreviews = isNotificationPreferenceEnabled(profile, "aiSourcePreviews");
  const filteredNotes = notes.filter(() => collectionFilter === 'all' || collectionFilter === 'notes').filter(
    (note) =>
      note.title.toLowerCase().includes(search.toLowerCase()) ||
      note.content.toLowerCase().includes(search.toLowerCase()) ||
      note.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredSources = sources.filter(source => collectionFilter === 'all' || (collectionFilter === 'documents' && source.type === 'file') || (collectionFilter === 'links' && source.type !== 'file')).filter(
    (source) =>
      source.title.toLowerCase().includes(search.toLowerCase()) ||
      (showAiSourcePreviews && (source.summary || "").toLowerCase().includes(search.toLowerCase()))
  );

  const notesKey = user ? `noviq:${user.uid}:notebookNotes` : "";
  const sourcesKey = user ? `noviq:${user.uid}:notebookSources` : "";
  const messagesKey = user ? `noviq:${user.uid}:notebookMessages` : "";
  const notebookStudentContext = useMemo(
    () => buildStudentTutorContext(profile, user?.uid),
    [profile, user?.uid]
  );

  const markCloudCollectionReady = (collectionName: string) => {
    cloudLoadedCollectionsRef.current.add(collectionName);
    if (cloudLoadedCollectionsRef.current.size >= 3) {
      setLocalReady(true);
    }
  };

  useEffect(() => {
    if (!user) return;
    cloudLoadedCollectionsRef.current = new Set();
    setLocalReady(false);
    setNotes(loadLocalData<NotebookNote[]>(notesKey, []));
    setSources(loadLocalData<NotebookSource[]>(sourcesKey, []));
    setMessages(loadLocalData<NotebookMessage[]>(messagesKey, []));
  }, [messagesKey, notesKey, sourcesKey, user]);

  useEffect(() => {
    if (!user || !localReady) return;
    saveLocalData(notesKey, notes);
  }, [localReady, notes, notesKey, user]);

  useEffect(() => {
    if (!user || !localReady) return;
    saveLocalData(sourcesKey, sources);
  }, [localReady, sources, sourcesKey, user]);

  useEffect(() => {
    if (!user || !localReady) return;
    if (isLocalAi) return;
    saveLocalData(messagesKey, messages);
  }, [localReady, messages, messagesKey, user]);

  useEffect(() => {
    if (!user) return undefined;

    const notesQuery = query(collection(db, "users", user.uid, "notebookNotes"), orderBy("updatedAt", "desc"));
    return onSnapshot(
      notesQuery,
      (snapshot) => {
        const remoteNotes = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
          tags: Array.isArray(document.data().tags) ? document.data().tags.filter((tag:unknown)=>typeof tag==='string') : [],
        })) as NotebookNote[];
        setCloudSyncBlocked(false);
        setNotes((current) => mergeLocalRemote(current, remoteNotes));
        markCloudCollectionReady("notes");

        if (!activeNoteId && remoteNotes[0]) {
          setActiveNoteId(remoteNotes[0].id);
        }
      },
      (error) => {
        console.warn(getAppErrorMessage(error));
        setCloudSyncBlocked(true);
        const localNotes = loadLocalData<NotebookNote[]>(notesKey, []);
        setNotes(localNotes);
        setActiveNoteId((current) => current || localNotes[0]?.id || "");
        markCloudCollectionReady("notes");
      }
    );
  }, [activeNoteId, notesKey, user]);

  useEffect(() => {
    if (!user) return undefined;

    const sourcesQuery = query(collection(db, "users", user.uid, "notebookSources"), orderBy("createdAt", "desc"));
    return onSnapshot(
      sourcesQuery,
      (snapshot) => {
        const remoteSources = snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })) as NotebookSource[];
        setCloudSyncBlocked(false);
        setSources((current) => mergeLocalRemote(current, remoteSources));
        markCloudCollectionReady("sources");
      },
      (error) => {
        console.warn(getAppErrorMessage(error));
        setCloudSyncBlocked(true);
        setSources(loadLocalData<NotebookSource[]>(sourcesKey, []));
        markCloudCollectionReady("sources");
      }
    );
  }, [sourcesKey, user]);

  useEffect(() => {
    if (!user) return undefined;

    const messagesQuery = query(collection(db, "users", user.uid, "notebookMessages"), orderBy("createdAt", "asc"));
    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        const remoteMessages = snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })) as NotebookMessage[];
        setCloudSyncBlocked(false);
        setMessages((current) => mergeLocalRemote(current, remoteMessages));
        markCloudCollectionReady("messages");
      },
      (error) => {
        console.warn(getAppErrorMessage(error));
        setCloudSyncBlocked(true);
        setMessages(loadLocalData<NotebookMessage[]>(messagesKey, []));
        markCloudCollectionReady("messages");
      }
    );
  }, [messagesKey, user]);

  const handleCreateNote = async () => {
    if (!user) return;

    const localNote: NotebookNote = {
      id: makeSyncId("note"),
      title: t("notebook.untitled"),
      content: "",
      tags: ["General"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: "pending",
    };

    setNotes((current) => [localNote, ...current]);
    setActiveNoteId(localNote.id);
    setDraftTitle(localNote.title);
    setDraftContent(localNote.content);
    openEditor();
    setStatus("");

    try {
      debugNotebookMetricsWrite(["users", user.uid, "notebookNotes", localNote.id]);
      const syncStatus = await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "notebookNotes", localNote.id],
        data: {
        title: t("notebook.untitled"),
        content: "",
        tags: ["General"],
        createdAt: localNote.createdAt,
        updatedAt: localNote.updatedAt,
        },
        merge: true,
      });
      setNotes((current) => current.map((note) => (note.id === localNote.id ? { ...note, syncStatus } : note)));
      setCloudSyncBlocked(false);
      trackUserEvent(user.uid, "notebook_created", 0, { notesCreated: 1 }).catch(() => undefined);
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
    }
  };

  const handleSaveNote = async () => {
    if (!user || !activeNote || isSavingNote || saveNoteRequestRef.current) return;
    if (isReadOnlyAudit) { setStatus(t("notebook.auditSaveDisabled")); return; }
    saveNoteRequestRef.current = true;
    setIsSavingNote(true);
    setStatus("");

    const nextNote = {
      ...activeNote,
      title: draftTitle.trim() || t("notebook.untitled"),
      content: draftContent,
      updatedAt: new Date().toISOString(),
    };
    if(draftRef.current?.noteId===activeNote.id){
      draftRef.current={...draftRef.current,baseUpdatedAt:nextNote.updatedAt};
      if(!draftStorageError){try{saveLocalData(notebookDraftKey(user.uid,activeNote.id),draftRef.current);}catch{setDraftStorageError(true);}}
    }
    setNotes((current) => current.map((note) => (note.id === activeNote.id ? nextNote : note)));

    try {
      debugNotebookMetricsWrite(["users", user.uid, "notebookNotes", activeNote.id]);
      const syncStatus = await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "notebookNotes", activeNote.id],
        data: {
          title: nextNote.title,
          content: nextNote.content,
          tags: nextNote.tags,
          createdAt: nextNote.createdAt || new Date().toISOString(),
          updatedAt: nextNote.updatedAt,
        },
        merge: true,
      });
      setNotes((current) =>
        current.map((note) => (note.id === activeNote.id ? { ...note, syncStatus } : note))
      );
      setStatus(t("notebook.savedLocal"));
      if(notebookOwnerRef.current===user.uid && draftRef.current?.noteId===activeNote.id && draftRef.current.title===draftTitle && draftRef.current.content===draftContent){
        const clean={...draftRef.current,dirty:false,baseUpdatedAt:nextNote.updatedAt};
        draftRef.current=clean;
        if(!draftStorageError)saveLocalData(notebookDraftKey(user.uid,activeNote.id),clean);
        setDraftConflict(false);
      }
      setCloudSyncBlocked(false);
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
      setStatus(t("notebook.savedCloudWaiting"));
    } finally {
      saveNoteRequestRef.current = false;
      setIsSavingNote(false);
    }
  };

  useEffect(()=>{
    if(!user || !activeNote || isReadOnlyAudit || isSavingNote || cloudSyncBlocked || draftConflict || draftStorageError || (typeof navigator !== 'undefined' && !navigator.onLine) || !draftRef.current?.dirty || draftRef.current.noteId!==activeNote.id)return;
    const timer=window.setTimeout(()=>void handleSaveNote(),900);
    return()=>window.clearTimeout(timer);
  },[draftTitle,draftContent,activeNote?.id,user?.uid,isSavingNote,cloudSyncBlocked,draftConflict,draftStorageError]);

  const handleDeleteNote = async (note: NotebookNote) => {
    if (!user) return;
    const confirmed = window.confirm(t("notebook.deleteConfirm", { title: note.title }));
    if (!confirmed) return;

    setNotes((current) => current.filter((item) => item.id !== note.id));
    setActiveNoteId(notes.find((item) => item.id !== note.id)?.id || "");

    try {
      await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "notebookNotes", note.id],
        kind: "delete",
      });
      setCloudSyncBlocked(false);
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
    }
  };

  const handleHighlightSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const next = highlightNotebookSelection(draftContent, editor.selectionStart, editor.selectionEnd);
    if (next !== null) changeDraft(draftTitle, next);
  };

  const handleUploadSources = withSingleSourceRequest(sourceRequestRef, async (files: FileList | null) => {
    if (isReadOnlyAudit) { setStatus(t("notebook.auditUploadDisabled")); return; }
    if (!user || !files?.length) return;
    setIsSourceLoading(true);
    setStatus("");
    const uploadedFiles = Array.from(files);
    const batch = createSourceBatch(uploadedFiles.length);
    const shouldAwardFirstTextbook =
      uploadedFiles.some(isTextbookUpload) && !profile?.xpAwarded?.[XP_KEYS.firstTextbookUpload];
    let firstTextbookAwardedThisBatch = false;

    for (const file of uploadedFiles) {
      try {
        if (file.size > MAX_SOURCE_FILE_BYTES) {
          setStatus(t("notebook.fileTooLarge", { name: file.name, size: formatBytes(MAX_SOURCE_FILE_BYTES) }));
          continue;
        }

        const dataUrl = await readAsDataUrl(file);
        const [, data = ""] = dataUrl.split(",");
        const extractedText = isTextLike(file) ? await file.text() : "";
        const attachment: AiAttachment = {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          data,
          text: extractedText || undefined,
        };
        let summary = "";
        try {
          summary = await summarizeUploadedSource(file, attachment, extractedText, notebookStudentContext, notebookLanguage);
        } catch (err) {
          console.warn("Source digest failed, proceeding without automated digest", err);
          summary = t("notebook.digestUnavailable");
        }

        const localSource: NotebookSource = {
          id: makeSyncId("source"),
          type: "file",
          title: file.name,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          extractedText: extractedText.slice(0, 50000),
          summary,
          createdAt: new Date().toISOString(),
          syncStatus: "pending",
        };
        setSources((current) => [localSource, ...current]);
        batch.markAdded();

        if (shouldAwardFirstTextbook && !firstTextbookAwardedThisBatch && isTextbookUpload(file)) {
          const award = { key: XP_KEYS.firstTextbookUpload, xp: NOVIQ_XP.bonus.firstTextbookUpload };
          firstTextbookAwardedThisBatch = true;
          updateLocalProfile(buildXpAwardPatch(profile, [award]));
          persistXpAwards(user.uid, [award], profile).catch((error) => {
            console.warn("First textbook XP sync failed", error);
          });
        }

        let downloadURL = "";
        try {
          const storageRef = ref(storage, `users/${user.uid}/notebookSources/${Date.now()}-${file.name}`);
          await uploadBytes(storageRef, file);
          downloadURL = await getDownloadURL(storageRef);
        } catch (error) {
          console.warn(getAppErrorMessage(error));
          setCloudSyncBlocked(true);
        }

        try {
          debugNotebookMetricsWrite(["users", user.uid, "notebookSources", localSource.id]);
          const syncStatus = await writeDocWithQueue({
            userId: user.uid,
            path: ["users", user.uid, "notebookSources", localSource.id],
            data: {
          type: "file",
          title: file.name,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          downloadURL,
          extractedText: extractedText.slice(0, 50000),
          summary,
          createdAt: localSource.createdAt,
            },
            merge: true,
          });
          setSources((current) =>
            current.map((source) =>
              source.id === localSource.id ? { ...source, downloadURL, syncStatus: downloadURL ? syncStatus : "failed" } : source
            )
          );
          setCloudSyncBlocked(syncStatus !== "synced" || !downloadURL);
          if (downloadURL) trackUserEvent(user.uid, "notebook_source_uploaded", 0, { sourcesAdded: 1, sourceType: "file" }).catch(() => undefined);
        } catch (error) {
          console.warn(getAppErrorMessage(error));
          setCloudSyncBlocked(true);
        }
      } catch (error) {
        setStatus(t("notebook.sourceFailed"));
      }
    }
    setStatus(t(batch.messageKey(), batch.values()));
    setIsSourceLoading(false);
  });

  const handleAddUrlSource = withSingleSourceRequest(sourceRequestRef, async () => {
    if (!user || !sourceUrl.trim()) return;
    setIsSourceLoading(true);
    setStatus("");
    setSourceError("");

    try {
      const normalizedUrl = sourceUrl.trim();
      const extractedText = await readNotebookLink(normalizedUrl);
      const summary = await askNotebook(
        "Create a source-grounded mastery digest from this imported website. Include exam-relevant concepts, traps, recall, application practice, exam-style questions, and next revision action.",
        [
          notebookStudentContext,
          `Imported website: ${normalizedUrl}. Use this source before general knowledge.`,
          extractedText.slice(0, 24000),
        ]
          .filter(Boolean)
          .join("\n\n"),
        notebookLanguage,
        { retries: 2 }
      ).catch(() => t("notebook.digestUnavailable"));
      const localSource: NotebookSource = {
        id: makeSyncId("source"),
        type: "url",
        title: new URL(normalizedUrl).hostname,
        url: normalizedUrl,
        extractedText: extractedText.slice(0, 50000),
        summary,
        createdAt: new Date().toISOString(),
        syncStatus: "pending",
      };
      setSources((current) => [localSource, ...current]);

      try {
        debugNotebookMetricsWrite(["users", user.uid, "notebookSources", localSource.id]);
        const syncStatus = await writeDocWithQueue({
          userId: user.uid,
          path: ["users", user.uid, "notebookSources", localSource.id],
          data: {
        type: "url",
        title: localSource.title,
        url: normalizedUrl,
        extractedText: extractedText.slice(0, 50000),
        summary,
        createdAt: localSource.createdAt,
          },
          merge: true,
        });
        setSources((current) => current.map((source) => (source.id === localSource.id ? { ...source, syncStatus } : source)));
        setCloudSyncBlocked(false);
        trackUserEvent(user.uid, "notebook_source_uploaded", 0, { sourcesAdded: 1, sourceType: "url" }).catch(() => undefined);
      } catch (error) {
        console.warn(getAppErrorMessage(error));
        setCloudSyncBlocked(true);
      }
      setSourceUrl("");
      setShowSourceModal(false);
    } catch (error) {
      setSourceError(t("notebook.websiteFailed"));
      setStatus(t("notebook.websiteFailed"));
    } finally {
      setIsSourceLoading(false);
    }
  });

  const handleAddYoutubeSource = withSingleSourceRequest(sourceRequestRef, async () => {
    if (!user || (!youtubeTranscript.trim() && !youtubeUrl.trim())) {
      setStatus(t("notebook.transcriptRequired"));
      return;
    }

    setIsSourceLoading(true);
    setStatus("");
    setSourceError("");

    try {
      const transcript = youtubeTranscript.trim() || await readNotebookLink(youtubeUrl.trim(), true);
      const summary = await askNotebook(
        "Create a source-grounded mastery digest from this YouTube transcript. Include key concepts, exam relevance, traps, recall, application practice, exam-style questions, and next revision action.",
        [
          notebookStudentContext,
          youtubeUrl.trim() ? `YouTube source: ${youtubeUrl.trim()}. Use this transcript before general knowledge.` : "YouTube transcript source. Use this transcript before general knowledge.",
          transcript.slice(0, 24000),
        ]
          .filter(Boolean)
          .join("\n\n"),
        notebookLanguage,
        { retries: 2 }
      ).catch(() => t("notebook.digestUnavailable"));
      const localSource: NotebookSource = {
        id: makeSyncId("source"),
        type: "youtube",
        title: youtubeUrl.trim() ? `YouTube: ${youtubeUrl.trim()}` : t("notebook.youtubeTranscript"),
        url: youtubeUrl.trim(),
        extractedText: transcript.slice(0, 50000),
        summary,
        createdAt: new Date().toISOString(),
        syncStatus: "pending",
      };
      setSources((current) => [localSource, ...current]);

      try {
        debugNotebookMetricsWrite(["users", user.uid, "notebookSources", localSource.id]);
        const syncStatus = await writeDocWithQueue({
          userId: user.uid,
          path: ["users", user.uid, "notebookSources", localSource.id],
          data: {
        type: "youtube",
        title: localSource.title,
        url: youtubeUrl.trim(),
        extractedText: transcript.slice(0, 50000),
        summary,
        createdAt: localSource.createdAt,
          },
          merge: true,
        });
        setSources((current) => current.map((source) => (source.id === localSource.id ? { ...source, syncStatus } : source)));
        setCloudSyncBlocked(false);
        trackUserEvent(user.uid, "notebook_source_uploaded", 0, { sourcesAdded: 1, sourceType: "youtube" }).catch(() => undefined);
      } catch (error) {
        console.warn(getAppErrorMessage(error));
        setCloudSyncBlocked(true);
      }
      setYoutubeUrl("");
      setYoutubeTranscript("");
      setShowSourceModal(false);
    } catch (error) {
      setSourceError(t("notebook.transcriptFailed"));
      setStatus(t("notebook.transcriptFailed"));
    } finally {
      setIsSourceLoading(false);
    }
  });

  const runNotebookAi = async (prompt: string, saveUserMessage = true) => {
    if (!user || !prompt.trim() || aiRequestRef.current) return;
    prompt = prompt.trim();
    const generation = aiGenerationRef.current;
    const requestOwner = user.uid;
    const isCurrent = () => generation === aiGenerationRef.current && requestOwner === aiOwnerRef.current;
    aiRequestRef.current = true;
    setAiError("");
    setLastAiPrompt(prompt);
    setIsAiLoading(true);
    setStatus("");

    try {
      const localUserMessage: NotebookMessage = {
        id: makeSyncId("message"),
        role: "user",
        content: prompt,
        createdAt: new Date().toISOString(),
        syncStatus: isLocalAi ? undefined : "pending",
      };
      if (saveUserMessage) {
        setMessages((current) => [...current, localUserMessage]);
        if (!isLocalAi) {
        debugNotebookMetricsWrite(["users", user.uid, "notebookMessages", localUserMessage.id]);
        writeDocWithQueue({
          userId: user.uid,
          path: ["users", user.uid, "notebookMessages", localUserMessage.id],
          data: {
            role: "user",
            content: prompt,
            createdAt: localUserMessage.createdAt,
          },
          merge: true,
        })
          .then((syncStatus) => {
            if (!isCurrent()) return;
            setMessages((current) => current.map((message) => (message.id === localUserMessage.id ? { ...message, syncStatus } : message)));
            setCloudSyncBlocked(false);
            trackUserEvent(user.uid, "notebook_message_sent", 0, { messagesSent: 1 }).catch(() => undefined);
          })
          .catch((error) => {
            if (!isCurrent()) return;
            console.warn(getAppErrorMessage(error));
            setCloudSyncBlocked(true);
          });
        }
      }

      const answer = await askNotebook(prompt, buildNotebookContext(activeNote, sources, notebookStudentContext), notebookLanguage, {
        history: messages.map((message) => ({ role: message.role, content: message.content })),
        retries: 2,
      });
      if (!isCurrent()) return;
      const localAiMessage: NotebookMessage = {
        id: makeSyncId("message"),
        role: "assistant",
        content: answer,
        createdAt: new Date().toISOString(),
        syncStatus: isLocalAi ? undefined : "pending",
      };
      setMessages((current) => [...current, localAiMessage]);

      if (isLocalAi) { setStatus(t("notebook.localPreview")); return; }

      debugNotebookMetricsWrite(["users", user.uid, "notebookMessages", localAiMessage.id]);
      writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "notebookMessages", localAiMessage.id],
        data: {
        role: "assistant",
        content: answer,
        createdAt: localAiMessage.createdAt,
        },
        merge: true,
      })
        .then((syncStatus) => {
          if (!isCurrent()) return;
          setMessages((current) => current.map((message) => (message.id === localAiMessage.id ? { ...message, syncStatus } : message)));
          setCloudSyncBlocked(false);
        })
        .catch((error) => {
          if (!isCurrent()) return;
          console.warn(getAppErrorMessage(error));
          setCloudSyncBlocked(true);
        });
    } catch (error) {
      if (!isCurrent()) return;
      setAiError(classifyAiFailure(error));
    } finally {
      if (isCurrent()) {
        aiRequestRef.current = false;
        setIsAiLoading(false);
      }
    }
  };

  const formatSelection = (before:string,after='') => {
    const editor=editorRef.current;if(!editor)return;
    const start=editor.selectionStart,end=editor.selectionEnd;
    changeDraft(draftTitle,draftContent.slice(0,start)+before+draftContent.slice(start,end)+after+draftContent.slice(end));
    requestAnimationFrame(()=>{editor.focus();editor.setSelectionRange(start+before.length,end+before.length);});
  };

  return { locale, t, notes, sources, messages, activeNoteId, setActiveNoteId, search, setSearch, collectionFilter, setCollectionFilter, chatInput, setChatInput, isSavingNote, isAiLoading, aiError, lastAiPrompt, isSourceLoading, status, mobileView, setMobileView, aiOpenerRef, aiPanelRef, sourceDialogRef, openEditor, closeEditor, closeAiPanel, showSourceModal, setShowSourceModal, sourceUrl, setSourceUrl, sourceError, setSourceError, youtubeUrl, setYoutubeUrl, youtubeTranscript, setYoutubeTranscript, activeSourceTab, setActiveSourceTab, cloudSyncBlocked, sourceInputRef, editorRef, activeNote, draftTitle, setDraftTitle, draftContent, setDraftContent, draftRef, draftConflict, draftStorageError, changeDraft, showAiSourcePreviews, filteredNotes, filteredSources, handleCreateNote, handleSaveNote, handleDeleteNote, handleHighlightSelection, handleUploadSources, handleAddUrlSource, handleAddYoutubeSource, runNotebookAi, formatSelection };
}
