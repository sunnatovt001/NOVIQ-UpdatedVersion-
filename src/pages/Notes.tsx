import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Book,
  Brain,
  FileText,
  Globe,
  Highlighter,
  Link as LinkIcon,
  Loader2,
  Map,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
  Youtube,
} from "lucide-react";
import { AiAttachment, askNotebook } from "@/src/lib/gemini";
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
import { isLocalId, loadLocalData, makeSyncId, saveLocalData } from "@/src/lib/localStore";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { isReadOnlyAudit, isLocalAi } from "@/src/lib/auditMode";
import { buildStudentTutorContext } from "@/src/lib/tutorContext";
import { writeDocWithQueue, type SyncStatus } from "@/src/lib/offlineSync";
import { isNotificationPreferenceEnabled } from "@/src/lib/preferences";

interface NotebookNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
  syncStatus?: SyncStatus;
}

interface NotebookSource {
  id: string;
  type: "file" | "url" | "youtube";
  title: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  downloadURL?: string;
  extractedText?: string;
  summary?: string;
  createdAt?: unknown;
  syncStatus?: SyncStatus;
}

interface NotebookMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: unknown;
  syncStatus?: SyncStatus;
}

const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024; // increase to 25MB to allow larger study files

const debugNotebookMetricsWrite = (path: string[]) => {
  if (import.meta.env.DEV) {
    console.debug("[metrics-write] notebook path:", path.join("/"));
  }
};

const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const isTextbookUpload = (file: File) => {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf") || name.endsWith(".doc") || name.endsWith(".docx");
};

const formatUnknownDate = (value?: unknown) => {
  if (!value) return "";

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toLocaleString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  const timestampDate = (value as { toDate?: () => Date }).toDate?.();
  return timestampDate && !Number.isNaN(timestampDate.getTime()) ? timestampDate.toLocaleString() : "";
};

const mergeLocalRemote = <T extends { id: string }>(current: T[], remote: T[]) => {
  const pendingLocal = current.filter(
    (item) => isLocalId(item.id) || ((item as { syncStatus?: SyncStatus }).syncStatus || "synced") !== "synced"
  );
  return [...pendingLocal, ...remote.filter((item) => !pendingLocal.some((local) => local.id === item.id))];
};

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const isTextLike = (file: File) =>
  file.type.startsWith("text/") || /\.(txt|md|csv|json|html|css|js|ts|tsx)$/i.test(file.name);

const getSourcePriority = (source: NotebookSource) => {
  if (source.type === "file" && source.mimeType === "application/pdf") return "1. Uploaded PDF";
  if (source.type === "file") return "2. Uploaded file";
  if (source.type === "url") return "3. Imported website";
  if (source.type === "youtube") return "3. Imported YouTube transcript";
  return "5. Previous notebook knowledge";
};

const buildNotebookContext = (note: NotebookNote | null, sources: NotebookSource[], studentContext = "") => {
  const sourceContext = sources
    .map((source, index) => {
      const body = source.extractedText || source.summary || "No extracted text available.";
      return `[${index + 1}] ${source.title} (${source.type}; priority: ${getSourcePriority(source)})\n${body.slice(0, 12000)}`;
    })
    .join("\n\n");

  return `${studentContext ? `${studentContext}\n\n` : ""}Active note:
${note?.title || "Untitled"}

${note?.content || ""}

Sources:
${sourceContext || "No sources added yet."}

Source rules:
- Prefer uploaded files and PDFs before notes, imports, and general knowledge.
- When using a source, cite it inline as [Source: source title].
- If the answer is not supported by available sources, say so before giving general exam guidance.`;
};

export const Notes = () => {
  const { user, profile, updateLocalProfile } = useAuth();
  const [notes, setNotes] = useState<NotebookNote[]>([]);
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [messages, setMessages] = useState<NotebookMessage[]>([]);
  const [activeNoteId, setActiveNoteId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [search, setSearch] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiRequestRef = useRef(false);
  const [aiError, setAiError] = useState("");
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
  const [activeSourceTab, setActiveSourceTab] = useState<"url" | "youtube">("url");
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
  const showAiSourcePreviews = isNotificationPreferenceEnabled(profile, "aiSourcePreviews");
  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(search.toLowerCase()) ||
      note.content.toLowerCase().includes(search.toLowerCase()) ||
      note.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredSources = sources.filter(
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
    setNotes([]);
    setSources([]);
    setMessages([]);
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

  useEffect(() => {
    if (!activeNote) return;
    setDraftTitle(activeNote.title);
    setDraftContent(activeNote.content);
  }, [activeNote]);

  const handleCreateNote = async () => {
    if (!user) return;

    const localNote: NotebookNote = {
      id: makeSyncId("note"),
      title: "Untitled note",
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
        title: "Untitled note",
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
    if (isReadOnlyAudit) { setStatus("Saving is disabled in read-only audit mode."); return; }
    saveNoteRequestRef.current = true;
    setIsSavingNote(true);
    setStatus("");

    const nextNote = {
      ...activeNote,
      title: draftTitle.trim() || "Untitled note",
      content: draftContent,
      updatedAt: new Date().toISOString(),
    };
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
      setStatus("Note saved on this device.");
      setCloudSyncBlocked(false);
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
      setStatus("Note saved on this device. Cloud sync is waiting for Firebase rules.");
    } finally {
      saveNoteRequestRef.current = false;
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (note: NotebookNote) => {
    if (!user) return;
    const confirmed = window.confirm(`Delete "${note.title}"?`);
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

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (start === end) return;

    const selected = draftContent.slice(start, end);
    const next = `${draftContent.slice(0, start)}==${selected}==${draftContent.slice(end)}`;
    setDraftContent(next);
  };

  const summarizeUploadedSource = async (file: File, attachment: AiAttachment, extractedText: string) => {
    return askNotebook(
      "Create a Noviq Notebook mastery digest for this uploaded source. Include executive summary, key concepts, exam-relevant concepts, important definitions, common mistakes, exam traps, recall questions, application questions, exam-style questions, application-based flashcards, knowledge graph, learning roadmap, weakness opportunities, and revision suggestions.",
      [
        notebookStudentContext,
        `Uploaded source: ${file.name}. This uploaded file has highest source priority for this digest.`,
        extractedText
          ? `The uploaded source text is included below.\n\n${extractedText.slice(0, 18000)}`
          : "The uploaded source is attached as inline data. Read the file and produce a source-grounded mastery digest.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      "en-US",
      { attachments: [attachment], retries: 2 }
    );
  };

  const handleUploadSources = async (files: FileList | null) => {
    if (isReadOnlyAudit) { setStatus("Uploads are disabled in read-only audit mode."); return; }
    if (!user || !files?.length) return;
    setIsSourceLoading(true);
    setStatus("");
    const uploadedFiles = Array.from(files);
    const shouldAwardFirstTextbook =
      uploadedFiles.some(isTextbookUpload) && !profile?.xpAwarded?.[XP_KEYS.firstTextbookUpload];
    let firstTextbookAwardedThisBatch = false;

    for (const file of uploadedFiles) {
      try {
        if (file.size > MAX_SOURCE_FILE_BYTES) {
          setStatus(`${file.name} is larger than ${formatBytes(MAX_SOURCE_FILE_BYTES)}.`);
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
          summary = await summarizeUploadedSource(file, attachment, extractedText);
        } catch (err) {
          console.warn("Source digest failed, proceeding without automated digest", err);
          summary = "(Digest unavailable - the file was saved, but automated source analysis failed.)";
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
              source.id === localSource.id ? { ...source, downloadURL, syncStatus } : source
            )
          );
          setCloudSyncBlocked(false);
          trackUserEvent(user.uid, "notebook_source_uploaded", 0, { sourcesAdded: 1, sourceType: "file" }).catch(() => undefined);
        } catch (error) {
          console.warn(getAppErrorMessage(error));
          setCloudSyncBlocked(true);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Source analysis failed.");
      }
    }
    setStatus("Source added on this device.");
    setIsSourceLoading(false);
  };

  const fetchWebsiteText = async (url: string) => {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Enter a website address beginning with https:// or http://.");
    }
    const response = await fetch(parsedUrl.href, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Could not fetch website: ${response.status}`);
    const text = await response.text();
    return text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const handleAddUrlSource = async () => {
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
        "en-US",
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
      setStatus(error instanceof Error ? error.message : "Website source failed.");
    } finally {
      setIsSourceLoading(false);
    }
  };

  const handleAddYoutubeSource = async () => {
    if (!user || !youtubeTranscript.trim()) {
      setStatus("Paste a YouTube transcript so Noviq can analyze it accurately.");
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
        "en-US",
        { retries: 2 }
      );
      const localSource: NotebookSource = {
        id: makeSyncId("source"),
        type: "youtube",
        title: youtubeUrl.trim() ? `YouTube: ${youtubeUrl.trim()}` : "YouTube transcript",
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
      setStatus(error instanceof Error ? error.message : "YouTube transcript analysis failed.");
    } finally {
      setIsSourceLoading(false);
    }
  };

  const runNotebookAi = async (prompt: string, saveUserMessage = true) => {
    if (!user || !prompt.trim() || aiRequestRef.current) return;
    prompt = prompt.trim();
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
            setMessages((current) => current.map((message) => (message.id === localUserMessage.id ? { ...message, syncStatus } : message)));
            setCloudSyncBlocked(false);
            trackUserEvent(user.uid, "notebook_message_sent", 0, { messagesSent: 1 }).catch(() => undefined);
          })
          .catch((error) => {
            console.warn(getAppErrorMessage(error));
            setCloudSyncBlocked(true);
          });
        }
      }

      const answer = await askNotebook(prompt, buildNotebookContext(activeNote, sources, notebookStudentContext), "en-US", {
        history: messages.map((message) => ({ role: message.role, content: message.content })),
        retries: 2,
      });
      const localAiMessage: NotebookMessage = {
        id: makeSyncId("message"),
        role: "assistant",
        content: answer,
        createdAt: new Date().toISOString(),
        syncStatus: isLocalAi ? undefined : "pending",
      };
      setMessages((current) => [...current, localAiMessage]);

      if (isLocalAi) { setStatus("Local AI preview · chat history is not saved."); return; }

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
          setMessages((current) => current.map((message) => (message.id === localAiMessage.id ? { ...message, syncStatus } : message)));
          setCloudSyncBlocked(false);
        })
        .catch((error) => {
          console.warn(getAppErrorMessage(error));
          setCloudSyncBlocked(true);
        });
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Notebook engine failed. Please retry.");
    } finally {
      aiRequestRef.current = false;
      setIsAiLoading(false);
    }
  };

  const quickActions = [
    { label: "Mastery", icon: <Sparkles size={16} />, prompt: "Create a source-grounded mastery digest with summary, key insights, evidence, exam connection, traps, recall, application, exam question, and next best action." },
    { label: "Concepts", icon: <Book size={16} />, prompt: "Extract the exam-relevant concepts from my active note and sources. For each concept include meaning, why it matters, exam relevance, difficulty, common trap, and likely question type." },
    { label: "Traps", icon: <Brain size={16} />, prompt: "Identify the highest-risk exam traps and misconceptions in these sources. Explain the gap, consequence, fix, and give practice for each." },
    { label: "Recall", icon: <Highlighter size={16} />, prompt: "Generate an active recall session from these sources: recall questions, application questions, exam-style questions, answers, and a spaced-repetition plan." },
    { label: "Flashcards", icon: <FileText size={16} />, prompt: "Create application-based flashcards from these sources. Avoid definition-only cards; test problem solving, selection, correction, and exam reasoning." },
    { label: "Graph", icon: <Map size={16} />, prompt: "Build a markdown knowledge graph connecting ideas across sources. Include prerequisite links, related materials, weak-topic opportunities, and a learning roadmap." },
  ];

  return (
    <div className="grid h-[calc(100vh-140px)] min-h-[640px] grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[250px_minmax(0,1fr)_310px] 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
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
            <h2 className="font-display text-3xl font-bold tracking-tight text-white">Notebook</h2>
            <p className="mt-1 text-sm text-slate-500">Turns sources into exam mastery.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => sourceInputRef.current?.click()}
              disabled={isSourceLoading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {isSourceLoading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Upload
            </button>
            <button
              type="button"
              onClick={() => setShowSourceModal(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-300 hover:bg-white/10"
            >
              <LinkIcon size={15} />
              Link
            </button>
          </div>
          <button
            type="button"
            onClick={handleCreateNote}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-bold text-white shadow-xl shadow-blue-500/20 transition hover:bg-blue-500"
          >
            <Plus size={18} />
            Create note
          </button>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes and sources..."
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </div>
        </header>

        <div className="CustomScrollbar flex-1 space-y-5 overflow-y-auto p-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Sources</h3>
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
                <p className="mt-3 text-sm font-bold text-white">No sources yet</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Upload PDFs, DOCX, TXT, images, links, or transcripts.</p>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Notes</h3>
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
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{note.content || "Empty note"}</p>
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
              <p className="mt-3 text-sm font-bold text-white">{search.trim() ? "No notes match your search." : "No notes yet. Create your first note."}</p>
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
                  aria-label="Note title"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  className="w-full truncate bg-transparent font-display text-2xl font-bold text-white outline-none"
                />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {sources.length} sources / exam-grounded knowledge engine
                </p>
                {cloudSyncBlocked && (
                  <p className="text-xs font-semibold text-amber-300">
                    Saved locally. Cloud sync will resume after Firebase rules are deployed.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" aria-label="Close editor" onClick={closeEditor} className="min-h-11 min-w-11 rounded-xl bg-white/5 p-3 text-slate-400 xl:hidden">
                  <X size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleHighlightSelection}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/10"
                >
                  <Highlighter size={16} />
                  Highlight
                </button>
                <button
                  type="button"
                  onClick={() => setMobileView("sources")}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/10 xl:hidden"
                >
                  Sources
                </button>
                <button
                  type="button"
                  onClick={() => { aiOpenerRef.current = document.activeElement as HTMLElement; setMobileView("chat"); }}
                  className="rounded-2xl bg-blue-600 px-4 py-3 text-xs font-bold text-white xl:hidden"
                >
                  AI
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={isSavingNote}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {isSavingNote ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(activeNote)}
                  aria-label="Delete note"
                  className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-red-200 hover:bg-red-400/15"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              </div>
            </header>

            <textarea
              ref={editorRef}
              aria-label="Note content"
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder="Write notes, paste highlights, or ask Noviq to turn sources into exam-ready notes..."
              className="CustomScrollbar flex-1 resize-none bg-transparent p-6 text-base leading-8 text-slate-200 outline-none placeholder:text-slate-600 sm:p-10"
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <Book size={40} className="text-slate-600" />
            <h3 className="mt-4 text-2xl font-bold text-white">Select or create a note</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Notes and source mastery conversations are saved in your account.</p>
          </div>
        )}
      </main>

      <aside ref={aiPanelRef} aria-label="Notebook AI panel" className={cn("glass flex h-full min-w-0 flex-col overflow-hidden border-white/10 bg-white/[0.02]", mobileView !== "chat" && "hidden xl:flex")}>
        <header className="shrink-0 border-b border-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="section-label">Notebook Engine</p>
              <h3 className="mt-1 text-xl font-bold text-white">Build mastery</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{sources.length} source{sources.length === 1 ? "" : "s"} available</p>
            </div>
            <button type="button" aria-label="Close AI panel" onClick={closeAiPanel} className="min-h-11 min-w-11 rounded-xl bg-white/5 p-2 text-slate-400 hover:text-white xl:hidden">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col overflow-hidden">
            <div className="grid grid-cols-2 gap-2 border-b border-white/10 p-3">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => runNotebookAi(action.prompt)}
                  disabled={isAiLoading}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-50"
                >
                  {action.icon}
                  <span className="truncate">{action.label}</span>
                </button>
              ))}
            </div>

            <div className="CustomScrollbar flex-1 space-y-4 overflow-y-auto p-3">
              {messages.length === 0 && (
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-slate-400">
                  Ask questions about your notes and sources. Answers will cite source names when used.
                </div>
              )}

              {messages.map((message) => {
                const isUser = message.role === "user";

                // extract source citations like [Source: title]
                const citations: string[] = [];
                const content = String(message.content || "").replace(/\[Source:([^\]]+)\]/g, (_, m) => {
                  citations.push(m.trim());
                  return "";
                });

                return (
                  <div key={message.id} className={cn("flex min-w-0 items-start gap-3", isUser && "flex-row-reverse")}>
                    <div className="shrink-0">
                      {isUser ? (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">You</div>
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-fuchsia-500 via-amber-300 to-cyan-300 p-[2px] shadow-lg">
                          <div className="h-full w-full rounded-full bg-slate-950 p-[2px]"><img src="/saidamin-avatar.jpg" alt="Saidamin" className="h-full w-full rounded-full object-cover object-top" /></div>
                        </div>
                      )}
                    </div>

                    <div className={cn("min-w-0 max-w-[82%] rounded-2xl p-3 text-sm leading-6", isUser ? "chat-user-message bg-blue-600 text-white" : "border border-white/10 bg-white/[0.04] text-slate-200")}> 
                      {!isUser && (
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <strong className="text-sm">Saidamin</strong>
                            <span className="text-[11px] text-slate-400">/ Notebook Engine</span>
                          </div>
                          <span className="text-[11px] text-slate-500 opacity-70">{formatUnknownDate(message.createdAt)}</span>
                        </div>
                      )}

                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                        }}
                      >
                        {content}
                      </ReactMarkdown>

                      {citations.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {citations.map((c) => (
                            <span key={c} className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">
                              Source: {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isAiLoading && (
                <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-sm font-bold text-cyan-300">
                  <Loader2 size={16} className="animate-spin" />
                  Reading sources and building exam practice...
                </div>
              )}
            </div>

            <div className="border-t border-white/10 p-3">
              {aiError && <div role="alert" className="mb-3 rounded-xl border border-amber-300 p-3 text-sm text-amber-700"><p>{aiError}</p><button type="button" disabled={isAiLoading} className="mt-2 underline" onClick={() => void runNotebookAi(lastAiPrompt, false)}>Retry AI response</button></div>}
              <textarea
                aria-label="Notebook AI message"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (chatInput.trim()) {
                      runNotebookAi(chatInput);
                      setChatInput("");
                    }
                  }
                }}
                placeholder="Ask for evidence, traps, recall, or exam questions..."
                className="CustomScrollbar mb-3 min-h-24 w-full resize-none rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-sm text-white outline-none focus:border-blue-500/50"
              />
              <button
                type="button"
                onClick={() => {
                  if (chatInput.trim()) {
                    runNotebookAi(chatInput);
                    setChatInput("");
                  }
                }}
                disabled={!chatInput.trim() || isAiLoading}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isAiLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                Ask
              </button>
            </div>
        </div>
      </aside>

      {status && (
        <div className="fixed bottom-6 left-1/2 z-[140] -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-white shadow-2xl">
          {status}
        </div>
      )}

      <AnimatePresence>
        {showSourceModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="noviq-modal-backdrop z-[130]"
          >
            <div className="noviq-modal-positioner noviq-modal-lg">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="noviq-modal-panel CustomScrollbar glass border-white/10 bg-[#0B1020] p-5 sm:p-6"
              ref={sourceDialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Add notebook source"
              tabIndex={-1}
            >
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="section-label">Add source</p>
                  <h3 className="text-3xl font-bold text-white">Website or transcript</h3>
                </div>
                <button type="button" aria-label="Close source form" onClick={() => setShowSourceModal(false)} className="rounded-xl bg-white/5 p-2 text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => setActiveSourceTab("url")}
                  className={cn("rounded-xl py-3 text-sm font-bold", activeSourceTab === "url" ? "bg-white text-slate-950" : "text-slate-400")}
                >
                  Website
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSourceTab("youtube")}
                  className={cn("rounded-xl py-3 text-sm font-bold", activeSourceTab === "youtube" ? "bg-white text-slate-950" : "text-slate-400")}
                >
                  YouTube transcript
                </button>
              </div>

              {activeSourceTab === "url" ? (
                <div className="space-y-4">
                  <input
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://example.com/article"
                    className="premium-input"
                  />
                  <button
                    type="button"
                    onClick={handleAddUrlSource}
                    disabled={!sourceUrl.trim() || isSourceLoading}
                    className="premium-action flex min-h-12 w-full items-center justify-center gap-2"
                  >
                    {isSourceLoading ? <Loader2 size={18} className="animate-spin" /> : <Globe size={18} />}
                    Add website
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    value={youtubeUrl}
                    onChange={(event) => setYoutubeUrl(event.target.value)}
                    placeholder="YouTube URL"
                    className="premium-input"
                  />
                  <textarea
                    value={youtubeTranscript}
                    onChange={(event) => setYoutubeTranscript(event.target.value)}
                    placeholder="Paste transcript text here..."
                    className="premium-input min-h-44 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddYoutubeSource}
                    disabled={!youtubeTranscript.trim() || isSourceLoading}
                    className="premium-action flex min-h-12 w-full items-center justify-center gap-2"
                  >
                    {isSourceLoading ? <Loader2 size={18} className="animate-spin" /> : <Youtube size={18} />}
                    Analyze transcript
                  </button>
                </div>
              )}
            </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
