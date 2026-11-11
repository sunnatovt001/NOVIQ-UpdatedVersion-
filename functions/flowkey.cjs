const FLOWKEY_ORIGIN = 'https://flowkey.uz';
async function createFlowkeyCheckout({secret, checkoutId, billingCycle, amount, fetchImpl=fetch}) {
 if(!secret || !Number.isSafeInteger(amount) || amount<=0 || amount>10000000) throw new Error('Invalid FlowKey checkout configuration');
 const response=await fetchImpl(FLOWKEY_ORIGIN+'/api/v1/checkout/sessions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret,'Idempotency-Key':checkoutId},body:JSON.stringify({title:'NOVIQ Pro · '+(billingCycle==='yearly'?'Yillik':'Oylik'),amount_minor:amount*100,currency:'UZS'}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('FlowKey checkout failed ('+response.status+')');
 const data=await response.json();const url=new URL(data.url);
 if(url.origin!==FLOWKEY_ORIGIN||!url.pathname.startsWith('/checkout/')||url.username||url.password)throw new Error('Invalid FlowKey checkout URL');
 if(data.livemode!==false)throw new Error('Unexpected FlowKey payment mode');
 return {checkoutUrl:url.href,providerSessionId:data.id,livemode:false};
}
module.exports={createFlowkeyCheckout};
