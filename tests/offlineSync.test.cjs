const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");

function harness(online = true, audit = false) {
  let queue = [];
  const writes = [];
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
    require: (name) =>
      name === "firebase/firestore"
        ? firebase
        : name === "react"
          ? { useEffect() {} }
          : name.endsWith("/firebase")
            ? { db: {} }
            : name === "./auditMode" ? { isReadOnlyAudit: audit } : store,
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
test("corrupt local queue is preserved and never replaced or sent to Firebase", async () => {
  const h = harness();
  h.corrupt({ invalid: "existing data" });
  await assert.rejects(h.api.writeDocWithQueue(operation({title:"new"})), /Local changes could not be read/);
  assert.equal(h.writes.length, 0);
  assert.equal(h.queue().invalid, "existing data");
});
test("pending backups isolate accounts and imports preserve newer pending revisions", async () => {
  const h = harness(false);
  await h.api.writeDocWithQueue(operation({title:"old domain"}));
  await h.api.writeDocWithQueue({userId:"u2",path:["users","u2","notes","private"],data:{title:"other account"}});
  const backup = h.api.exportPendingChanges("u1");
  assert.equal(JSON.parse(backup).operations.length,1);
  const destination = harness(false);
  assert.equal(destination.api.importPendingChanges("u1",backup),1);
  assert.equal(destination.queue()[0].data.title,"old domain");
  await destination.api.writeDocWithQueue(operation({title:"new domain edit"}));
  assert.equal(destination.api.importPendingChanges("u1",backup),0);
  assert.equal(destination.queue()[0].data.title,"new domain edit");
  assert.throws(()=>destination.api.importPendingChanges("u2",backup),/same account/);
  assert.equal(destination.writes.length,0);
});
test("backup import rejects another user's path and does not partially import", () => {
  const h = harness(false);
  const item = {userId:"u1",id:"set:users/u2/notes/private",kind:"set",path:["users","u2","notes","private"],status:"pending"};
  assert.throws(()=>h.api.importPendingChanges("u1",JSON.stringify({format:"noviq-pending-changes",version:1,userId:"u1",operations:[item]})),/same account/);
  assert.equal(h.queue().length,0);
});
test("storage quota failure prevents remote writes and false saved state", async () => {
  const h = harness(); h.storageFailure();
  await assert.rejects(h.api.writeDocWithQueue(operation({title:"new"})), /could not be saved/);
  assert.equal(h.writes.length, 0);
});
test("a stalled write settles pending while retaining ordering and eventual recovery", async () => {
  const h = harness(); const resume = h.pause();
  const first = h.api.writeDocWithQueue(operation({title:"first"}));
  h.expire(); assert.equal(await first, "pending");
  const second = h.api.writeDocWithQueue(operation({title:"latest"}));
  h.expire(); assert.equal(await second, "pending");
  assert.equal(h.writes.length, 0);
  resume(); await h.api.flushOfflineSyncQueue("u1");
  assert.equal(h.queue()[0].status, "synced");
  assert.equal(h.writes.at(-1).data.title, "latest");
});
test("read-only audit preserves pending changes and never sends or queues new writes", async () => {
  const h = harness(true, true);
  h.api.queueFirestoreOperation(operation({ title: "existing pending edit" }));
  const before = JSON.stringify(h.queue());
  await h.api.flushOfflineSyncQueue("u1");
  await assert.rejects(h.api.writeDocWithQueue(operation({ title: "blocked" })), /audit/i);
  assert.equal(h.writes.length, 0);
  assert.equal(JSON.stringify(h.queue()), before);
});
test("offline changes are saved before any network request", async () => {
  const h = harness(false);
  assert.equal(
    await h.api.writeDocWithQueue(operation({ title: "offline" })),
    "pending",
  );
  assert.equal(h.writes.length, 0);
  assert.equal(h.queue()[0].data.title, "offline");
  h.navigator.onLine = true;
  await h.api.flushOfflineSyncQueue("u1");
  assert.equal(h.queue()[0].status, "synced");
});
test("new revisions queued during a flush are not marked synced prematurely", async () => {
  const h = harness();
  const resume = h.pause();
  const first = h.api.writeDocWithQueue(operation({ title: "first" }));
  const second = h.api.writeDocWithQueue(operation({ body: "latest" }));
  assert.equal(h.queue()[0].status, "pending");
  resume();
  await Promise.all([first, second]);
  assert.equal(h.queue()[0].status, "synced");
  assert.equal(h.writes.at(-1).data.title, "first");
  assert.equal(h.writes.at(-1).data.body, "latest");
});
test("sync respects account isolation and does not add forbidden profile metadata", async () => {
  const h = harness(false);
  await h.api.writeDocWithQueue({
    userId: "u1",
    path: ["users", "u1"],
    kind: "update",
    data: { onboarded: true },
  });
  await h.api.writeDocWithQueue({
    userId: "u2",
    path: ["users", "u2"],
    kind: "update",
    data: { onboarded: true },
  });
  h.navigator.onLine = true;
  await h.api.flushOfflineSyncQueue("u1");
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].data.syncStatus, undefined);
  assert.equal(
    h.queue().find((entry) => entry.userId === "u2").status,
    "pending",
  );
});
