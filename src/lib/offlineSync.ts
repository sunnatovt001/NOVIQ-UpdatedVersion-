import { deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { useEffect } from "react";
import { isReadOnlyAudit } from "./auditMode";
import { db } from "@/src/lib/firebase";
import { loadLocalDataStrict, saveLocalData } from "@/src/lib/localStore";

export type SyncStatus = "pending" | "synced" | "failed";
export type SyncOperationKind = "set" | "update" | "delete";

type JsonRecord = Record<string, unknown>;

export type OfflineSyncOperation = {
  id: string;
  userId: string;
  path: string[];
  kind: SyncOperationKind;
  data?: JsonRecord;
  merge?: boolean;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: SyncStatus;
  lastError?: string;
  revision?: string;
};

const QUEUE_KEY = "noviq:offlineSyncQueue:v1";
const MAX_RETAINED_SYNCED_OPERATIONS = 40;
const activeFlushes = new Map<string, Promise<void>>();

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const normalizePath = (path: string[]) => path.filter(Boolean);

const operationId = (kind: SyncOperationKind, path: string[]) =>
  `${kind}:${normalizePath(path).join("/")}`;

const isValidOperation = (item: OfflineSyncOperation) => !!item &&
  typeof item.id === "string" && typeof item.userId === "string" &&
  Array.isArray(item.path) && item.path.length >= 2 && item.path.length % 2 === 0 &&
  item.path.every((segment) => typeof segment === "string" && !!segment && !segment.includes("/")) &&
  ["set", "update", "delete"].includes(item.kind) &&
  ["pending", "failed", "synced"].includes(item.status) &&
  item.id === operationId(item.kind, item.path);

const loadQueue = () => {
  let queue: OfflineSyncOperation[];
  try {
    queue = loadLocalDataStrict<OfflineSyncOperation[]>(QUEUE_KEY, []);
    if (!Array.isArray(queue) || !queue.every(isValidOperation)) throw new Error("Invalid queue format");
  } catch (error) {
    console.error("Offline queue could not be read; preserving stored data", error);
    throw new Error("Local changes could not be read. Keep this browser's data and contact support before saving again.");
  }
  return queue;
};

const saveQueue = (queue: OfflineSyncOperation[]) => {
  const retainedSynced = queue
    .filter((item) => item.status === "synced")
    .slice(-MAX_RETAINED_SYNCED_OPERATIONS);
  const active = queue.filter((item) => item.status !== "synced");
  try {
    saveLocalData(QUEUE_KEY, [...active, ...retainedSynced]);
  } catch (error) {
    console.error("Offline queue could not be saved", error);
    throw new Error("Your changes could not be saved on this device. Free some storage and try again.");
  }
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent("noviq:offline-sync"));
  }
};

export const getOfflineSyncQueue = () => loadQueue();

export const exportPendingChanges = (userId: string) => JSON.stringify({
  format: "noviq-pending-changes", version: 1, userId,
  exportedAt: new Date().toISOString(),
  operations: loadQueue().filter(item => item.userId === userId && item.status !== "synced"),
}, null, 2);

export const importPendingChanges = (userId: string, text: string) => {
  if (isReadOnlyAudit) throw new Error("Import is disabled in read-only audit mode.");
  if (text.length > 10 * 1024 * 1024) throw new Error("Backup is too large (maximum 10 MB).");
  const backup = JSON.parse(text);
  if (backup.format !== "noviq-pending-changes" || backup.version !== 1 || backup.userId !== userId ||
    !Array.isArray(backup.operations) || !backup.operations.every((item: OfflineSyncOperation) =>
      isValidOperation(item) && item.userId === userId && item.path[0] === "users" && item.path[1] === userId)) {
    throw new Error("Use a pending-changes backup from the same account. Only private account changes can be imported.");
  }
  const queue = loadQueue();
  let imported = 0;
  for (const item of backup.operations as OfflineSyncOperation[]) {
    // Existing pending edits always win; never silently overwrite a newer draft.
    if (queue.some(existing => existing.id === item.id && existing.status !== "synced")) continue;
    const index = queue.findIndex(existing => existing.id === item.id);
    if (index >= 0) queue.splice(index, 1);
    queue.push({...item, status: "pending", revision: crypto.randomUUID(), updatedAt: new Date().toISOString()});
    imported++;
  }
  saveQueue(queue);
  return imported;
};

export const getQueuedOperation = (kind: SyncOperationKind, path: string[]) =>
  loadQueue().find((operation) => operation.id === operationId(kind, path));

export const getQueuedRecordStatus = (path: string[]) => {
  const operation = loadQueue()
    .filter((item) => item.path.join("/") === normalizePath(path).join("/"))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];

  return operation?.status;
};

const upsertQueuedOperation = (operation: OfflineSyncOperation) => {
  const queue = loadQueue();
  const nextQueue = [
    ...queue.filter((item) => item.id !== operation.id),
    operation,
  ];
  saveQueue(nextQueue);
  return operation;
};

const markQueuedOperation = (
  id: string,
  patch: Pick<OfflineSyncOperation, "status" | "updatedAt"> &
    Partial<OfflineSyncOperation>,
  revision?: string,
) => {
  const queue = loadQueue();
  saveQueue(
    queue.map((item) =>
      item.id === id && item.revision === revision
        ? { ...item, ...patch }
        : item,
    ),
  );
};

const applyOperation = async (operation: OfflineSyncOperation) => {
  const [rootPath, ...pathSegments] = normalizePath(operation.path);
  if (!rootPath) {
    throw new Error(
      "Cannot sync a Firestore operation without a document path.",
    );
  }
  const targetRef = doc(db, rootPath, ...pathSegments);
  const syncMetadata =
    rootPath === "users" && pathSegments.length === 1
      ? {}
      : {
          syncStatus: "synced",
          syncedAt: new Date().toISOString(),
        };

  if (operation.kind === "delete") {
    await deleteDoc(targetRef);
    return;
  }

  if (operation.kind === "update") {
    await updateDoc(targetRef, {
      ...(operation.data || {}),
      ...syncMetadata,
    });
    return;
  }

  await setDoc(
    targetRef,
    {
      ...(operation.data || {}),
      ...syncMetadata,
    },
    { merge: operation.merge !== false },
  );
};

const buildOperation = ({
  userId,
  path,
  kind,
  data,
  merge,
  attempts = 0,
  status = "pending",
  lastError,
}: {
  userId: string;
  path: string[];
  kind: SyncOperationKind;
  data?: JsonRecord;
  merge?: boolean;
  attempts?: number;
  status?: SyncStatus;
  lastError?: string;
}): OfflineSyncOperation => {
  const now = new Date().toISOString();
  return {
    id: operationId(kind, path),
    userId,
    path: normalizePath(path),
    kind,
    data,
    merge,
    createdAt: now,
    updatedAt: now,
    attempts,
    status,
    lastError,
    revision: crypto.randomUUID(),
  };
};

export const queueFirestoreOperation = (
  operation: Omit<OfflineSyncOperation, "id" | "createdAt" | "updatedAt">,
) => upsertQueuedOperation(buildOperation(operation));

export const writeDocWithQueue = async ({
  userId,
  path,
  data,
  merge = true,
  kind = "set",
}: {
  userId: string;
  path: string[];
  data?: JsonRecord;
  merge?: boolean;
  kind?: SyncOperationKind;
}): Promise<SyncStatus> => {
  if (isReadOnlyAudit) throw new Error("Saving is disabled in read-only audit mode.");
  const existing = getQueuedOperation(kind, path);
  const operation = buildOperation({
    userId,
    path,
    kind,
    data:
      existing?.status !== "synced" && merge && kind !== "delete"
        ? { ...existing?.data, ...data }
        : data,
    merge,
    attempts: existing?.attempts || 0,
    status: "pending",
  });

  upsertQueuedOperation(operation);
  if (typeof navigator !== "undefined" && !navigator.onLine) return "pending";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Settle the caller without releasing the actual flush lock. The SDK may
    // complete later; serial ordering protects newer revisions from old writes.
    await Promise.race([
      flushOfflineSyncQueue(userId),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 15000); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return getQueuedOperation(kind, path)?.status || "pending";
};

export const flushOfflineSyncQueue = async (userId?: string | null) => {
  if (isReadOnlyAudit) return;
  if (!userId || (typeof navigator !== "undefined" && !navigator.onLine))
    return;
  const current = activeFlushes.get(userId);
  if (current) return current;
  const run = async () => {
    const attempted = new Set<string>();
    while (true) {
      const retryable = loadQueue().filter(
        (operation) =>
          operation.status !== "synced" &&
          operation.userId === userId &&
          !attempted.has(`${operation.id}:${operation.revision}`),
      );
      if (!retryable.length) break;

      for (const operation of retryable) {
        attempted.add(`${operation.id}:${operation.revision}`);
        try {
          await applyOperation(operation);
          markQueuedOperation(
            operation.id,
            {
              status: "synced",
              attempts: operation.attempts + 1,
              updatedAt: new Date().toISOString(),
              lastError: undefined,
            },
            operation.revision,
          );
        } catch (error) {
          markQueuedOperation(
            operation.id,
            {
              status: "failed",
              attempts: operation.attempts + 1,
              updatedAt: new Date().toISOString(),
              lastError: serializeError(error),
            },
            operation.revision,
          );
        }
      }
    }
  };
  const promise = run().finally(() => activeFlushes.delete(userId));
  activeFlushes.set(userId, promise);
  return promise;
};

export const useOfflineSyncQueue = (userId?: string | null) => {
  useEffect(() => {
    if (!userId) return undefined;

    flushOfflineSyncQueue(userId).catch((error) => {
      console.warn("Offline sync queue flush failed", error);
    });

    const handleOnline = () => {
      flushOfflineSyncQueue(userId).catch((error) => {
        console.warn("Offline sync queue retry failed", error);
      });
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [userId]);
};
