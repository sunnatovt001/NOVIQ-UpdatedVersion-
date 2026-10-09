import { isLocalId } from "@/src/lib/localStore";
import type { SyncStatus } from "@/src/lib/offlineSync";

export interface NotebookNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
  syncStatus?: SyncStatus;
}

export interface NotebookSource {
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

export interface NotebookMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: unknown;
  syncStatus?: SyncStatus;
}

export const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;

export const debugNotebookMetricsWrite = (path: string[]) => {
  if (import.meta.env.DEV) {
    console.debug("[metrics-write] notebook path:", path.join("/"));
  }
};

export const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const isTextbookUpload = (file: File) => {
  const name = file.name.toLowerCase();
  return (
    file.type === "application/pdf" ||
    name.endsWith(".pdf") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  );
};

export const formatUnknownDate = (value?: unknown) => {
  if (!value) return "";

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toLocaleString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  const timestampDate = (value as { toDate?: () => Date }).toDate?.();
  return timestampDate && !Number.isNaN(timestampDate.getTime())
    ? timestampDate.toLocaleString()
    : "";
};

export const mergeLocalRemote = <T extends { id: string }>(
  current: T[],
  remote: T[],
) => {
  const pendingLocal = current.filter(
    (item) =>
      isLocalId(item.id) ||
      ((item as { syncStatus?: SyncStatus }).syncStatus || "synced") !==
        "synced",
  );
  return [
    ...pendingLocal,
    ...remote.filter(
      (item) => !pendingLocal.some((local) => local.id === item.id),
    ),
  ];
};

export const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const isTextLike = (file: File) =>
  file.type.startsWith("text/") ||
  /\.(txt|md|csv|json|html|css|js|ts|tsx)$/i.test(file.name);

const getSourcePriority = (source: NotebookSource) => {
  if (source.type === "file" && source.mimeType === "application/pdf") {
    return "1. Uploaded PDF";
  }
  if (source.type === "file") return "2. Uploaded file";
  if (source.type === "url") return "3. Imported website";
  if (source.type === "youtube") return "3. Imported YouTube transcript";
  return "5. Previous notebook knowledge";
};

export const buildNotebookContext = (
  note: NotebookNote | null,
  sources: NotebookSource[],
  studentContext = "",
) => {
  const sourceContext = sources
    .map((source, index) => {
      const body =
        source.extractedText ||
        source.summary ||
        "No extracted text available.";
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
