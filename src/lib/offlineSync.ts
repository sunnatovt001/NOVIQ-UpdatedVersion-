import { deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { useEffect } from "react";
import { db } from "@/src/lib/firebase";
import { loadLocalData, saveLocalData } from "@/src/lib/localStore";

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

const loadQueue = () => loadLocalData<OfflineSyncOperation[]>(QUEUE_KEY, []);

const saveQueue = (queue: OfflineSyncOperation[]) => {
  const retainedSynced = queue
    .filter((item) => item.status === "synced")
    .slice(-MAX_RETAINED_SYNCED_OPERATIONS);
  const active = queue.filter((item) => item.status !== "synced");
  saveLocalData(QUEUE_KEY, [...active, ...retainedSynced]);
};

export const getOfflineSyncQueue = () => loadQueue();

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
  await flushOfflineSyncQueue(userId);
  return getQueuedOperation(kind, path)?.status || "synced";
};

export const flushOfflineSyncQueue = async (userId?: string | null) => {
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
