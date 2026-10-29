const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");

function harness(online = true, audit = false) {
  let queue = [];
  const writes = [];
  const backendLoads = [];
  let backendError = null;
  let block = null;
  const timers = new Map(); let timerId = 0;
  const store = {
    loadLocalDataStrict: () => JSON.parse(JSON.stringify(queue)),
    saveLocalData: (_, value) => {
      queue = JSON.parse(JSON.stringify(value));
    },
  };
  const write = async (path, data) => {
    if (block) await block;
    writes.push({ path, data });
  };
  const firebase = {
    doc: (_, ...path) => path.join("/"),
    setDoc: write,
    updateDoc: write,
    deleteDoc: (path) => write(path, null),
  };
  const module = { exports: {} };
  const navigator = { onLine: online };
  const context = {
    module,
    exports: module.exports,
    navigator,
    crypto,
    console,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
    require: (name) => {
      if (name === "@/src/lib/dataStore" || name.endsWith("/firebase")) {
        backendLoads.push(name);
        if (backendError) throw backendError;
      }
      return name === "@/src/lib/dataStore"
        ? firebase
        : name === "react"
          ? { useEffect() {} }
          : name.endsWith("/firebase")
            ? { db: {} }
            : name === "./auditMode" ? { isReadOnlyAudit: audit } : store;
    },
  };
  const code = ts.transpileModule(
    fs.readFileSync(`${__dirname}/../src/lib/offlineSync.ts`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(code, context);
  return {
    api: module.exports,
    writes,
    backendLoads,
    failBackend: () => { backendError = new Error("Backend unavailable"); },
    recoverBackend: () => { backendError = null; },
    navigator,
    queue: () => queue,
    corrupt: value => { queue = value; },
    storageFailure: () => { store.saveLocalData = () => { throw new Error('Quota exceeded'); }; },
    expire: () => { for (const fn of timers.values()) fn(); },
    pause: () => {
      let resolve;
      block = new Promise((done) => {
        resolve = done;
      });
      return () => {
        block = null;
        resolve();
      };
    },
  };
}
const operation = (data) => ({
  userId: "u1",
  path: ["users", "u1", "notes", "n1"],
  data,
});

const legacy = (h, data, uid = 'u1') => h.api.queueFirestoreOperation({
  ...operation(data), userId: uid, path: ['users', uid, 'notes', 'n1'], kind: 'set', status: 'pending', attempts: 0,
});

test('new saves are acknowledged by the server without creating a local pending entry', async () => {
  const h = harness();
  assert.equal(await h.api.writeDocWithQueue(operation({ title: 'server save' })), 'synced');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].data.title, 'server save');
  assert.equal(h.queue().length, 0);
});

test('offline saves reject and never claim a device-only success', async () => {
  const h = harness(false);
  await assert.rejects(h.api.writeDocWithQueue(operation({ title: 'unsaved' })), /not been saved to the server/);
  assert.equal(h.queue().length, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(h.backendLoads.length, 0);
});

test('server errors reject without creating a local fallback', async () => {
  const h = harness(); h.failBackend();
  await assert.rejects(h.api.writeDocWithQueue(operation({ title: 'unsaved' })), /Backend unavailable/);
  assert.equal(h.queue().length, 0);
  assert.equal(h.writes.length, 0);
});

test('legacy offline edits are preserved and automatically recover when the server is available', async () => {
  const h = harness(false); legacy(h, { title: 'old draft' });
  h.failBackend(); h.navigator.onLine = true;
  await h.api.flushOfflineSyncQueue('u1');
  assert.equal(h.queue()[0].status, 'failed');
  assert.equal(h.queue()[0].data.title, 'old draft');
  h.recoverBackend(); await h.api.flushOfflineSyncQueue('u1');
  assert.equal(h.queue()[0].status, 'synced');
  assert.equal(h.writes.length, 1);
});

test('a legacy edit cannot replay after a newer server save', async () => {
  const h = harness(); legacy(h, { title: 'old draft' });
  await h.api.writeDocWithQueue(operation({ title: 'new server title' }));
  await h.api.flushOfflineSyncQueue('u1');
  assert.equal(h.writes.at(-1).data.title, 'new server title');
  assert.equal(h.writes.length, 2);
});

test('corrupt legacy storage does not block a new server save and remains preserved', async () => {
  const h = harness(); h.corrupt({ invalid: 'old data' });
  assert.equal(await h.api.writeDocWithQueue(operation({ title: 'server' })), 'synced');
  assert.equal(h.writes.length, 1);
  assert.equal(h.queue().invalid, 'old data');
});

test('browser storage quota does not prevent a server save', async () => {
  const h = harness(); h.storageFailure();
  assert.equal(await h.api.writeDocWithQueue(operation({ title: 'server' })), 'synced');
  assert.equal(h.writes.length, 1);
});

test('a stalled write rejects its UI deadline while preserving server ordering', async () => {
  const h = harness(); const resume = h.pause();
  const first = h.api.writeDocWithQueue(operation({ title: 'first' }));
  const firstRejected = assert.rejects(first, /not confirmed/); h.expire(); await firstRejected;
  const second = h.api.writeDocWithQueue(operation({ title: 'latest' }));
  const secondRejected = assert.rejects(second, /not confirmed/); h.expire(); await secondRejected;
  assert.equal(h.writes.length, 0); assert.equal(h.queue().length, 0);
  resume(); await h.api.flushOfflineSyncQueue('u1');
  assert.equal(h.writes.at(-1).data.title, 'latest');
});

test('concurrent saves remain ordered without device queue entries', async () => {
  const h = harness(); const resume = h.pause();
  const first = h.api.writeDocWithQueue(operation({ title: 'first' }));
  const second = h.api.writeDocWithQueue(operation({ body: 'latest' }));
  resume(); await Promise.all([first, second]);
  assert.equal(h.writes[0].data.title, 'first');
  assert.equal(h.writes[1].data.body, 'latest');
  assert.equal(h.queue().length, 0);
});

test('legacy recovery remains isolated to the signed-in account', async () => {
  const h = harness(false); legacy(h, { title: 'one' }); legacy(h, { title: 'two' }, 'u2');
  h.navigator.onLine = true; await h.api.flushOfflineSyncQueue('u1');
  assert.equal(h.writes.length, 1);
  assert.equal(h.queue().find(q => q.userId === 'u2').status, 'pending');
});

test('profile writes do not gain forbidden sync metadata', async () => {
  const h = harness();
  await h.api.writeDocWithQueue({ userId: 'u1', path: ['users', 'u1'], kind: 'update', data: { photoURL: '/avatars/pro-1.png' } });
  assert.equal(h.writes[0].data.syncStatus, undefined);
});

test('read-only audit never sends or queues new writes', async () => {
  const h = harness(true, true); legacy(h, { title: 'existing' });
  const before = JSON.stringify(h.queue());
  await h.api.flushOfflineSyncQueue('u1');
  await assert.rejects(h.api.writeDocWithQueue(operation({ title: 'blocked' })), /audit/i);
  assert.equal(h.writes.length, 0); assert.equal(JSON.stringify(h.queue()), before);
});

test('legacy backups isolate accounts and preserve newer pending revisions', () => {
  const h = harness(false); legacy(h, { title: 'old domain' }); legacy(h, { title: 'private' }, 'u2');
  const backup = h.api.exportPendingChanges('u1');
  assert.equal(JSON.parse(backup).operations.length, 1);
  const destination = harness(false);
  assert.equal(destination.api.importPendingChanges('u1', backup), 1);
  legacy(destination, { title: 'newer old draft' });
  assert.equal(destination.api.importPendingChanges('u1', backup), 0);
  assert.equal(destination.queue()[0].data.title, 'newer old draft');
  assert.throws(() => destination.api.importPendingChanges('u2', backup), /same account/);
});

test('legacy backup import rejects another account path', () => {
  const h = harness(false);
  const item = { userId: 'u1', id: 'set:users/u2/notes/private', kind: 'set', path: ['users','u2','notes','private'], status: 'pending' };
  assert.throws(() => h.api.importPendingChanges('u1', JSON.stringify({ format: 'noviq-pending-changes', version: 1, userId: 'u1', operations: [item] })), /same account/);
  assert.equal(h.queue().length, 0);
});
