const assert=require('node:assert/strict');
const { before, after, test } = require("node:test");
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8089") {
  throw new Error("Rules tests require FIRESTORE_EMULATOR_HOST=127.0.0.1:8089. Run npm run test:rules; production access is prohibited.");
}
const fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc, getDoc } = require("firebase/firestore");
let environment;
let owner;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-noviq",
    firestore: {
      host: "127.0.0.1",
      port: 8089,
      rules: fs.readFileSync(`${__dirname}/../firestore.rules`, "utf8"),
    },
  });
  owner = environment.authenticatedContext("u1").firestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    // Legacy profile deliberately lacks optional isAdmin/usage/subscription.
    await setDoc(doc(context.firestore(), "users/u1"), {
      uid: "u1",
      email: "u1@example.com",
      xp: 0,
      onboarded: false,
    });
  });
});
after(async () => environment?.cleanup());
test('Smart Planner and Focus attribution stay private to their account', async () => {
  for (const id of ['smart-v2', 'focus-receipt']) {
    const path = `users/u1/planner/${id}`;
    await assertSucceeds(setDoc(doc(owner, path), id==='smart-v2'?{version:2,userId:'u1',tasks:[],sessions:[],subjects:[],ready:false,persistenceVersion:3,sequence:1,revision:'initial-fixture',previousRevision:null}:{kind:'focusReceipt',taskId:'fixture',seconds:60}));
    await assertSucceeds(getDoc(doc(owner, path)));
    const other = environment.authenticatedContext('u2').firestore();
    await assertFails(getDoc(doc(other, path)));
    await assertFails(updateDoc(doc(other, path), {tasks:['forged']}));
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), path)));
  }
});
test("legacy profiles can update allowed fields", async () => {
  await assertSucceeds(
    updateDoc(doc(owner, "users/u1"), {
      displayName: "Student",
      onboarded: true,
    }),
  );
});
test("protected fields cannot be added or modified", async () => {
  for (const patch of [
    { isAdmin: true },
    { xp: 9999 },
    { subscription: { plan: "pro" } },
    { telegramId: "123456" },
    { usage: { aiTutor: {} } },
  ]) {
    await assertFails(updateDoc(doc(owner, "users/u1"), patch));
  }
});
test("private profiles are isolated between accounts", async () => {
  await assertSucceeds(getDoc(doc(owner, "users/u1")));
  await assertFails(
    getDoc(doc(environment.authenticatedContext("u2").firestore(), "users/u1")),
  );
});
test("clients cannot create verified sessions, checkouts or trusted state", async () => {
  for (const path of [
    "users/u1/studySessions/s1",
    "users/u1/subscriptionCheckouts/c1",
    "users/u1/trusted/aiUsage",
    "telegramLinks/abc",
    "verifiedPayments/tx1",
  ]) {
    await assertFails(
      setDoc(doc(owner, path), { status: "pending", verified: true }),
    );
  }
});
test("progress events reject forged completion metadata and noncanonical session IDs", async () => {
  const data = {
    type: "study_session",
    sessionId: "s1",
    createdAt: new Date().toISOString(),
  };
  await assertFails(setDoc(doc(owner, "users/u1/progressEvents/random"), data));
  await assertFails(
    setDoc(doc(owner, "users/u1/progressEvents/session-s1"), {
      ...data,
      processedAt: new Date().toISOString(),
    }),
  );
  await assertSucceeds(
    setDoc(doc(owner, "users/u1/progressEvents/session-s1"), data),
  );
});
test("analytics cannot forge processed markers or impersonate another account", async () => {
  const data = {
    userId: "u1",
    eventType: "site_visit",
    createdAt: new Date().toISOString(),
  };
  await assertFails(
    setDoc(doc(owner, "analyticsEvents/fake1"), {
      ...data,
      processedAt: "now",
    }),
  );
  await assertFails(
    setDoc(doc(owner, "analyticsEvents/fake2"), { ...data, userId: "u2" }),
  );
  await assertSucceeds(setDoc(doc(owner, "analyticsEvents/valid"), data));
});
test("owner notes and pending cancellation requests remain writable", async () => {
  await assertSucceeds(
    setDoc(doc(owner, "users/u1/notebookNotes/n1"), { content: "Study notes" }),
  );
  await assertSucceeds(
    setDoc(doc(owner, "users/u1/subscriptionRequests/r1"), {
      action: "cancel_renewal",
      status: "pending",
      createdAt: new Date().toISOString(),
      syncStatus: "synced",
    }),
  );
});

test("community friendships, memberships and chat cannot be forged by clients", async () => {
  for (const path of [
    "users/u1/friends/u2",
    "users/u1/friendInvites/token",
    "users/u1/joinedCommunities/room",
    "communities/room",
    "communities/room/members/u1",
    "communities/room/messages/fake",
    "friendInvitations/token",
  ])
    await assertFails(
      setDoc(doc(owner, path), {
        uid: "u1",
        createdBy: "u1",
        role: "owner",
        content: "fake",
      }),
    );
});
test("community messages are readable only by group members", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "communities/room/members/u1"), {
      uid: "u1",
    });
    await setDoc(doc(context.firestore(), "communities/room/messages/real"), {
      content: "Hello",
      userId: "u1",
    });
  });
  await assertSucceeds(getDoc(doc(owner, "communities/room/messages/real")));
  await assertFails(
    getDoc(
      doc(
        environment.authenticatedContext("u2").firestore(),
        "communities/room/messages/real",
      ),
    ),
  );
});

test('Flashcards v2 review states and sessions enforce ownership and reject invalid writes',async()=>{
 const other=environment.authenticatedContext('u2').firestore();
 const privatePaths=[['users/u1/decks/d/reviews/c',{id:'c',reviewCount:1,dueAt:'2026-10-15'}],['users/u1/flashcardSessions/s',{id:'s',attempts:[],cardIds:['c'],activeSeconds:20}]];
 for(const [path,data] of privatePaths){await assertSucceeds(setDoc(doc(owner,path),data));await assertSucceeds(getDoc(doc(owner,path)));await assertFails(getDoc(doc(other,path)));await assertFails(setDoc(doc(other,path),data));await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(),path)));}
 await assertFails(setDoc(doc(owner,'users/u1/decks/d/reviews/invalid'),{id:'wrong',reviewCount:-1,dueAt:'2026-10-15'}));
 await assertFails(setDoc(doc(owner,'users/u1/flashcardSessions/oversized'),{id:'oversized',attempts:[],cardIds:Array(201).fill('c'),activeSeconds:0}));
});


test('Planner CAS rejects stale clients, preserves confirmed data and keeps private immutable revisions',async()=>{
 const vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
 const realFire=require('firebase/firestore');const fire={...realFire,runTransaction:(database,callback,options)=>realFire.runTransaction(database,tx=>callback({get:ref=>tx.get(ref),set:(ref,value)=>tx.set(ref,JSON.parse(JSON.stringify(value)))}),options)};
 function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>deps[n],Date,Intl,Map,Set,setTimeout,clearTimeout,TextEncoder,crypto:crypto.webcrypto});return exports;}
 const model=load('src/features/planner/smartPlannerModel.ts',{'./smartSchedule':{}});
 const persistence=load('src/features/planner/plannerPersistence.ts',{'./smartPlannerModel':model});
 const uid='planner-integrity';const own=environment.authenticatedContext(uid).firestore();
 const service=load('src/features/planner/plannerCloud.ts',{'firebase/firestore':fire,'@/src/lib/firebase':{db:own},'@/src/lib/auditMode':{isReadOnlyAudit:false},'@/src/lib/localStore':{},'@/src/lib/offlineSync':{},'./smartPlannerModel':model,'./plannerPersistence':persistence});
 const root=doc(own,`users/${uid}/planner/smart-v2`);
 const first={...model.initialSmartPlan(uid),ready:true,completedOnboardingAt:Date.now(),revision:'first-confirmed',updatedAt:Date.now()};
 const saved=await service.commitPlannerPlan(uid,first,null,'Confirm first plan');
 assert.equal(saved.sequence,1);
 const replies=await Promise.allSettled([
   service.commitPlannerPlan(uid,{...saved,revision:'client-a',dailyLimit:180},saved,'Change duration'),
   service.commitPlannerPlan(uid,{...saved,revision:'client-b',breakMinutes:10},saved,'Change break')
 ]);
 assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal(replies.filter(r=>r.status==='rejected').length,1);
 const current=(await getDoc(root)).data();assert.equal(current.sequence,2);assert.ok(['client-a','client-b'].includes(current.revision));
 await assertFails(setDoc(root,JSON.parse(JSON.stringify({...saved,revision:'stale-unconditional'}))));
 await assertFails(setDoc(root,{version:2,userId:uid,tasks:[]}));
 const other=environment.authenticatedContext('another-planner-user').firestore();await assertFails(getDoc(doc(other,`users/${uid}/planner/smart-v2`)));
 const history=await fire.getDocs(fire.collection(own,`users/${uid}/plannerHistory`));assert.equal(history.docs.length,1);assert.equal(history.docs[0].data().plan.revision,'first-confirmed');
 await assertFails(updateDoc(history.docs[0].ref,{description:'forged'}));
 await assertFails(getDoc(doc(other,history.docs[0].ref.path)));
 const restored=await service.commitPlannerPlan(uid,{...first,revision:'restore',dailyLimit:120},current,'Restore confirmed version');assert.equal(restored.sequence,3);
 assert.equal((await fire.getDocs(fire.collection(own,`users/${uid}/plannerHistory`))).docs.length,2);
 assert.equal((await getDoc(root)).data().dailyLimit,120);
});

test('PRO trials and audit events are server-owned while personal onboarding and notes stay private',async()=>{
 const other=environment.authenticatedContext('u2').firestore();
 await assertFails(updateDoc(doc(owner,'users/u1'),{subscription:{plan:'pro',status:'trialing',trialUsed:true,trialStartedAt:new Date().toISOString(),trialEndsAt:'2099-01-01T00:00:00Z',currentPeriodEnd:'2099-01-01T00:00:00Z'}}));
 await assertFails(setDoc(doc(owner,'users/u1/proEvents/forged'),{type:'trial_started'}));
 const path='users/u1/proExperience/onboarding';await assertSucceeds(setDoc(doc(owner,path),{step:2,completed:false}));await assertFails(getDoc(doc(other,path)));await assertFails(setDoc(doc(other,path),{completed:true}));
 const note='users/u1/notebookNotes/pro-created';await assertSucceeds(setDoc(doc(owner,note),{title:'My reflection',content:'My own saved work',tags:[],kind:'focus-reflection'}));await assertSucceeds(getDoc(doc(owner,note)));await assertFails(getDoc(doc(other,note)));
});
