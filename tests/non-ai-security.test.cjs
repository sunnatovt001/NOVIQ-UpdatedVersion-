const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");
test("Pro badges require the same valid expiration as the server", () => {
  const source = fs.readFileSync("src/lib/subscription.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}), Date });
  const profile = (currentPeriodEnd, status = "active") => ({
    subscription: { plan: "pro", status, currentPeriodEnd },
  });
  assert.equal(exports.isPro(profile(undefined)), false);
  assert.equal(exports.isPro(profile("invalid")), false);
  assert.equal(
    exports.isPro(profile(new Date(Date.now() - 1000).toISOString())),
    false,
  );
  assert.equal(
    exports.isPro(profile(new Date(Date.now() + 60000).toISOString())),
    true,
  );
  assert.equal(
    exports.isPro(
      profile(new Date(Date.now() + 60000).toISOString(), "canceled"),
    ),
    false,
  );
});
test("flashcard exports escape malicious deck titles and isolate the printable window", () => {
  const source = fs.readFileSync("src/pages/Flashcards.tsx", "utf8");
  const tree = ts.createSourceFile(
    "Flashcards.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let exporter, escape;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === "handleExportCards"
    )
      exporter = node.initializer.getText(tree);
    if (ts.isFunctionDeclaration(node) && node.name?.text === "escapeHtml")
      escape = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(exporter && escape);
  let printed = "",
    downloaded = "",
    revoked = false,
    scheduled = false;
  const popup = {
    opener: {},
    document: { write: (html) => (printed = html), close() {} },
  };
  const context = {
    selectedDeck: {
      title: "</title><script>alert(1)</script><img src=x onerror=alert(1)>",
    },
    selectedCards: [
      { front: "<img src=x onerror=alert(2)>", back: "<script>bad()</script>" },
    ],
    window: {
      open: () => popup,
      setTimeout: (fn) => {
        scheduled = true;
        fn();
      },
    },
    document: {
      createElement: () => ({
        set download(value) {
          downloaded = value;
        },
        click() {},
      }),
    },
    Blob,
    URL: {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => {
        revoked = true;
      },
    },
  };
  vm.runInNewContext(ts.transpileModule(`${escape}\n(${exporter})();`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  assert.ok(printed.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.equal(/<script\b|<img\b/i.test(printed), false);
  assert.ok(printed.includes("default-src 'none'"));
  assert.equal(popup.opener, null);
  assert.ok(downloaded.endsWith("-cards.doc"));
  assert.equal(scheduled && revoked, true);
});
