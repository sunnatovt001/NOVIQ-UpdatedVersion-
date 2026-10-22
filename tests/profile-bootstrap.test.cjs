const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("src/contexts/AuthContext.tsx", "utf8");
const tree = ts.createSourceFile("AuthContext.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (!callback && ts.isCallExpression(node) && node.expression.getText(tree) === "runTransaction") {
    callback = node.arguments[1].getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(callback);
const initial = { uid: "account", xp: 0, onboarded: false };
const context = { exports: {}, userDocRef: {}, newProfile: initial, isReadOnlyAudit: false };
vm.runInNewContext(ts.transpileModule(`exports.bootstrap = ${callback};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);

test("profile discovered during bootstrap preserves progress and avoids writes", async () => {
  const existing = { uid: "account", xp: 500, streak: 7, onboarded: true };
  let writes = 0;
  const result = await context.exports.bootstrap({
    get: async () => ({ exists: () => true, data: () => existing }),
    set: () => { writes++; },
  });
  assert.equal(result, existing);
  assert.equal(writes, 0);
});
test("bootstrap creates an initial profile only when the real document is absent", async () => {
  const writes = [];
  const result = await context.exports.bootstrap({
    get: async () => ({ exists: () => false }),
    set: (ref, data) => writes.push(data),
  });
  assert.equal(result, initial);
  assert.deepEqual(writes, [initial]);
});

test("read-only audit cannot create a profile or overwrite existing progress", async () => {
  context.isReadOnlyAudit = true;
  let writes = 0;
  try {
    await assert.rejects(context.exports.bootstrap({ get: async () => ({ exists: () => false }), set: () => { writes++; } }), /audit/i);
    const existing = { uid: "account", xp: 500, streak: 7 };
    assert.equal(await context.exports.bootstrap({ get: async () => ({ exists: () => true, data: () => existing }), set: () => { writes++; } }), existing);
    assert.equal(writes, 0);
  } finally { context.isReadOnlyAudit = false; }
});
