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
  vm.runInNewContext(code, { exports, require: name => name.endsWith('pro-config.json') ? {default:require('../functions/pro-config.json')} : ({}), Date });
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
test("flashcard JSON exports never execute user content or open an HTML window", async () => {
  const source=fs.readFileSync('src/pages/Flashcards.tsx','utf8');
  const tree=ts.createSourceFile('Flashcards.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let exporter;const visit=node=>{if(ts.isVariableDeclaration(node) && node.name.getText(tree)==='download')exporter=node.initializer.getText(tree);ts.forEachChild(node,visit);};visit(tree);assert.ok(exporter);
  let blob,downloaded,revoked=false;const payload=[{front:'<script>alert(1)</script>',back:'<img src=x onerror=alert(2)>'}];
  const context={Blob,URL:{createObjectURL:value=>{blob=value;return 'blob:test';},revokeObjectURL:()=>{revoked=true;}},document:{createElement:()=>({set download(value){downloaded=value;},click(){}})},setTimeout:fn=>fn(),payload};
  vm.runInNewContext(ts.transpileModule(`(${exporter})(payload,'noviq-deck.json');`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  assert.equal(blob.type,'application/json');assert.deepEqual(JSON.parse(await blob.text()),payload);assert.equal(downloaded,'noviq-deck.json');assert.equal(revoked,true);
  assert.doesNotMatch(source,/document\.write|dangerouslySetInnerHTML/);
});
