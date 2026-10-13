const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
test('failed source survives serialized restore and remote metadata acknowledgement', () => {
  const exports = {};
  const source = fs.readFileSync('src/features/notebook/notebookModel.ts', 'utf8').replace('import.meta.env.DEV', 'false');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: () => ({ isLocalId: () => false }), Date });
  const merge = exports.mergeLocalRemote;
  for (const status of ['failed', 'pending']) {
    const cached = JSON.parse(JSON.stringify([{ id: 'source', syncStatus: status, downloadURL: '', title: 'Local source' }]));
    const remote = [{ id: 'source', syncStatus: 'synced', title: 'Remote metadata' }, { id: 'other', syncStatus: 'synced' }];
    const result = merge(cached, remote);
    assert.equal(result.length, 2);
    assert.equal(result.find(item => item.id === 'source').syncStatus, status);
    assert.equal(result.find(item => item.id === 'source').title, 'Local source');
    assert.equal(cached[0].syncStatus, status);
    assert.equal(remote[0].syncStatus, 'synced');
  }
  const resolved = merge([{ id:'source', syncStatus:'synced', title:'Old' }], [{ id:'source', syncStatus:'synced', title:'Updated' }]);
  assert.equal(resolved[0].title, 'Updated');
});
