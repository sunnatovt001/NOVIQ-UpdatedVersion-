const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("src/lib/useUserActivityMetrics.ts", "utf8");
const tree = ts.createSourceFile("metrics.ts", source, ts.ScriptTarget.Latest, true);
let fallbackSource;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "withIndexFallback") {
    fallbackSource = node.initializer.getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(fallbackSource);
const context = {};
vm.runInNewContext(ts.transpileModule(`const fallback = ${fallbackSource};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText + "globalThis.runFallback = fallback;", context);

test("missing statistics indexes use actual fallback values, including zero", async () => {
  const indexedRead = async () => { throw { code: "failed-precondition" }; };
  assert.equal(await context.runFallback(indexedRead, async () => 7), 7);
  assert.equal(await context.runFallback(indexedRead, async () => 0), 0);
});

test("statistics fallback does not bypass permissions or mask network failures", async () => {
  for (const code of ["permission-denied", "unavailable"]) {
    let fallbackCalled = false;
    await assert.rejects(context.runFallback(
      async () => { throw Object.assign(new Error(code), { code }); },
      async () => { fallbackCalled = true; return 0; },
    ), { code });
    assert.equal(fallbackCalled, false);
  }
});
