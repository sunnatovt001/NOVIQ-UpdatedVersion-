const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function transport(mode) {
  const calls = [], exports = {};
  const source = fs.readFileSync('src/lib/callable.ts', 'utf8').replaceAll('import.meta.env.MODE', JSON.stringify(mode));
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, URL, window: { location: { origin: 'https://noviq.example' } },
    require: () => ({
      httpsCallable: (...args) => { calls.push(['firebase', ...args]); return 'fixture'; },
      httpsCallableFromURL: (...args) => { calls.push(['vercel', ...args]); return 'production'; },
    }),
  });
  return { invoke: exports.httpsCallable, calls };
}
test('production calls the deployed same-origin backend and preserves SDK options', () => {
  const h = transport('production'), functions = {}, options = { timeout: 130000 };
  assert.equal(h.invoke(functions, 'generateAiResponse', options), 'production');
  assert.equal(h.calls[0][2], 'https://noviq.example/api/rpc?name=generateAiResponse');
  assert.equal(h.calls[0][3], options);
});
test('audit/test fixtures retain their isolated Firebase endpoint', () => {
  for (const mode of ['test', 'audit', 'development']) {
    const h = transport(mode);
    assert.equal(h.invoke({}, 'getMembershipStatus'), 'fixture');
    assert.equal(h.calls[0][0], 'firebase');
  }
});
