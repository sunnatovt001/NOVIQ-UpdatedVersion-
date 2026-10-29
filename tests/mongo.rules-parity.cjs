const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,deleteDoc}=require('firebase/firestore');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Parity tests require the isolated local emulator.');
test('Mongo document policy agrees with actual Firestore rules across owner/admin, protected progress, payment, planner and community cases',{timeout:180000},async()=>{
  const {createDocumentPolicy}=await import('../server/src/documentPolicy.mjs');
  const environment=await initializeTestEnvironment({projectId:'demo-noviq',firestore:{host:'127.0.0.1',port:8089,rules:fs.readFileSync('firestore.rules','utf8')}});
  const owner='mongo-parity-owner',other='mongo-parity-other',admin='mongo-parity-admin';
  const records={['users/'+owner]:{uid:owner,xp:0,isAdmin:false},['users/'+other]:{uid:other,xp:0,isAdmin:false},['users/'+admin]:{uid:admin,isAdmin:true}};
  const basePlan={userId:owner,version:2,persistenceVersion:3,revision:'old',sequence:1,tasks:[],sessions:[],subjects:[],ready:true,previousRevision:null};
  records[`users/${owner}/planner/smart-v2`]=basePlan;
  const cases=[
    [owner,`users/${owner}`,records['users/'+owner],{uid:owner,xp:0,isAdmin:false,displayName:'New'}],
    [owner,`users/${owner}`,records['users/'+owner],{uid:owner,xp:999,isAdmin:false}],
    [owner,`users/${owner}`,records['users/'+owner],{uid:owner,isAdmin:false}],
    [other,`users/${owner}/notebookNotes/n`,null,{title:'cross-account'}],
    [owner,`users/${owner}/notebookNotes/n`,null,{title:'own note'}],
    [admin,`users/${owner}/notebookNotes/n`,null,{title:'admin cannot write another note'}],
    [owner,`users/${owner}/trusted/fake`,null,{xp:999}],
    [admin,`users/${owner}/trusted/fake`,null,{xp:999}],
    [owner,`users/${owner}/studySessions/fake`,null,{verified:true,duration:3600}],
    [owner,`users/${owner}/studySessions/existing`,{verified:true,duration:60},{verified:true,duration:60,syncStatus:'synced'}],
    [owner,`users/${owner}/studySessions/existing`,{verified:true,duration:60},{verified:true,duration:600}],
    [owner,`users/${owner}/progressEvents/event`,null,{type:'xp_award',rawXp:30,createdAt:'now',status:'pending'}],
    [owner,`users/${owner}/progressEvents/event`,null,{type:'xp_award',rawXp:999,createdAt:'now'}],
    [owner,`users/${owner}/subscriptionCheckouts/fake`,null,{status:'paid'}],
    [owner,`users/${owner}/subscriptionRequests/request`,null,{action:'cancel_renewal',status:'pending'}],
    [owner,`users/${owner}/subscriptionRequests/request`,null,{action:'cancel_renewal',status:'completed'}],
    [owner,`users/${owner}/decks/d/reviews/c`,null,{id:'c',reviewCount:1,dueAt:'later'}],
    [owner,`users/${owner}/decks/d/reviews/c`,null,{id:'other',reviewCount:1,dueAt:'later'}],
    [owner,`users/${owner}/flashcardSessions/s`,null,{id:'s',attempts:[],cardIds:[],activeSeconds:0}],
    [owner,`users/${owner}/flashcardSessions/s`,null,{id:'s',attempts:Array(201).fill({}),cardIds:[],activeSeconds:0}],
    [owner,`users/${owner}/planner/smart-v2`,basePlan,{...basePlan,revision:'new',sequence:2,previousRevision:'old'}],
    [owner,`users/${owner}/planner/smart-v2`,basePlan,{...basePlan,revision:'new',sequence:2,previousRevision:'forged'}],
    [owner,`users/${owner}/plannerHistory/new`,null,{userId:owner,plan:basePlan}],
    [owner,`users/${owner}/friends/fake`,null,{uid:other}],
    [owner,'communities/parity/messages/fake',null,{userId:owner,text:'direct write forbidden'}],
    [admin,'promoCodes/parity',null,{discountPercent:100}],
    [owner,'analyticsEvents/parity',null,{userId:owner,eventType:'page_view'}],
    [owner,'analyticsEvents/parity',null,{userId:other,eventType:'page_view'}],
  ];
  try{
    await environment.withSecurityRulesDisabled(async context=>{for(const [path,value]of Object.entries(records))await setDoc(doc(context.firestore(),path),value);});
    let compared=0;
    for(const [uid,path,before,after]of cases){
      await environment.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),`users/${owner}/planner/smart-v2`),basePlan);const ref=doc(context.firestore(),path);if(before===null)await deleteDoc(ref);else await setDoc(ref,before);});
      const policy=createDocumentPolicy({uid,lookup:async path=>records[path]||null});
      const expected=await policy.canWrite({path,before,after,now:new Date()});
      const client=environment.authenticatedContext(uid).firestore();let actual=true;
      try{await setDoc(doc(client,path),after);}catch(error){if(error.code!=='permission-denied')throw error;actual=false;}
      assert.equal(actual,expected,`Policy drift for ${path.split('/').filter((_,i)=>i%2===0).join('/')} as ${uid===owner?'owner':uid===admin?'admin':'other'}`);compared++;
    }
    for(const [uid,path]of [[owner,`users/${other}`],[admin,`users/${owner}`],[admin,`users/${owner}/notifications/private`],[owner,`users/${owner}/planner/smart-v2`]]){
      const policy=createDocumentPolicy({uid,lookup:async path=>records[path]||null});
      const expected=await policy.canRead(path,records[path]||null);let actual=true;
      try{await getDoc(doc(environment.authenticatedContext(uid).firestore(),path));}catch(error){if(error.code!=='permission-denied')throw error;actual=false;}
      assert.equal(actual,expected);compared++;
    }
    assert.equal(compared,32);
  }finally{await environment.cleanup();}
});
