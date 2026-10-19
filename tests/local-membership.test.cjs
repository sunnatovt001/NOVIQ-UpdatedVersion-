const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../server/local-membership.cjs');
const config={apiKey:'public-config-key',projectId:'project',firestoreDatabaseId:'database'};
function invoke(fetchImpl,{token='valid',origin='http://127.0.0.1:3000',body='{}'}={}){
 return new Promise(resolve=>{
  const req={url:'/__local-membership',method:'POST',headers:{origin,host:'127.0.0.1:3000','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from(body)}};
  const res={statusCode:200,setHeader(){},end(raw){resolve({status:this.statusCode,data:JSON.parse(raw)})}};
  handler({firebaseConfig:config,fetchImpl,now:()=>Date.parse('2026-10-18T12:00:00Z')})(req,res,()=>resolve({status:404}));
 });
}
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
const stringValue=value=>({stringValue:value});
function service(subscription,options={}){
 const calls=[];return {calls,fetch:async(url,init)=>{calls.push({url,method:init.method||'GET'});
  if(url.includes('accounts:lookup'))return response(options.authRejected?400:200,options.authRejected?{}:{users:[{localId:'verified-owner'}]});
  if(url.includes('/trusted/aiUsage'))return response(options.usageDenied?403:404,{});
  return response(options.profileDenied?403:200,{fields:{subscription:{mapValue:{fields:Object.fromEntries(Object.entries(subscription).map(([key,value])=>[key,stringValue(value)]))}}}});
 }};
}
test('localhost membership verifies token identity and protected server record; ignores client-provided owner/plan',async()=>{
 const s=service({plan:'pro',status:'active',currentPeriodEnd:'2026-11-18T12:00:00Z'});
 const result=await invoke(s.fetch,{body:JSON.stringify({uid:'someone-else',entitled:true})});
 assert.equal(result.status,200);assert.equal(result.data.entitled,true);assert.equal(result.data.state,'PRO_ACTIVE');
 assert.ok(s.calls.some(call=>call.url.includes('/users/verified-owner')));assert.ok(!s.calls.some(call=>call.url.includes('someone-else')));
 assert.deepEqual(s.calls.map(call=>call.method),['POST','GET','GET']);
});
test('localhost membership rejects missing auth, invalid auth, cross-origin and denied profile reads',async()=>{
 for(const [args,options,status]of [[{token:''},{},401],[{}, {authRejected:true},401],[{origin:'https://untrusted.example'},{},403],[{}, {profileDenied:true},403]]){
  assert.equal((await invoke(service({plan:'free',status:'active'},options).fetch,args)).status,status);
 }
});
test('Free and expired subscriptions remain locked, and unavailable usage is never fabricated as zero',async()=>{
 for(const sub of [{plan:'free',status:'active'},{plan:'pro',status:'active',currentPeriodEnd:'2026-10-17T12:00:00Z'}])assert.equal((await invoke(service(sub).fetch)).data.entitled,false);
 const result=await invoke(service({plan:'pro',status:'active',currentPeriodEnd:'2026-11-18T12:00:00Z'},{usageDenied:true}).fetch);
 assert.equal(result.data.entitled,true);assert.equal(result.data.usage,undefined);
});
