const test = require('node:test');
const assert = require('node:assert/strict');
const createProvider = require('./geminiProvider');

test('Planner recovers from explicit schema rejection without another usage charge', async () => {
  const calls = [];
  const provider = createProvider({apiKey:'isolated-key', HttpsError:Error, fetchImpl:async (_, options) => {
    calls.push(JSON.parse(options.body));
    return calls.length === 1
      ? {ok:false,status:400,json:async()=>({error:{message:'Response schema has too many states'}})}
      : {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'{"summary":"Ready","tasks":[]}'}]}}]})};
  }});
  const config = {responseMimeType:'application/json',responseSchema:{type:'OBJECT'},systemInstruction:'Preserve existing tasks'};
  const text = await provider.callGeminiRest({model:'fixture',feature:'planner',contents:'Private study context',config});
  assert.equal(JSON.parse(text).summary,'Ready');
  assert.equal(calls.length,2);
  assert.ok(calls[0].generationConfig.responseSchema);
  assert.equal(calls[1].generationConfig.responseSchema,undefined);
  assert.equal(calls[1].generationConfig.responseMimeType,'application/json');
  assert.deepEqual(calls[1].contents,calls[0].contents);
  assert.deepEqual(calls[1].systemInstruction,calls[0].systemInstruction);
  assert.ok(config.responseSchema,'Caller config is preserved');
});

test('Planner never retries unrelated rejection, quota, credentials or uncertain timeout', async () => {
  for (const [status,message] of [[400,'Invalid contents'],[403,'Permission denied'],[429,'Quota exceeded'],[503,'Unavailable'],[0,'Operation timed out']]) {
    let calls=0;
    const provider=createProvider({apiKey:'isolated-key',HttpsError:Error,fetchImpl:async()=>{
      calls++;
      if (!status) throw new Error(message);
      return {ok:false,status,json:async()=>({error:{message}})};
    }});
    await assert.rejects(provider.callGeminiRest({model:'fixture',feature:'planner',contents:'Context',config:{responseSchema:{type:'OBJECT'}}}));
    assert.equal(calls,1);
  }
});
