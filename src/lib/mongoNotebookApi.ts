// Explicit staging transport. Existing Firebase screens are not switched here.
export type MongoNote = { id: string; title: string; content: string; tags: string[];
  revision: number; createdAt: string | null; updatedAt: string | null };
type NoteDraft = Pick<MongoNote, 'title' | 'content' | 'tags'>;

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/notebook/notes${path}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Object.assign(new Error(response.status === 409 ? 'Note changed. Reload before saving.' :
    response.status === 401 ? 'Sign in required.' : 'Notebook request failed.'), { status: response.status });
  return response.json() as Promise<T>;
}
export const loadMongoNotes = (after?: string) => request<{ notes: MongoNote[]; nextCursor: string | null }>(after ? `?after=${encodeURIComponent(after)}` : '');
export const loadMongoNote = (id: string) => request<{ note: MongoNote }>(`/${encodeURIComponent(id)}`);
// Retain the same mutationId when retrying a timed-out save/delete.
export const saveMongoNote = (id: string, note: NoteDraft, baseRevision: number, mutationId: string) =>
  request<{ note: MongoNote }>(`/${encodeURIComponent(id)}`, 'PUT', { ...note, baseRevision, mutationId });
export const deleteMongoNote = (id: string, baseRevision: number, mutationId: string) =>
  request<{ id: string; revision: number; deleted: true }>(`/${encodeURIComponent(id)}`, 'DELETE', { baseRevision, mutationId });
