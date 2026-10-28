const {createHash} = require('node:crypto');
const normalize = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const key = code => createHash('sha256').update(code).digest('hex');
function quote(promo, code, cycle, prices, now = Date.now()) {
  if (!promo || promo.code !== code) return {reason:'invalid'};
  if (!promo.active) return {reason:'disabled'};
  if (now < Date.parse(promo.startsAt)) return {reason:'not_started'};
  if (now >= Date.parse(promo.endsAt)) return {reason:'expired'};
  if (!promo.cycles.includes(cycle)) return {reason:'wrong_plan'};
  const baseAmount = prices[cycle];
  const discountAmount = Math.min(baseAmount, promo.type === 'percent' ? Math.floor(baseAmount * promo.value / 100) : promo.value);
  return {code, baseAmount, discountAmount, amount:baseAmount-discountAmount, currency:'UZS', promo:{code,type:promo.type,value:promo.value}};
}
function register({exports,db,onCall,HttpsError,FieldValue,assertAdmin,PRICES,buildSubscription,nextBillingDate}) {
  const fail = reason => {throw new HttpsError('failed-precondition', reason, {reason});};
  const identity = request => {if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in first.'); return request.auth.uid;};
  const codeOf = value => {const code=normalize(value); if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(code)) fail('invalid'); return code;};
  const refs = (uid,code) => ({promo:db.doc(`promoCodes/${key(code)}`),usage:db.doc(`users/${uid}/promoUsages/${key(code)}`)});
  async function read(transaction,uid,code,cycle) {
    const r=refs(uid,code); const [p,u]=await Promise.all([transaction.get(r.promo),transaction.get(r.usage)]);
    const result=quote(p.data(),code,cycle,PRICES);
    if(result.reason) fail(result.reason);
    if(u.data()?.status==='used') fail('used');
    if(u.data()?.status==='pending') fail('pending');
    return {...result, refs:r};
  }
  async function consume(transaction,uid,checkout,checkoutId) {
    if(!checkout.promo) return;
    const r=refs(uid,checkout.promo.code), usage=await transaction.get(r.usage);
    if(usage.data()?.checkoutId!==checkoutId || usage.data()?.status!=='pending') fail('used');
    transaction.set(r.usage,{status:'used',checkoutId,usedAt:new Date().toISOString()});
    transaction.set(r.promo,{usedCount:FieldValue.increment(1)},{merge:true});
  }
  function subscription(prior,checkout,id) {
    const sub={...buildSubscription({billingCycle:checkout.billingCycle,provider:checkout.provider,checkoutId:id}),trialUsed:!!(prior.trialUsed||prior.trialStartedAt),autoRenew:false};
    if(prior.trialStartedAt) Object.assign(sub,{trialStartedAt:prior.trialStartedAt,trialEndsAt:prior.trialEndsAt});
    const end=prior.status!=='trialing'?Date.parse(prior.currentPeriodEnd||''):0;
    sub.currentPeriodEnd=nextBillingDate(checkout.billingCycle,new Date(Math.max(Date.now(),end||0))).toISOString(); return sub;
  }
  async function throttle(uid) {
    await db.runTransaction(async t=>{const r=db.doc(`users/${uid}/trusted/promoRate`),s=await t.get(r),v=s.data()||{},now=Date.now(),same=now-Number(v.startedAt||0)<60000;
      if(same && v.count>=20) throw new HttpsError('resource-exhausted','Too many attempts.');
      t.set(r,{startedAt:same?v.startedAt:now,count:same?v.count+1:1});});
  }
  exports.validatePromoCode=onCall(async request=>{
    const uid=identity(request),code=codeOf(request.data?.code),cycle=request.data?.billingCycle;
    if(!Object.hasOwn(PRICES,cycle)) fail('wrong_plan');
    // Commit rate accounting even when validation is rejected.
    await throttle(uid);
    return db.runTransaction(async t=>{const {refs:unused,...result}=await read(t,uid,code,cycle);return result;});
  });
  exports.adminCreatePromoCode=onCall(async request=>{
    await assertAdmin(request); const d=request.data||{},code=codeOf(d.code);
    if(!['percent','fixed'].includes(d.type)||!Number.isInteger(d.value)||d.value<1||(d.type==='percent'&&d.value>100)||!Number.isSafeInteger(d.value)||!Array.isArray(d.cycles)||!d.cycles.length||d.cycles.some(c=>!Object.hasOwn(PRICES,c))||!Number.isFinite(Date.parse(d.startsAt))||!Number.isFinite(Date.parse(d.endsAt))||Date.parse(d.endsAt)<=Date.parse(d.startsAt)) throw new HttpsError('invalid-argument','Invalid promotion settings.');
    const r=refs(request.auth.uid,code).promo;
    await db.runTransaction(async t=>{if((await t.get(r)).exists) throw new HttpsError('already-exists','Code already exists.');
      const now=new Date().toISOString();t.create(r,{code,type:d.type,value:d.value,cycles:[...new Set(d.cycles)],startsAt:new Date(d.startsAt).toISOString(),endsAt:new Date(d.endsAt).toISOString(),active:true,usedCount:0,createdAt:now,createdBy:request.auth.uid});
      t.create(r.collection('audit').doc(),{action:'create',at:now,by:request.auth.uid});});return {ok:true};
  });
  exports.adminListPromoCodes=onCall(async request=>{await assertAdmin(request);const after=String(request.data?.after||'');let q=db.collection('promoCodes').orderBy('code');if(after)q=q.startAfter(after);const s=await q.limit(50).get();return {items:s.docs.map(d=>d.data()),nextCursor:s.docs.length===50?s.docs.at(-1).data().code:null};});
  exports.adminDisablePromoCode=onCall(async request=>{await assertAdmin(request);const code=codeOf(request.data?.code),r=refs(request.auth.uid,code).promo;await db.runTransaction(async t=>{if(!(await t.get(r)).exists)fail('invalid');const now=new Date().toISOString();t.set(r,{active:false,disabledAt:now,disabledBy:request.auth.uid},{merge:true});t.create(r.collection('audit').doc(),{action:'disable',at:now,by:request.auth.uid});});return {ok:true};});
  return {read,consume,subscription,codeOf,refs,throttle};
}
module.exports={normalize,key,quote,register};
