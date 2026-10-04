const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const localAi = require('../server/local-ai.cjs');
const request = (patch = {}, body = { contents: 'A test question' }) => Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {url:'/__local-ai',method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json',authorization:'Bearer test-token'},socket:{remoteAddress:'127.0.0.1'}}, patch);
async function run(handler, req) {
  const res = {setHeader(){}, end(body){this.body=JSON.parse(body);}};
  await handler(req,res,()=>{res.next=true;}); return res;
}
test('local AI rejects cross-origin, non-local and unauthenticated requests before provider calls', async()=>{
  let calls=0;
  const handler=localAi({apiKey:'server-secret',fetchImpl:async()=>{calls++;}});
  assert.equal((await run(handler,request({headers:{origin:'https://evil.invalid',host:'localhost:3000'}}))).statusCode,403);
  assert.equal((await run(handler,request({socket:{remoteAddress:'192.168.1.1'}}))).statusCode,403);
  assert.equal((await run(handler,request({headers:{origin:'http://localhost:3000',host:'localhost:3000','content-type':'application/json'}}))).statusCode,401);
  assert.equal(calls,0);
});
test('local AI verifies account token, sends header-only server key and excludes thought content',async()=>{
  const calls=[];
  const handler=localAi({apiKey:'server-secret',firebaseApiKey:'public-config',fetchImpl:async(url,options)=>{
    calls.push({url,options});return {ok:true,json:async()=>calls.length===1?{users:[{localId:'isolated'}]}:{candidates:[{content:{parts:[{thought:true,text:'Internal thought'},{text:'Actual answer'}]}}]}};
  }});
  const result=await run(handler,request());
  assert.equal(result.statusCode,200);assert.equal(result.body.text,'Actual answer');
  assert.ok(calls[1].url.includes('gemini-3.8-flash'));assert.ok(!calls[1].url.includes('server-secret'));
  assert.equal(calls[1].options.headers['x-goog-api-key'],'server-secret');
  assert.ok(!JSON.stringify(result.body).includes('server-secret'));
});
test('local AI returns quota/auth errors without exposing provider body or key',async()=>{
  for(const status of [401,403,429,404]) {
    let count=0;
    const handler=localAi({apiKey:'server-secret',fetchImpl:async()=>++count===1?{ok:true,json:async()=>({users:[{localId:'test'}]})}:{ok:false,status,json:async()=>({error:{message:'server-secret'}})}});
    const result=await run(handler,request());assert.equal(result.statusCode,status);assert.ok(!JSON.stringify(result.body).includes('server-secret'));
  }
});
test('local AI rejects empty/malformed requests and bounds per-account request rate',async()=>{
  let providerCalls=0;
  const handler=localAi({apiKey:'server-secret',fetchImpl:async(url)=>url.includes('accounts:lookup')?{ok:true,json:async()=>({users:[{localId:'test'}]})}:(providerCalls++,{ok:true,json:async()=>({candidates:[{content:{parts:[{text:'OK'}]}}]})})});
  assert.equal((await run(handler,request({}, {contents:'   '}))).statusCode,400);
  for(let i=0;i<9;i++)assert.equal((await run(handler,request())).statusCode,200);
  assert.equal((await run(handler,request())).statusCode,429);assert.equal(providerCalls,9);
});
