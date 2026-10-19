const test=require('node:test'),assert=require('node:assert/strict');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Demo Firestore emulator required');
const req=require('node:module').createRequire(require('node:path').resolve('functions/index.js'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore,FieldValue}=req('firebase-admin/firestore');
const {registerMembership}=req('./membership');
test('actual Firestore trial transactions, scheduled expiry and reminders preserve learning records',async()=>{
 const app=initializeApp({projectId:'demo-noviq'},'ascend-membership-'+Date.now()),db=getFirestore(app),handlers={};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 registerMembership({exports:handlers,db,onCall:(...args)=>args.at(-1),onSchedule:(...args)=>args.at(-1),HttpsError,FieldValue});
 const uid='trial-emulator-'+Date.now(),root=db.doc('users/'+uid),plan=db.doc('users/'+uid+'/planner/smart-v2');
 try{
 await root.set({uid,subscription:{plan:'free',status:'active'}});await plan.set({userId:uid,tasks:[{id:'keep'}]});
 const request={auth:{uid},data:{acceptTerms:true}};
 const [a,b]=await Promise.all([handlers.startProTrial(request),handlers.startProTrial(request)]);assert.equal(a.trialStartedAt,b.trialStartedAt);assert.equal(a.entitled,true);
 const sub=(await root.get()).data().subscription,near=new Date(Date.now()+3600000).toISOString();await root.set({subscription:{...sub,trialEndsAt:near,currentPeriodEnd:near}},{merge:true});
 await handlers.reconcileProMemberships({});await handlers.reconcileProMemberships({});const reminders=await root.collection('notifications').get();assert.equal(reminders.size,1);
 await root.set({subscription:{...sub,trialEndsAt:new Date(0).toISOString(),currentPeriodEnd:new Date(0).toISOString()}},{merge:true});await handlers.reconcileProMemberships({});await handlers.reconcileProMemberships({});
 assert.equal((await root.get()).data().subscription.status,'expired');assert.equal((await handlers.getMembershipStatus({auth:{uid}})).entitled,false);assert.equal((await root.collection('notifications').get()).size,2);assert.deepEqual((await plan.get()).data().tasks,[{id:'keep'}]);await assert.rejects(handlers.startProTrial(request),{code:'already-exists'});
 }finally{await deleteApp(app);}
});
