const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {membership,trialSubscription}=require('./membership');
const code=fs.readFileSync(__dirname+'/security.test.js','utf8');
const support=code.slice(code.indexOf('function harness('),code.indexOf('const auth ='));
const env={require,fs,vm,crypto,__dirname,Buffer,Date,Intl,URL,AbortSignal};
vm.runInNewContext(support+';this.harness=harness;',env);
const harness=env.harness,auth={uid:'u1',token:{}};
test('all membership states have explicit expiration and no client trial reset',()=>{
 const now=Date.now(),future=new Date(now+10000).toISOString(),past=new Date(now-1).toISOString();
 assert.equal(membership().state,'FREE');
 assert.equal(membership({plan:'pro',status:'active',currentPeriodEnd:future},now).state,'PRO_ACTIVE');
 assert.equal(membership({plan:'pro',status:'active',currentPeriodEnd:future,cancelAtPeriodEnd:true},now).state,'PRO_CANCEL_SCHEDULED');
 assert.equal(membership({plan:'pro',status:'trialing',trialEndsAt:past,currentPeriodEnd:future},now).entitled,false);
 assert.equal(membership({plan:'pro',status:'past_due',currentPeriodEnd:future},now).state,'PRO_PAST_DUE');
 assert.equal(membership({plan:'pro',status:'active',currentPeriodEnd:past},now).state,'PRO_EXPIRED');
 const trial=trialSubscription({plan:'free',status:'active'},now);assert.equal(Date.parse(trial.trialEndsAt)-now,7*86400000);assert.equal(trial.autoRenew,false);assert.throws(()=>trialSubscription({...trial,status:'expired'},now+8*86400000));
});
test('trial activation is explicit, atomic and idempotent across devices',async()=>{
 const h=harness();await assert.rejects(h.functions.startProTrial({data:{acceptTerms:true}}),{code:'unauthenticated'});await assert.rejects(h.functions.startProTrial({auth,data:{}}),{code:'invalid-argument'});
 const [a,b]=await Promise.all([h.functions.startProTrial({auth,data:{acceptTerms:true}}),h.functions.startProTrial({auth,data:{acceptTerms:true}})]);
 assert.equal(a.trialStartedAt,b.trialStartedAt);assert.equal(a.currentPeriodEnd,b.currentPeriodEnd);assert.equal(a.entitled,true);assert.equal([...h.records.keys()].filter(p=>p.includes('/proEvents/')).length,1);
 const saved=h.records.get('users/u1').subscription;h.records.set('users/u1',{...h.records.get('users/u1'),subscription:{...saved,status:'expired',trialEndsAt:new Date(0).toISOString(),currentPeriodEnd:new Date(0).toISOString()}});
 await assert.rejects(h.functions.startProTrial({auth,data:{acceptTerms:true}}),{code:'already-exists'});assert.equal((await h.functions.getMembershipStatus({auth})).entitled,false);
});
test('premium AI requires current server entitlement and uses atomic finite quotas',async()=>{
 let providerCalls=0;const h=harness({}, {fetch:async()=>{providerCalls++;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Real provider fixture'}]}}]})};}});
 const request={auth,data:{feature:'intelligence',premiumMode:'coach',contents:'Explain this student answer'}};
 await assert.rejects(h.functions.generateAiResponse(request),{code:'permission-denied'});assert.equal(providerCalls,0);
 await h.functions.startProTrial({auth,data:{acceptTerms:true}});await h.functions.generateAiResponse(request);assert.equal(providerCalls,1);
 const day=require('./policy').dayKey();h.records.set('users/u1/trusted/aiUsage',{dayKey:day,counts:{intelligence:30},total:30});await assert.rejects(h.functions.generateAiResponse(request),{code:'resource-exhausted'});assert.equal(providerCalls,1);
 const sub=h.records.get('users/u1').subscription;h.records.set('users/u1',{subscription:{...sub,trialEndsAt:new Date(0).toISOString(),currentPeriodEnd:new Date(0).toISOString()}});await assert.rejects(h.functions.generateAiResponse(request),{code:'permission-denied'});assert.equal(providerCalls,1);
});
test('cancel preserves the paid period and all personal learning content',async()=>{
 const h=harness();await h.functions.startProTrial({auth,data:{acceptTerms:true}});const end=h.records.get('users/u1').subscription.currentPeriodEnd;
 h.records.set('users/u1/planner/smart-v2',{tasks:[{id:'existing'}]});h.records.set('users/u1/notebookNotes/saved',{content:'Private note'});h.records.set('users/u1/decks/saved',{title:'Saved deck'});
 const before=[...h.records].filter(([p])=>!p.endsWith('/u1')&&!p.includes('/proEvents/'));const result=await h.functions.cancelProRenewal({auth});assert.equal(result.entitled,true);assert.equal(h.records.get('users/u1').subscription.currentPeriodEnd,end);assert.equal(h.records.get('users/u1').subscription.cancelAtPeriodEnd,true);assert.deepEqual([...h.records].filter(([p])=>!p.endsWith('/u1')&&!p.includes('/proEvents/')),before);
});
test('membership endpoint ignores caller-supplied UID and never exposes another account',async()=>{const h=harness();h.records.set('users/other',{subscription:{plan:'pro',status:'active',currentPeriodEnd:new Date(Date.now()+86400000).toISOString()}});const result=await h.functions.getMembershipStatus({auth,data:{userId:'other'}});assert.equal(result.state,'FREE');await assert.rejects(h.functions.cancelProRenewal({}),{code:'unauthenticated'});});

test('legacy queued cancellation requests are completed idempotently on the server',async()=>{const h=harness();await h.functions.startProTrial({auth,data:{acceptTerms:true}});const end=h.records.get('users/u1').subscription.currentPeriodEnd,path='users/u1/subscriptionRequests/cancel';h.records.set(path,{action:'cancel_renewal'});const event={params:{userId:'u1'},data:h.snapshot(path)};await h.functions.onSubscriptionRequestCreated(event);await h.functions.onSubscriptionRequestCreated(event);assert.equal(h.records.get(path).serverStatus,'completed');assert.equal(h.records.get('users/u1').subscription.currentPeriodEnd,end);assert.equal(h.records.get('users/u1').subscription.cancelAtPeriodEnd,true);});
