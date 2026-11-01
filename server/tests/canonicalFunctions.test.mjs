import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createCanonicalStore,Timestamp,FieldValue} from '../src/canonicalStore.mjs';
import {canonicalMemory} from './helpers/canonicalMemory.mjs';
const require=createRequire(import.meta.url),onCall=(...args)=>args.at(-1);
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
const fixture=()=>{const memory=canonicalMemory();return {...memory,db:createCanonicalStore({getDatabase:async()=>memory.db,transaction:memory.transaction})};};
test('existing XP logic on MongoDB adapter remains once-only and retains profile/progress history under concurrent check-ins',async()=>{
  const {db}=fixture();await db.doc('users/owner').set({uid:'owner',xp:70,displayName:'Keep',subscription:{plan:'free',status:'active'}});
  const service=require('../../functions/progressionStore.js')({db,onCall,HttpsError,FieldValue,Timestamp});
  const request={auth:{uid:'owner',token:{auth_time:Math.floor(Date.now()/1000)}},data:{}};
  await Promise.all([service.api.checkInProgress(request),service.api.checkInProgress(request)]);
  const user=(await db.doc('users/owner').get()).data();assert.equal(user.xp,75);assert.equal(user.displayName,'Keep');
  const ledger=await db.collection('users/owner/progressEvents').get();assert.equal(ledger.size,1);assert.ok(ledger.docs[0].data().processedAt instanceof Timestamp);
  await service.api.checkInProgress(request);assert.equal((await db.doc('users/owner').get()).data().xp,75);
  assert.equal((await db.doc('users/other').get()).exists,false);
});
test('existing membership logic on MongoDB adapter preserves explicit agreement, once-only trial and cancellation period',async()=>{
  const {db}=fixture();await db.doc('users/owner').set({uid:'owner',xp:70,subscription:{plan:'free',status:'active'}});
  const api={};require('../../functions/membership.js').registerMembership({exports:api,db,onCall,onSchedule:onCall,HttpsError,FieldValue});
  assert.equal((await api.getMembershipStatus({auth:{uid:'owner'},data:{uid:'other'}})).entitled,false);
  await assert.rejects(api.startProTrial({auth:{uid:'owner'},data:{}}),{code:'invalid-argument'});
  const request={auth:{uid:'owner'},data:{acceptTerms:true}};
  const [a,b]=await Promise.all([api.startProTrial(request),api.startProTrial(request)]);
  assert.equal(a.trialEndsAt,b.trialEndsAt);assert.equal(a.entitled,true);
  await api.cancelProRenewal({auth:{uid:'owner'},data:{}});
  const profile=(await db.doc('users/owner').get()).data();assert.equal(profile.subscription.cancelAtPeriodEnd,true);assert.equal(profile.subscription.currentPeriodEnd,a.currentPeriodEnd);assert.equal(profile.xp,70);
});
test('existing community logic on MongoDB adapter creates membership atomically and rejects outsider directory access',async()=>{
  const {db}=fixture();await db.doc('users/owner').set({uid:'owner',displayName:'Owner'});
  const assertAdmin=async request=>{if(request.auth?.token?.admin!==true)throw new HttpsError('permission-denied','Admin access required.');};
  const api=require('../../functions/community.js')({db,onCall,HttpsError,FieldValue,assertAdmin});
  await assert.rejects(api.createCommunity({auth:{uid:'owner'},data:{name:'Blocked'}}),{code:'permission-denied'});
  const room=await api.createCommunity({auth:{uid:'owner',token:{admin:true,email_verified:true}},data:{name:'Synthetic group',description:'Verification'}});
  const id=room.communityId||room.id;assert.ok(id);
  assert.equal((await db.doc(`communities/${id}/members/owner`).get()).exists,true);
  assert.equal((await db.doc(`users/owner/joinedCommunities/${id}`).get()).exists,true);
  const directory=api.getCommunityMembers;
  assert.equal(typeof directory,'function');
  await assert.rejects(directory({auth:{uid:'outsider'},data:{communityId:id}}));
});

test('admin data browser paginates MongoDB user records without leaking another account',async()=>{
  const {db}=fixture();await db.doc('users/target').set({uid:'target',displayName:'Target'});
  for(let i=0;i<12;i++)await db.doc(`users/target/plannerHistory/r${String(i).padStart(2,'0')}`).set({revision:i});
  await db.doc('users/other/plannerHistory/other').set({revision:'private'});
  const assertAdmin=async request=>{if(request.auth?.token?.admin!==true)throw new HttpsError('permission-denied','Admin access required.');};
  const api=require('../../functions/adminUserData.js')({db,onCall,HttpsError,assertAdmin});
  const auth={uid:'admin',token:{admin:true}},data={userId:'target',section:'plannerHistory'};
  const first=await api.adminGetUserData({auth,data});assert.equal(first.records.length,10);
  const second=await api.adminGetUserData({auth,data:{...data,after:first.nextCursor}});assert.equal(second.records.length,2);assert.equal(second.nextCursor,null);
  assert.deepEqual([...first.records,...second.records].map(r=>r.data.revision),Array.from({length:12},(_,i)=>i));
});
