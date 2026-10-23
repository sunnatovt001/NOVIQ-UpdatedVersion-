const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
test('route definitions reuse loaded lazy types but retries replace rejected types', async () => {
  const React = { Component: class {}, lazy: load => ({ load }) };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/components/RoutePage.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  vm.runInNewContext(code, { exports, require: name => name === 'react' ? {default:React,...React} : {withDeadline:promise=>promise} });
  const loader = async () => ({ Page: () => null, Other: () => null });
  const first = exports.getCachedLazyPage(loader,'Page');
  assert.equal(exports.getCachedLazyPage(loader,'Page'),first);
  assert.notEqual(exports.getCachedLazyPage(loader,'Other'),first);
  assert.notEqual(exports.getCachedLazyPage(async()=>({}),'Page'),first);
  await first.load();
  const retry = exports.getCachedLazyPage(loader,'Page',true);
  assert.notEqual(retry,first);
  assert.equal(exports.getCachedLazyPage(loader,'Page'),retry);
  await assert.rejects(exports.getCachedLazyPage(async()=>({}),'Missing').load(),/export Missing is missing/);
});

test('page preparation deduplicates concurrent loads and caches component code', async () => {
  const React = { Component: class {}, lazy: load => ({ load }) };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/components/RoutePage.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  vm.runInNewContext(code, { exports, require: name => name === 'react' ? {default:React,...React} : {withDeadline:promise=>promise} });
  let resolve, calls=0;
  const module = new Promise(done => { resolve=done; });
  const loader = () => { calls++; return module; };
  const first=exports.prepareRoutePage(loader,'Page'), second=exports.prepareRoutePage(loader,'Page');
  assert.equal(first,second);
  assert.equal(calls,1);
  resolve({Page:()=>null});
  await Promise.all([first,second]);
  await exports.prepareRoutePage(loader,'Page');
  assert.equal(calls,1);
});

test('failed page preparation can retry and validates the requested export', async () => {
  const React = { Component: class {}, lazy: load => ({ load }) };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/components/RoutePage.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  vm.runInNewContext(code, { exports, require: name => name === 'react' ? {default:React,...React} : {withDeadline:promise=>promise} });
  let calls=0;
  const loader=async()=>{calls++;if(calls===1)throw new Error('Network failed');return {Page:()=>null};};
  await assert.rejects(exports.prepareRoutePage(loader,'Page'),/Network failed/);
  await exports.prepareRoutePage(loader,'Page');
  assert.equal(calls,2);
  await assert.rejects(exports.prepareRoutePage(loader,'Missing'),/export Missing is missing/);
});
