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
  assert.ok(calls[1].url.includes('gemini-3.5-flash-lite'));assert.ok(!calls[1].url.includes('server-secret'));
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

test('Tutor retries a transient rejection once on the same fast model, with minimal thinking',async()=>{
 const calls=[];let generations=0;
 const handler=localAi({apiKey:'server-secret',models:['obsolete-model'],logger:{warn(){}},fetchImpl:async(url,options)=>{
  calls.push({url,options});
  if(url.includes('accounts:lookup'))return {ok:true,json:async()=>({users:[{localId:'fixture'}]})};
  if(++generations===1)return {ok:false,status:503};
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Actual retry fixture response'}]}}]})};
 }});
 const result=await run(handler,request());assert.equal(result.statusCode,200);assert.equal(result.body.model,'gemini-3.5-flash-lite');assert.equal(calls.length,3);
 assert.equal(calls[1].url,calls[2].url);assert.equal(JSON.parse(calls[1].options.body).generationConfig.thinkingConfig.thinkingLevel,'minimal');
 assert.equal(calls[1].options.signal,calls[2].options.signal);
});
test('Tutor never repeats a timed-out generation or a successful response',async()=>{
 for(const timedOut of [false,true]) {
  let count=0;
  const handler=localAi({apiKey:'server-secret',logger:{warn(){}},fetchImpl:async url=>{
   if(url.includes('accounts:lookup'))return {ok:true,json:async()=>({users:[{localId:'fixture'}]})};
   count++;if(timedOut)throw Object.assign(new Error('Provider timeout'),{name:'TimeoutError'});
   return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'One actual response'}]}}]})};
  }});
  const result=await run(handler,request());assert.equal(count,1);assert.equal(result.statusCode,timedOut?503:200);
 }
});
test('non-Tutor AI keeps its configured model and structured response settings',async()=>{
 const calls=[];
 const handler=localAi({apiKey:'server-secret',models:['configured-notebook-model'],logger:{warn(){}},fetchImpl:async(url,options)=>{
  calls.push({url,options});return {ok:true,json:async()=>calls.length===1?{users:[{localId:'fixture'}]}:{candidates:[{content:{parts:[{text:'{"answer":"fixture"}'}]}}]}};
 }});
 const result=await run(handler,request({}, {feature:'notebook',contents:'Isolated source',config:{responseMimeType:'application/json'}}));
 assert.equal(result.statusCode,200);assert.ok(calls[1].url.includes('configured-notebook-model'));
 const settings=JSON.parse(calls[1].options.body).generationConfig;
 assert.equal(settings.responseMimeType,'application/json');assert.equal(settings.maxOutputTokens,8192);assert.equal(settings.thinkingConfig,undefined);
});

 test('Tutor forwards audio, images and only the allowlisted URL retrieval tool',async()=>{
  let provider;
  const handler=localAi({apiKey:'secret',logger:{warn(){}},fetchImpl:async(url,options)=>{
   if(url.includes('accounts:lookup'))return {ok:true,json:async()=>({users:[{localId:'fixture'}]})};
   provider=JSON.parse(options.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Source-backed answer'}]}}]})};
  }});
  const contents=[{role:'user',parts:[{inlineData:{mimeType:'audio/webm',data:'YXVkaW8='}},{inlineData:{mimeType:'image/png',data:'aW1hZ2U='}},{text:'Explain https://example.com'}]}];
  const response=await run(handler,request({}, {contents,config:{tools:[{urlContext:{}},{googleSearch:{}}]}}));
  assert.equal(response.statusCode,200);assert.deepEqual(provider.contents,contents);assert.deepEqual(provider.tools,[{urlContext:{}}]);
 });
 test('invalid Gemini key is a configuration failure, not a bad student question',async()=>{
  const handler=localAi({apiKey:'secret',logger:{warn(){}},fetchImpl:async url=>url.includes('accounts:lookup')?{ok:true,json:async()=>({users:[{localId:'fixture'}]})}:{ok:false,status:400,json:async()=>({error:{message:'API key not valid. secret'}})}});
  const result=await run(handler,request());assert.equal(result.body.error,'AI_KEY_OR_PERMISSION');assert.ok(!JSON.stringify(result.body).includes('secret'));
 });

test('local AI uses a newly saved key on the next request without a restart',async()=>{
 let key='',used=[];
 const handler=localAi({apiKey:'stale-key',getApiKey:()=>key,logger:{warn(){}},fetchImpl:async(url,options)=>{
  if(url.includes('accounts:lookup'))return {ok:true,json:async()=>({users:[{localId:'rotation-fixture'}]})};
  used.push(options.headers['x-goog-api-key']);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Verified answer'}]}}]})};
 }});
 assert.equal((await run(handler,request())).body.error,'MISSING_GEMINI_API_KEY');
 key='first-key';assert.equal((await run(handler,request())).statusCode,200);
 key='rotated-key';assert.equal((await run(handler,request())).statusCode,200);
 assert.deepEqual(used,['first-key','rotated-key']);
});

test('missing local key relays to the configured authenticated backend without copying secrets', async()=>{
 const calls=[];
 const handler=localAi({remoteRpcUrl:'https://project.example/api/rpc?name=generateAiResponse',logger:{warn(){}},fetchImpl:async(url,options)=>{
  calls.push({url,options});return {ok:true,status:200,json:async()=>({result:{text:'Real backend response'}})};
 }});
 const contents=[{role:'user',parts:[{fileData:{mimeType:'video/mp4',fileUri:'https://youtu.be/video'}},{text:'Read source'}]}];
 const response=await run(handler,request({}, {feature:'notebook',contents,config:{tools:[{urlContext:{}}]}}));
 assert.equal(response.statusCode,200);assert.equal(response.body.text,'Real backend response');
 assert.equal(calls.length,1);assert.equal(calls[0].options.headers.Authorization,'Bearer test-token');
 assert.deepEqual(JSON.parse(calls[0].options.body).data.contents,contents);
 assert.deepEqual(JSON.parse(calls[0].options.body).data.config.tools,[{urlContext:{}}]);
 assert.equal(calls[0].options.headers['x-goog-api-key'],undefined);
 assert.equal(calls[0].options.redirect,'error');
});

test('remote AI preserves safe quota errors and rejects unauthenticated or insecure relays',async()=>{
 let calls=0;
 const handler=localAi({remoteRpcUrl:'https://project.example/api/rpc?name=generateAiResponse',logger:{warn(){}},fetchImpl:async()=>{calls++;return {ok:false,status:429,json:async()=>({error:{message:'Internal private diagnostic',details:{reason:'AI_DAILY_LIMIT'}}})}}});
 assert.equal((await run(handler,request())).body.error,'AI_DAILY_LIMIT');
 assert.equal((await run(handler,request({headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json'}}))).statusCode,401);
 assert.equal(calls,1);
 assert.equal((await run(localAi({remoteRpcUrl:'http://insecure.example',logger:{warn(){}}}),request())).body.error,'AI_BACKEND_UNAVAILABLE');
});
