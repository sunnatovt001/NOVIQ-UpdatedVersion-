const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/recordDate.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject, Date, Number });
const { recordDate } = exportsObject;

test("legacy chat strings and Firestore dates render the same timestamp", () => {
  const iso = "2026-01-02T03:04:05.000Z";
  for (const value of [iso, new Date(iso), Date.parse(iso), { toDate: () => new Date(iso) }, { seconds: Date.parse(iso) / 1000 }]) {
    assert.equal(recordDate(value).toISOString(), iso);
  }
});
test("missing or corrupt chat dates do not crash the page", () => {
  for (const value of [null, undefined, "invalid", {}, { toDate: () => { throw new Error("invalid"); } }]) {
    assert.equal(recordDate(value), undefined);
  }
});
