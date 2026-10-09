const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

function metricsHarness(server = false) {
  let metrics, effect, cleanup;
  const listeners = [], timers = new Map(); let timerId = 0;
  const react = { useState(initial) { if(typeof initial === 'number') return [initial,()=>{}]; metrics=initial; return [metrics, update=>{metrics=typeof update==='function'?update(metrics):update;}]; }, useCallback: fn=>fn, useMemo: fn=>fn(), useEffect: fn=>{effect=fn;} };
  const firestore = {
    collection: (...args)=>({path:args.join('/')}), doc:(...args)=>({path:args.join('/')}),
    query: target=>target, where:()=>{}, or:()=>{}, sum:()=>{}, limit:()=>{},
    onSnapshot(target,options,next,error) { const item={target,next,error,stopped:false}; listeners.push(item); return ()=>{item.stopped=true;}; },
    getCountFromServer:async()=>({data:()=>({count:0})}), getDocsFromServer:async()=>({docs:[]}),getAggregateFromServer:async()=>({data:()=>({xp:0})}),
  };
  const exports={};
  const cloud={serverMetricsEnabled:server,getCloudMetrics:async()=>({focusMinutes:3,tasksDone:0,notesCreated:0,sourcesUploaded:0,notebookMessages:0,tutorMessages:0,decksCreated:300,flashcardsCreated:25000,dueCards:9000,reviewedCards:7000,asOf:Date.now()})};
  const code=ts.transpileModule(fs.readFileSync('src/lib/useUserActivityMetrics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,console:{error(){}},Date,Number,Map,Set,navigator:{onLine:true},document:{hidden:false,addEventListener(){},removeEventListener(){}},window:{setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){},addEventListener(){},removeEventListener(){}},require:name=> name==='react'?react:name==='firebase/firestore'?firestore:name.endsWith('/firebase')?{db:'db'}:name.includes('cloudMetrics')?cloud:name.includes('errorReporting')?{reportClientError(){}}:name.includes('asyncRequest')?{withDeadline:async p=>p}:name.includes('progress')?{calculateLevel:()=>1,getCurrentStreak:()=>0}:{summarizeCards:()=>({due:0,reviewed:0}),isMeaningfulSession:()=>true}});
  exports.useUserActivityMetrics('test'); cleanup=effect();
  const snap=(cache=false)=>({exists:()=>server,data:()=>server?{ready:true,version:1}:undefined,docs:[],metadata:{fromCache:cache}});
  return {get state(){return metrics;},listeners,timers,firestore,cloud,snap,cleanup};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('server metrics handles large decks and cards without client record downloads',async()=>{
  const h=metricsHarness(true);let reads=0;
  h.firestore.getDocsFromServer=async()=>{reads++;throw new Error('Client full-history read prohibited');};
  for(const l of h.listeners)l.next(h.snap());await flush();
  assert.equal(h.state.error,null);assert.equal(h.state.flashcardsCreated,25000);assert.equal(h.state.dueCards,9000);assert.equal(reads,0);h.cleanup();
});
test('server aggregation outage settles error and readiness retry recovers',async()=>{
  const h=metricsHarness(true);const success=h.cloud.getCloudMetrics;
  h.cloud.getCloudMetrics=async()=>{throw new Error('unavailable');};
  for(const l of h.listeners)l.next(h.snap());await flush();
  assert.equal(h.state.loading,false);assert.match(h.state.error,/temporarily unavailable/);
  h.cloud.getCloudMetrics=success;h.listeners[3].next(h.snap());await flush();
  assert.equal(h.state.error,null);assert.equal(h.state.dueCards,9000);h.cleanup();
});
test('verified focus history uses server sums without downloading all session records',async()=>{
  const h=metricsHarness(); let counts=0, records=0;
  h.firestore.getCountFromServer=async()=>({data:()=>({count:++counts<=2?5000:0})});
  h.firestore.getAggregateFromServer=async()=>({data:()=>({seconds:180,xp:0})});
  h.firestore.getDocsFromServer=async()=>{records++;return {docs:[]};};
  for(const l of h.listeners) l.next(h.snap()); await flush();
  assert.equal(h.state.error,null); assert.equal(h.state.focusMinutes,3); assert.equal(records,0); h.cleanup();
});
test('large legacy collections fail explicitly instead of publishing truncated totals',async()=>{
  const h=metricsHarness();
  let counts=0;
  h.firestore.getCountFromServer=async()=>({data:()=>({count:++counts===1?2001:0})});
  h.firestore.getDocsFromServer=async()=>({docs:Array.from({length:2001},()=>({data:()=>({duration:60,category:'focus'})}))});
  for(const l of h.listeners) l.next(h.snap()); await flush();
  assert.equal(h.state.loading,false); assert.match(h.state.error,/temporarily unavailable/);
  assert.equal(h.state.focusMinutes,0); h.cleanup();
});

test('silent Firestore listeners settle to an actionable error within the UI deadline',()=>{
  const h=metricsHarness(); assert.equal(h.state.loading,true);
  for(const timer of h.timers.values()) timer();
  assert.equal(h.state.loading,false); assert.match(h.state.error,/temporarily unavailable/);
  h.cleanup(); assert.ok(h.listeners.every(l=>l.stopped)); assert.equal(h.timers.size,0);
});
test('cache-only empty snapshots cannot prove zero; server snapshots allow real zero and recovery',async()=>{
  const h=metricsHarness(); for(const l of h.listeners) l.next(h.snap(true));
  assert.equal(h.state.loading,true);
  for(const timer of h.timers.values()) timer();
  for(const l of h.listeners) l.next(h.snap()); await flush();
  assert.equal(h.state.loading,false); assert.equal(h.state.error,null); assert.equal(h.state.dueCards,0); h.cleanup();
});
test('aggregation unavailable clears loading and a subsequent success cannot hide a failed planner listener',async()=>{
  const h=metricsHarness(); h.firestore.getCountFromServer=async()=>{throw Object.assign(new Error('unavailable'),{code:'unavailable'});};
  for(const l of h.listeners) l.next(h.snap()); await flush();
  assert.equal(h.state.loading,false); assert.match(h.state.error,/temporarily unavailable/);
  h.listeners[2].error(new Error('planner permission denied'));
  h.firestore.getCountFromServer=async()=>({data:()=>({count:0})});
  h.listeners[3].next(h.snap()); await flush(); assert.match(h.state.error,/temporarily unavailable/);
  h.listeners[2].next(h.snap()); assert.equal(h.state.error,null); h.cleanup();
});
