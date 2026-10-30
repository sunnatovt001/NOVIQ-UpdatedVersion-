const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
test('Mongo cache reads never contact the server and isolate account changes',async()=>{
  let calls=0;
  globalThis.__auditMongoAuth={currentUser:{uid:'a',getIdToken:async()=> 'token'}};
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({document:{path:'users/a',version:1,exists:true,data:{displayName:'Private A'}}})};};
  try{
    let source=fs.readFileSync('src/lib/mongoFirestore.mjs','utf8')
      .replace("import {auth} from './firebaseAuth';","const auth=globalThis.__auditMongoAuth;")
      .replace("'../../shared/mongoValues.mjs'",JSON.stringify(pathToFileURL(path.resolve('shared/mongoValues.mjs')).href))
      .replace("'./mongoPolling.mjs'",JSON.stringify(pathToFileURL(path.resolve('src/lib/mongoPolling.mjs')).href));
    const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const ref=api.doc(api.getFirestore({}),'users','a');
    await assert.rejects(api.getDocFromCache(ref),{code:'unavailable'});assert.equal(calls,0);
    await api.getDocFromServer(ref);assert.equal(calls,1);
    assert.equal((await api.getDocFromCache(ref)).metadata.fromCache,true);assert.equal(calls,1);
    globalThis.__auditMongoAuth.currentUser={uid:'b',getIdToken:async()=> 'other'};
    await assert.rejects(api.getDocFromCache(ref),{code:'unavailable'});assert.equal(calls,1);
  }finally{globalThis.fetch=original;delete globalThis.__auditMongoAuth;}
});
test('Mongo listeners back off when unchanged, pause offline/hidden and do not drop writes during in-flight reads',async()=>{
  const {createPollingLoop}=await import('../src/lib/mongoPolling.mjs');
  let active=true,calls=0,pending,delivery=0;const timers=new Map();let id=0;
  const loop=createPollingLoop({read:async()=>{calls++;if(pending)await pending;return {same:true};},deliver:()=>delivery++,onError:()=>{},isActive:()=>active,
    setTimer:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimer:key=>timers.delete(key)});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  loop.refresh();await settle();assert.equal(calls,1);assert.equal([...timers.values()][0].delay,5000);
  for(let n=0;n<5;n++){const [key,timer]=[...timers.entries()][0];timers.delete(key);timer.fn();await settle();}
  assert.equal([...timers.values()][0].delay,60000);
  active=false;loop.pause();loop.refresh();await settle();assert.equal(timers.size,0);
  const before=calls;let release;pending=new Promise(resolve=>release=resolve);active=true;
  loop.refresh();loop.refresh();release();await settle();assert.equal(calls,before+1);
  assert.equal([...timers.values()][0].delay,0);
  loop.stop();assert.equal(timers.size,0);assert.ok(delivery>0);
});
