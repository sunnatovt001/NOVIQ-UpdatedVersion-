const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const load=(path,dependencies={})=>{const result={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:result,require:name=>dependencies[name]||{},AbortController,setTimeout,clearTimeout,Error,JSON});return result;};
const {requestLocalAi}=load('src/lib/localAiClient.ts',{'./asyncRequest':load('src/lib/asyncRequest.ts')});
test('rejected cached token refreshes exactly once and stays out of request payload',async()=>{
 const refreshes=[],calls=[];
 const result=await requestLocalAi({getIdToken:async force=>(refreshes.push(force),force?'fresh-token':'old-token')},{contents:'A fixture question'},async(url,options)=>{calls.push({url,options});return {status:calls.length===1?401:200,ok:calls.length>1,json:async()=>calls.length===1?{error:'unauthenticated'}:{text:'Fixture response'}};});
 assert.deepEqual(refreshes,[false,true]);assert.equal(result.text,'Fixture response');assert.equal(calls[1].options.headers.Authorization,'Bearer fresh-token');assert.ok(!calls[1].options.body.includes('fresh-token'));assert.equal(calls[1].options.signal.aborted,true);
});
test('provider quota errors do not invoke another generation',async()=>{
 let calls=0;
 await assert.rejects(requestLocalAi({getIdToken:async()=> 'token'},{},async()=>{calls++;return {status:429,ok:false,json:async()=>({error:'AI_QUOTA_OR_RATE_LIMIT'})};}),/AI_QUOTA_OR_RATE_LIMIT/);assert.equal(calls,1);
});
test('authentication hang settles by deadline and cannot send a late AI request',async()=>{
 let resolve,calls=0;
 const pending=requestLocalAi({getIdToken:()=>new Promise(done=>resolve=done)},{},async()=>{calls++;},10);
 await assert.rejects(pending,/timed out/);resolve('late-token');await new Promise(done=>setTimeout(done,5));assert.equal(calls,0);
});
