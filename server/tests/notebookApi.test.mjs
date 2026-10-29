import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createNotebookApi } from '../src/notebookApi.mjs';

function fixture() {
  const rows = new Map(); let calls = 0;
  const db = { collection(name) {
    assert.equal(name, 'notebook_notes');
    const matches = (row, query) => Object.entries(query).every(([k, v]) => v && typeof v === 'object' ? row[k] > v.$gt : row[k] === v);
    return {
      async findOne(query) { calls++; return structuredClone([...rows.values()].find(row => matches(row, query))); },
      find(query) { calls++; return { sort() { return this; }, limit(n) { this.n = n; return this; }, maxTimeMS() { return this; },
        async toArray() { return [...rows.values()].filter(row => matches(row, query)).sort((a,b) => a.id.localeCompare(b.id)).slice(0,this.n); } }; },
      async insertOne(row) { calls++; if (rows.has(row._id)) throw Object.assign(new Error(), { code: 11000 }); rows.set(row._id, structuredClone(row)); },
      async updateOne(query, update) { calls++; const row = [...rows.values()].find(item => matches(item, query));
        if (!row) return { modifiedCount: 0 }; Object.assign(row, structuredClone(update.$set)); return { modifiedCount: 1 }; },
    };
  } };
  const sessions = { resolve: async token => token === 'a'.repeat(64) ? { uid: 'owner' } : token === 'b'.repeat(64) ? { uid: 'other' } : null };
  return { rows, db, sessions, calls: () => calls };
}
async function serve(t) {
  const f = fixture();
  const server = http.createServer(createNotebookApi(f.db, f.sessions, { origin: 'https://app.invalid' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { ...f, async request(method, path = '/api/notebook/notes/n1', body, identity = 'a', origin = 'https://app.invalid') {
    return fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
      headers: { ...(identity ? { Cookie: `__Host-noviq_session=${identity.repeat(64)}` } : {}), Origin: origin, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } };
}
const draft = (baseRevision = 0, mutationId = 'mutation1') => ({ title: 'Note', content: 'Private content', tags: ['study'], baseRevision, mutationId });

test('notebook HTTP enforces ownership, origin, field allowlist and safe serialization', async t => {
  const f = await serve(t);
  assert.equal((await f.request('GET', undefined, undefined, '')).status, 401);
  assert.equal(f.calls(), 0);
  assert.equal((await f.request('PUT', undefined, draft(), 'a', 'https://evil.invalid')).status, 403);
  for (const injected of [{ userId: 'other' }, { xp: 900 }, { $set: {} }, { createdAt: 'forged' }]) {
    assert.equal((await f.request('PUT', undefined, { ...draft(), ...injected })).status, 400);
  }
  const created = await f.request('PUT', undefined, draft());
  assert.equal(created.status, 201);
  const note = (await created.json()).note;
  assert.equal(note.revision, 1);
  assert.equal(note.userId, undefined);
  assert.equal(note.mutationHash, undefined);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.equal((await f.request('GET', undefined, undefined, 'b')).status, 404);
  assert.equal((await f.request('DELETE', undefined, { baseRevision: 1, mutationId: 'delete1' }, 'b')).status, 409);
  assert.equal((await (await f.request('GET', '/api/notebook/notes', undefined, 'b')).json()).notes.length, 0);
  assert.equal((await f.request('GET', '/api/notebook/notes?userId=owner')).status, 400);
});

test('notebook retries are idempotent, stale/concurrent saves conflict and deletes retain recoverable content', async t => {
  const f = await serve(t);
  await f.request('PUT', undefined, draft());
  assert.equal((await f.request('PUT', undefined, draft())).status, 200);
  assert.equal((await f.request('PUT', undefined, { ...draft(), content: 'reused key with different content' })).status, 409);
  const responses = await Promise.all([f.request('PUT', undefined, draft(1, 'saveA')), f.request('PUT', undefined, draft(1, 'saveB'))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
  assert.equal((await f.request('PUT', undefined, draft(1, 'stale'))).status, 409);
  const deleted = { baseRevision: 2, mutationId: 'delete1' };
  assert.equal((await f.request('DELETE', undefined, deleted)).status, 200);
  assert.equal((await f.request('DELETE', undefined, deleted)).status, 200);
  assert.equal((await f.request('GET')).status, 404);
  assert.equal([...f.rows.values()][0].content, 'Private content');
  assert.equal([...f.rows.values()][0].deleted, true);
  assert.equal((await f.request('PUT', undefined, draft(3, 'resurrect'))).status, 409);
});

test('notebook lists bounded pages with validated cursors', async t => {
  const f = await serve(t);
  for (let i=0; i<52; i++) {
    const id = `n${String(i).padStart(3,'0')}`;
    f.rows.set(JSON.stringify(['owner', id]), { _id: JSON.stringify(['owner', id]), userId: 'owner', id, title: id, content: '', tags: [], revision: 1, deleted: false });
  }
  const first = await (await f.request('GET', '/api/notebook/notes')).json();
  assert.equal(first.notes.length, 50);
  assert.equal(first.nextCursor, 'n049');
  const second = await (await f.request('GET', `/api/notebook/notes?after=${first.nextCursor}`)).json();
  assert.equal(second.notes.length, 2);
  assert.equal(second.nextCursor, null);
  assert.equal((await f.request('GET','/api/notebook/notes?after=%24gt')).status,400);
});
