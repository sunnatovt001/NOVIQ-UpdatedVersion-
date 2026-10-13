const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function applicationCatalog() {
  const source = fs.readFileSync('src/contexts/LocaleContext.tsx', 'utf8');
  const tree = ts.createSourceFile('LocaleContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const initializers = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['ENGLISH_COPY', 'TRANSLATIONS'].includes(node.name.getText(tree)))
      initializers[node.name.getText(tree)] = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(initializers.ENGLISH_COPY && initializers.TRANSLATIONS);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`const ENGLISH_COPY=${initializers.ENGLISH_COPY}; const TRANSLATIONS=${initializers.TRANSLATIONS}; exports.catalog=TRANSLATIONS;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports });
  return exports.catalog;
}
const catalog = applicationCatalog();
const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
for (const locale of ['en', 'uz', 'ru']) {
  test(`${locale} application translations retain complete keys and interpolation values`, () => {
    assert.deepEqual(Object.keys(catalog[locale]).sort(), Object.keys(catalog.en).sort());
    for (const [key, english] of Object.entries(catalog.en)) {
      const translated = catalog[locale][key];
      assert.equal(typeof translated, 'string', `${locale}/${key}`);
      assert.ok(translated.trim().length, `${locale}/${key} is blank`);
      assert.deepEqual(placeholders(translated), placeholders(english), `${locale}/${key} changes interpolation values`);
      assert.ok(!translated.includes('\uFFFD'), `${locale}/${key} contains replacement characters`);
    }
  });
}
