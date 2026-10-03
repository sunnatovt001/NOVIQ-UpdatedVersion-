const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");

function harness(online = true) {
  let queue = [];
  const writes = [];
  let block = null;
  const store = {
    loadLocalData: () => JSON.parse(JSON.stringify(queue)),
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
    require: (name) =>
      name === "firebase/firestore"
        ? firebase
        : name === "react"
          ? { useEffect() {} }
          : name.endsWith("/firebase")
            ? { db: {} }
            : store,
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
