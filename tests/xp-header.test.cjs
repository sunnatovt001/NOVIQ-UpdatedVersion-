const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');

test('header and badges share one XP listener, preserve confirmed values, and isolate accounts',async()=>{
 const exports={},subscriptions=[],cleanups=[],online=new Set();
 let account={user:{uid:'first'},profile:{xp:45}};
 const source=ts.transpileModule(fs.readFileSync('src/features/progression/useXpSummary.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,Map,Set,queueMicrotask,window:{addEventListener:(_name,fn)=>online.add(fn),removeEventListener:(_name,fn)=>online.delete(fn)},require:name=>{
  if(name==='react')return {useMemo:fn=>fn(),useSyncExternalStore:(subscribe,getSnapshot)=>{cleanups.push(subscribe(()=>{}));return getSnapshot();}};
  if(name==='@/src/lib/dataStore')return {doc:(_db,...parts)=>({uid:parts[1]}),onSnapshot:(ref,next,error)=>{const row={...ref,next,error,active:true};subscriptions.push(row);return ()=>{row.active=false;};}};
  if(name.includes('AuthContext'))return {useAuth:()=>account};
  if(name.includes('levels'))return {levelProgress:xp=>({xp})};
  return {};
 }});
 const read=exports.useXpSummary;
 assert.equal(read().info.xp,45);read();assert.equal(subscriptions.length,1);
 subscriptions[0].next({exists:()=>true,data:()=>({xp:1300,achievements:{A01:{xp:20}}})});
 assert.equal(read().info.xp,1300);subscriptions[0].error();
 assert.equal(read().info.xp,1300);assert.equal(read().status,'unavailable');
 cleanups.splice(0).forEach(stop=>stop());
 // React Strict Mode can resubscribe before the deferred cache cleanup.
 read();await Promise.resolve();read();
 assert.equal(subscriptions.filter(s=>s.uid==='first'&&s.active).length,1);
 account={user:{uid:'second'},profile:{xp:27}};
 assert.equal(read().info.xp,27);assert.equal(read().progress,null);
 assert.equal(subscriptions.filter(s=>s.uid==='second'&&s.active).length,1);
 online.forEach(connect=>connect());
 assert.equal(subscriptions.filter(s=>s.uid==='first'&&s.active).length,1);
 assert.equal(subscriptions.filter(s=>s.uid==='second'&&s.active).length,1);
 cleanups.splice(0).forEach(stop=>stop());await Promise.resolve();
 assert.equal(subscriptions.filter(s=>s.active).length,0);assert.equal(online.size,0);
});
