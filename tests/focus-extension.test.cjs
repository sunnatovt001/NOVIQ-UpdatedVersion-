const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 let focus=null,rules=[],listener,alarm,removed,updated,clock=1000,ruleUpdates=0;
 const chrome={storage:{session:{get:async()=>({focus}),set:async value=>{focus=value.focus;}}},declarativeNetRequest:{updateSessionRules:async value=>{rules=value.addRules;ruleUpdates++;}},tabs:{query:async()=>[{id:1},{id:2}],sendMessage:async()=>{},update:async()=>{},onRemoved:{addListener:fn=>removed=fn},onUpdated:{addListener:fn=>updated=fn}},windows:{update:async()=>{}},runtime:{onMessage:{addListener:fn=>listener=fn}},alarms:{create:()=>{},onAlarm:{addListener:fn=>alarm=fn}}};
 class Clock extends Date {static now(){return clock;}}
 vm.runInNewContext(fs.readFileSync('browser-extension/noviq-focus/background.js','utf8'),{chrome,Date:Clock,Promise,URL,Number,Error});
 const settle=()=>new Promise(resolve=>setImmediate(()=>setImmediate(resolve)));
 const sender=(id=1,url='https://noviqupdated.vercel.app/focus')=>({frameId:0,tab:{id,url,windowId:9}});
 const send=(message,from=sender())=>new Promise(resolve=>listener(message,from,resolve));
 return {send,sender,settle,get focus(){return focus;},get rules(){return rules;},get updates(){return ruleUpdates;},expire:()=>{clock+=50000;alarm({name:'noviq-focus-lease'});},close:id=>removed(id),navigate:(id,url)=>updated(id,{url})};
}
test('extension blocks only during an authorized NOVIQ session and uses session-scoped main-frame rules',async()=>{
 const f=fixture();await f.settle();assert.equal(f.rules.length,0);
 assert.equal((await f.send({type:'NOVIQ_FOCUS_SYNC',active:true})).active,true);
 assert.equal(f.rules.length,1);assert.equal(f.rules[0].action.type,'redirect');assert.equal(f.rules[0].condition.resourceTypes[0],'main_frame');assert.ok(f.rules[0].condition.excludedRequestDomains.includes('noviqupdated.vercel.app'));
 const before=f.updates;await f.send({type:'NOVIQ_FOCUS_SYNC',active:true});assert.equal(f.updates,before,'Heartbeats must not rewrite rules');
 await f.send({type:'NOVIQ_FOCUS_SYNC',active:false});assert.equal(f.focus,null);assert.equal(f.rules.length,0);
});
test('other origins, subframes and unrelated tabs cannot activate or release another session',async()=>{
 const f=fixture();await f.settle();
 assert.equal((await f.send({type:'NOVIQ_FOCUS_SYNC',active:true},f.sender(2,'https://example.org/focus'))).error,true);
 assert.equal((await f.send({type:'NOVIQ_FOCUS_SYNC',active:true},{...f.sender(),frameId:2})).error,true);
 await f.send({type:'NOVIQ_FOCUS_SYNC',active:true});
 assert.equal((await f.send({type:'NOVIQ_FOCUS_SYNC',active:true},f.sender(2))).owned,false);
 await f.send({type:'NOVIQ_FOCUS_SYNC',active:false},f.sender(2));assert.equal(f.focus.tabId,1);
});
test('closing or navigating away from the owner tab releases blocking; other tabs do not',async()=>{
 for(const method of ['close','navigate']){
  const f=fixture();await f.settle();await f.send({type:'NOVIQ_FOCUS_SYNC',active:true});
  if(method==='close')f.close(2);else f.navigate(2,'https://example.org');await f.settle();assert.ok(f.focus);
  if(method==='close')f.close(1);else f.navigate(1,'https://example.org');await f.settle();assert.equal(f.focus,null);assert.equal(f.rules.length,0);
 }
});
test('lost heartbeats fail open and navigating within NOVIQ can explicitly release the owner lock',async()=>{
 const f=fixture();await f.settle();await f.send({type:'NOVIQ_FOCUS_SYNC',active:true});f.expire();await f.settle();assert.equal(f.rules.length,0);
 await f.send({type:'NOVIQ_FOCUS_SYNC',active:true});await f.send({type:'NOVIQ_FOCUS_SYNC',active:false},f.sender(1,'https://noviqupdated.vercel.app/dashboard'));assert.equal(f.focus,null);
});
