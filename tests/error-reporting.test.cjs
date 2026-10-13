const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function harness(audit=false){
  const calls=[],stored=new Map(),exports={};
  const auth={currentUser:{uid:'fixture'}},navigator={onLine:true};
  const store={loadLocalData:(key,fallback)=>stored.get(key)||fallback,trySaveLocalData:(key,value)=>{stored.set(key,value);return true;}};
  const code=ts.transpileModule(fs.readFileSync('src/lib/errorReporting.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,Date,Map,Number,String,navigator,window:{location:{hash:'#/planner',pathname:'/'}},require:name=>name==='./firebaseAuth'?{auth}:name==='./analytics'?{trackUserEvent:(...args)=>{calls.push(args);return Promise.resolve();}}:name==='./auditMode'?{isReadOnlyAudit:audit}:store});
  return {report:exports.reportClientError,calls,auth,navigator};
}
test('client monitoring excludes raw errors, prompts and keys; duplicates and quota are bounded',()=>{
  const h=harness();const secret='fixture-secret-never-transmitted';
  h.report('route',{code:'unavailable',message:secret,stack:secret});h.report('route',{code:'unavailable'});
  assert.equal(h.calls.length,1);assert.ok(!JSON.stringify(h.calls).includes(secret));assert.equal(h.calls[0][2],0);
  for(const letter of 'abcdefghijklm')h.report('metrics',{code:`failure-${letter}`});
  assert.equal(h.calls.length,10);
});
test('audit, signed-out and offline clients do not write monitoring events',()=>{
  const audit=harness(true);audit.report('route',new Error('fixture'));assert.equal(audit.calls.length,0);
  const h=harness();h.navigator.onLine=false;h.report('route',{});h.navigator.onLine=true;h.auth.currentUser=null;h.report('route',{});assert.equal(h.calls.length,0);
});
