export const createSourceBatch = (total: number) => {
  let added = 0;
  return {
    markAdded: () => { added++; },
    messageKey: (): "notebook.sourceBatchFailed" | "notebook.sourceBatchPartial" | "notebook.sourceBatchAdded" =>
      added === 0 ? "notebook.sourceBatchFailed" : added < total ? "notebook.sourceBatchPartial" : "notebook.sourceBatchAdded",
    values: () => ({ added, total }),
  };
};

export const highlightNotebookSelection = (text: string, start: number, end: number) =>
  start === end ? null : `${text.slice(0, start)}==${text.slice(start, end)}==${text.slice(end)}`;

export const withSingleSourceRequest = <Args extends unknown[], Result>(lock: { current: boolean }, operation: (...args: Args) => Promise<Result>) =>
  async (...args: Args): Promise<Result | undefined> => {
    if (lock.current) return;
    lock.current = true;
    try { return await operation(...args); }
    finally { lock.current = false; }
  };
