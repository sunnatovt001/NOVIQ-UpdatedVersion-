const test=require('node:test'),assert=require('node:assert/strict');
const {createFlowkeyCheckout}=require('./flowkey.cjs');
test('FlowKey uses server amount in minor units, bounded URL and test mode',async()=>{
 let sent;
 const result=await createFlowkeyCheckout({secret:'test-secret',checkoutId:'order-1',billingCycle:'monthly',amount:39000,fetchImpl:async(url,options)=>{sent={url,...options};return {ok:true,json:async()=>({id:'session',url:'https://flowkey.uz/checkout/session',livemode:false})};}});
 assert.equal(JSON.parse(sent.body).amount_minor,3900000);
 assert.equal(sent.headers['Idempotency-Key'],'order-1');
 assert.equal(result.livemode,false);
 assert.equal(result.providerSessionId,'session');
});
test('FlowKey rejects malicious redirects and unexpected live mode',async()=>{
 for(const value of [{url:'https://evil.example/checkout/s',livemode:false},{url:'https://flowkey.uz/checkout/s',livemode:true}]){
  await assert.rejects(createFlowkeyCheckout({secret:'s',checkoutId:'o',amount:39000,fetchImpl:async()=>({ok:true,json:async()=>value})}));
 }
});
