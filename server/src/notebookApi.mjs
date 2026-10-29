import { createHash } from 'node:crypto';
import { readSessionToken } from './authApi.mjs';
import { requireTrustedOrigin } from './sessions.mjs';

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const failure = status => Object.assign(new Error('Notebook request rejected.'), { status });
const key = (uid, id) => JSON.stringify([uid, id]);
const publicNote = row => ({ id: row.id, title: row.title, content: row.content,
  tags: row.tags, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function readBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw failure(415);
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 512 * 1024) throw failure(413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw failure(400); }
}

function mutation(body, deleting) {
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      !Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0 ||
      typeof body.mutationId !== 'string' || !idPattern.test(body.mutationId)) throw failure(400);
  const allowed = deleting ? ['baseRevision', 'mutationId'] : ['baseRevision', 'mutationId', 'title', 'content', 'tags'];
  if (Object.keys(body).some(field => !allowed.includes(field))) throw failure(400);
  if (!deleting && (typeof body.title !== 'string' || body.title.length > 300 ||
      typeof body.content !== 'string' || body.content.length > 200000 ||
      !Array.isArray(body.tags) || body.tags.length > 30 ||
      body.tags.some(tag => typeof tag !== 'string' || tag.length > 80))) throw failure(400);
  return deleting ? null : { title: body.title, content: body.content, tags: body.tags };
}

// A domain-specific owner-bound API. No arbitrary collection/path/filter input.
export function createNotebookApi(db, sessions, { origin, now = () => new Date() }) {
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => { response.statusCode = status; response.end(JSON.stringify(value)); };
    try {
      const user = await sessions.resolve(readSessionToken(request.headers.cookie));
      if (!user) throw failure(401);
      const url = new URL(request.url, 'http://localhost');
      const match = /^\/api\/notebook\/notes(?:\/([A-Za-z0-9_-]{1,128}))?$/.exec(url.pathname);
      if (!match) throw failure(404);
      const id = match[1], collection = db.collection('notebook_notes');
      if (request.method === 'GET') {
        if (id) {
          if (url.search) throw failure(400);
          const row = await collection.findOne({ _id: key(user.uid, id), userId: user.uid, deleted: false }, { maxTimeMS: 5000 });
          return row ? send(200, { note: publicNote(row) }) : send(404, { error: 'Note unavailable.' });
        }
        if ([...url.searchParams.keys()].some(param => param !== 'after') || url.searchParams.getAll('after').length > 1) throw failure(400);
        const after = url.searchParams.get('after');
        if (after !== null && !idPattern.test(after)) throw failure(400);
        const rows = await collection.find({ userId: user.uid, deleted: false, ...(after ? { id: { $gt: after } } : {}) })
          .sort({ id: 1 }).limit(51).maxTimeMS(5000).toArray();
        const notes = rows.slice(0, 50).map(publicNote);
        return send(200, { notes, nextCursor: rows.length > 50 ? notes.at(-1).id : null });
      }
      if (!id || !['PUT', 'DELETE'].includes(request.method)) throw failure(405);
      if (url.search) throw failure(400);
      try { requireTrustedOrigin(request.headers.origin, origin); } catch { throw failure(403); }
      const deleting = request.method === 'DELETE', body = await readBody(request), data = mutation(body, deleting);
      const fingerprint = digest([deleting, body.baseRevision, data]);
      const query = { _id: key(user.uid, id), userId: user.uid };
      const previous = await collection.findOne(query, { maxTimeMS: 5000 });
      // Retried same mutation is acknowledged, but cannot be reused for new content.
      if (previous?.lastMutation === body.mutationId) {
        if (previous.mutationHash !== fingerprint) throw failure(409);
        return send(200, deleting ? { id, revision: previous.revision, deleted: true } : { note: publicNote(previous) });
      }
      if ((!previous && body.baseRevision !== 0) || (previous && (previous.deleted || previous.revision !== body.baseRevision))) throw failure(409);
      if (!previous && deleting) throw failure(404);
      const stamp = now().toISOString();
      const patch = { ...(data || {}), revision: body.baseRevision + 1, updatedAt: stamp,
        deleted: deleting, lastMutation: body.mutationId, mutationHash: fingerprint };
      if (!previous) {
        const row = { ...query, id, createdAt: stamp, ...patch };
        try { await collection.insertOne(row); } catch (error) { if (error.code === 11000) throw failure(409); throw error; }
        return send(201, { note: publicNote(row) });
      }
      const changed = await collection.updateOne({ ...query, revision: body.baseRevision, deleted: false }, { $set: patch });
      if (changed.modifiedCount !== 1) throw failure(409);
      return send(200, deleting ? { id, revision: patch.revision, deleted: true } : { note: publicNote({ ...previous, ...patch }) });
    } catch (error) {
      const status = [400, 401, 403, 404, 405, 409, 413, 415].includes(error?.status) ? error.status : 503;
      send(status, { error: status === 409 ? 'Note changed. Reload before saving.' :
        status === 401 ? 'Authentication required.' : status === 503 ? 'Notebook unavailable.' : 'Notebook request rejected.' });
    }
  };
}
