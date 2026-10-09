// Durable queues must fail closed: corrupt or inaccessible storage must never
// be mistaken for an empty queue and overwritten by the next edit.
export const loadLocalDataStrict = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  return raw === null ? fallback : JSON.parse(raw) as T;
};

export const loadLocalData = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;

  try {
    return loadLocalDataStrict(key, fallback);
  } catch {
    return fallback;
  }
};

export const saveLocalData = <T>(key: string, value: T) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  return true;
};

export const trySaveLocalData = <T>(key: string, value: T) => {
  try {
    return Boolean(saveLocalData(key, value));
  } catch {
    return false;
  }
};

export const removeLocalData = (key: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
};

export const makeLocalId = (prefix: string) =>
  `${prefix}-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const isLocalId = (id: string) => id.includes("-local-");

export const makeSyncId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
