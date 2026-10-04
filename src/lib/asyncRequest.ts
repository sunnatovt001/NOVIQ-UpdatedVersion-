// A single pending operation is shared by retries; a deadline always settles UI state.
export const withDeadline = async <T>(operation: Promise<T>, milliseconds = 45000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("The request timed out. Please retry.")), milliseconds); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const createSingleFlight = () => {
  const pending = new Map<string, Promise<unknown>>();
  return <T>(key: string, run: () => Promise<T>): Promise<T> => {
    if (pending.has(key)) return pending.get(key) as Promise<T>;
    const request = Promise.resolve().then(run).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
};
