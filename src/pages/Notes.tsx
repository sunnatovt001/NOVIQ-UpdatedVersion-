import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Book,
  FileText,
  FolderOpen,
  Globe,
  Highlighter,
  Link as LinkIcon,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  Youtube,
} from "lucide-react";
import { type AiAttachment, askNotebook } from "@/src/lib/gemini";
import { cn } from "@/src/lib/utils";
import { useAuth } from "@/src/contexts/AuthContext";
import { trackUserEvent } from "@/src/lib/analytics";
import { buildXpAwardPatch, NOVIQ_XP, persistXpAwards, XP_KEYS } from "@/src/lib/progress";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import ReactMarkdown from "react-markdown";
import { getAppErrorMessage } from "@/src/lib/errors";
import { classifyAiFailure, getAiFailureMessage, type AiFailureKind } from "@/src/lib/aiFailure";
import { loadLocalData, loadLocalDataStrict, makeSyncId, saveLocalData } from "@/src/lib/localStore";
import {useNotebookDraft} from '@/src/features/pro/useNotebookDraft';
import {notebookDraftKey,validNotebookDraft,type NotebookDraft} from '@/src/features/pro/notebookDraft';
import {recordDate} from '@/src/lib/recordDate';
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { isReadOnlyAudit, isLocalAi } from "@/src/lib/auditMode";
import { buildStudentTutorContext } from "@/src/lib/tutorContext";
import { writeDocWithQueue } from "@/src/lib/offlineSync";
import { isNotificationPreferenceEnabled } from "@/src/lib/preferences";
import {
  buildNotebookContext,
  debugNotebookMetricsWrite,
  formatBytes,
  formatUnknownDate,
  isTextbookUpload,
  isTextLike,
  MAX_SOURCE_FILE_BYTES,
  mergeLocalRemote,
  readAsDataUrl,
  type NotebookMessage,
  type NotebookNote,
  type NotebookSource,
} from "@/src/features/notebook/notebookModel";
import { NotebookSourceDialog, type NotebookSourceTab } from "@/src/features/notebook/NotebookSourceDialog";
import { NotebookAiPanel } from "@/src/features/notebook/NotebookAiPanel";
import { useNotebookAiScope } from "@/src/features/notebook/useNotebookAiScope";
import { summarizeUploadedSource } from "@/src/features/notebook/notebookSourceAnalysis";
import { createSourceBatch, highlightNotebookSelection, withSingleSourceRequest } from "@/src/features/notebook/sourceBatch";
import { useLocale } from "@/src/contexts/LocaleContext";
import type { TutorLanguage } from "@/src/features/tutor/tutorCopy";

export const Notes = () => {
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
    if(!user || !activeNote || isReadOnlyAudit || isSavingNote || draftConflict || draftStorageError || !draftRef.current?.dirty || draftRef.current.noteId!==activeNote.id)return;
    const timer=window.setTimeout(()=>void handleSaveNote(),900);
    return()=>window.clearTimeout(timer);
  },[draftTitle,draftContent,activeNote?.id,user?.uid,isSavingNote,draftConflict,draftStorageError]);

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
    if (next !== null) setDraftContent(next);
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

  const fetchWebsiteText = async (url: string) => {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(t("notebook.invalidUrl"));
    }
    const response = await fetch(parsedUrl.href, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(t("notebook.fetchFailed", { status: response.status }));
    const text = await response.text();
    return text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const handleAddUrlSource = withSingleSourceRequest(sourceRequestRef, async () => {
    if (!user || !sourceUrl.trim()) return;
    setIsSourceLoading(true);
    setStatus("");

    try {
      const normalizedUrl = sourceUrl.trim();
      const extractedText = await fetchWebsiteText(normalizedUrl);
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
      );
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
      setStatus(t("notebook.websiteFailed"));
    } finally {
      setIsSourceLoading(false);
    }
  });

  const handleAddYoutubeSource = withSingleSourceRequest(sourceRequestRef, async () => {
    if (!user || !youtubeTranscript.trim()) {
      setStatus(t("notebook.transcriptRequired"));
      return;
    }

    setIsSourceLoading(true);
    setStatus("");

    try {
      const summary = await askNotebook(
        "Create a source-grounded mastery digest from this YouTube transcript. Include key concepts, exam relevance, traps, recall, application practice, exam-style questions, and next revision action.",
        [
          notebookStudentContext,
          youtubeUrl.trim() ? `YouTube source: ${youtubeUrl.trim()}. Use this transcript before general knowledge.` : "YouTube transcript source. Use this transcript before general knowledge.",
          youtubeTranscript.slice(0, 24000),
        ]
          .filter(Boolean)
          .join("\n\n"),
        notebookLanguage,
        { retries: 2 }
      );
      const localSource: NotebookSource = {
        id: makeSyncId("source"),
        type: "youtube",
        title: youtubeUrl.trim() ? `YouTube: ${youtubeUrl.trim()}` : t("notebook.youtubeTranscript"),
        url: youtubeUrl.trim(),
        extractedText: youtubeTranscript.slice(0, 50000),
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
        extractedText: youtubeTranscript.slice(0, 50000),
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

  return (
    <div className="liquid-library">
      <header className="liquid-library-heading"><div><h1>{locale === 'uz' ? 'Kutubxona' : locale === 'ru' ? 'Библиотека' : 'Library'}</h1><p>{locale === 'uz' ? 'Materiallaringiz, qaydlaringiz va yangi g‘oyalaringiz bir joyda.' : locale === 'ru' ? 'Материалы, заметки и новые идеи в одном месте.' : 'Your materials, notes and bright ideas. All together.'}</p></div><button className="liquid-button liquid-primary" disabled={isSourceLoading} onClick={() => sourceInputRef.current?.click()}><Upload size={16}/>{t('notebook.upload')}</button></header>
      <div className="liquid-library-collections" aria-label={locale === 'uz' ? 'To‘plamlar' : locale === 'ru' ? 'Коллекции' : 'Collections'}>{[
        { id: 'all' as const, icon: FolderOpen, label: locale === 'uz' ? 'Barcha materiallar' : locale === 'ru' ? 'Все материалы' : 'All materials', count: notes.length + sources.length },
        { id: 'notes' as const, icon: Book, label: t('notebook.notes'), count: notes.length },
        { id: 'documents' as const, icon: FileText, label: locale === 'uz' ? 'Hujjatlar' : locale === 'ru' ? 'Документы' : 'Documents', count: sources.filter(s => s.type === 'file').length },
        { id: 'links' as const, icon: LinkIcon, label: locale === 'uz' ? 'Havolalar' : locale === 'ru' ? 'Ссылки' : 'Saved links', count: sources.filter(s => s.type !== 'file').length },
      ].map(({ id, icon: Icon, label, count }) => <button key={id} aria-pressed={collectionFilter === id} onClick={() => { setCollectionFilter(id); setMobileView('notes'); }}><Icon size={24}/><span><strong>{label}</strong><small>{count} {locale === 'uz' ? 'ta material' : locale === 'ru' ? 'материалов' : 'items'}</small></span></button>)}</div>
    <div className="pro-notebook-workspace grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden sm:gap-4 xl:grid-cols-[250px_minmax(0,1fr)_310px] 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
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
              onClick={() => setShowSourceModal(true)}
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

            {draftConflict && <p role="alert" className="px-6 text-sm text-amber-600">{locale==='uz'?'Qayd boshqa joyda o‘zgargan. Loyihangiz saqlangan; ko‘rib chiqib Saqlash tugmasini bosing.':locale==='ru'?'Заметка изменилась в другом месте. Черновик сохранён; проверьте и нажмите «Сохранить».':'This note changed elsewhere. Your draft is preserved; review it and choose Save to resolve.'}</p>}
            {draftStorageError && <p role="alert" className="px-6 text-sm text-amber-600">{locale==='uz'?'Mahalliy loyiha saqlanmadi. Matnni saqlang yoki nusxalang.':locale==='ru'?'Не удалось сохранить черновик. Сохраните или скопируйте текст.':'The local draft could not be stored. Save or copy your text before leaving.'}</p>}
            <p role="status" data-notebook-autosave className="px-6 text-xs">{isSavingNote ? (locale==='uz'?'Saqlanmoqda…':locale==='ru'?'Сохранение…':'Saving…') : draftRef.current?.dirty ? (locale==='uz'?'Loyiha qurilmada saqlangan':locale==='ru'?'Черновик сохранён на устройстве':'Draft saved on this device') : status}</p>
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

      {status && (
        <div className="fixed bottom-6 left-1/2 z-[140] -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-white shadow-2xl">
          {status}
        </div>
      )}

      <NotebookSourceDialog
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
    </div>
  );
};
