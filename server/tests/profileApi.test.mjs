import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileApi } from '../src/profileApi.mjs';
import { dailyVisitPatch,validProfilePatch,mutableProfileKeys } from '../src/profilePolicy.mjs';
import {readFileSync} from 'node:fs';
import { studyHarness } from './helpers/studyHarness.mjs';
const mutation=(baseRevision,patch={},mutationId='edit1')=>({baseRevision,patch,mutationId});
test('profile mutable-field allowlist stays aligned with the repository Firestore rules',()=>{
  const rules=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8');
  const block=/function clientProfileMutableKeys\(\)\s*\{\s*return\s*\[([\s\S]*?)\];/.exec(rules);
  assert.ok(block,'Source rule must be reviewed if renamed or removed.');
  const keys=[...block[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual([...mutableProfileKeys].sort(),keys.sort());
});
test('profile API mirrors protected-field rules, owner identity and empty initial trusted state',async t=>{
  const f=await studyHarness(t,createProfileApi);
  assert.equal((await f.request('GET','/api/profile',undefined,'')).status,401);assert.equal(f.reads(),0);
  assert.equal((await f.request('GET','/api/profile?userId=other')).status,400);
  assert.equal((await f.request('PATCH','/api/profile',mutation(0),'a','https://evil.invalid')).status,403);
  for(const field of ['isAdmin','uid','email','subscription','usage','xp','level','streak','totalStudySeconds','dailyTargetMinutes','visitStreak'])
    assert.equal((await f.request('PATCH','/api/profile',mutation(0,{[field]:999}))).status,400);
  const created=await f.request('PATCH','/api/profile',mutation(0,{displayName:'Learner'}));assert.equal(created.status,201);
  const data=await created.json();assert.equal(data.profile.uid,'owner');assert.equal(data.profile.xp,0);assert.equal(data.profile.isAdmin,false);
  assert.deepEqual(data.profile.subscription,{plan:'free',status:'active'});
  assert.equal((await f.request('PATCH','/api/profile',mutation(0,{displayName:'Learner'}))).status,200);
  assert.equal((await f.request('PATCH','/api/profile',mutation(0,{displayName:'Reused ID'}))).status,409);
  assert.equal((await (await f.request('GET','/api/profile',undefined,'b')).json()).profile,null);
  assert.equal((await f.request('DELETE','/api/profile')).status,405);
});
test('profile edits retain concurrent trusted updates and concurrent client edits conflict',async t=>{
  const f=await studyHarness(t,createProfileApi,{beforeUpdate:row=>{row.data.xp=77;row.data.subscription={plan:'pro',status:'active'};}});
  await f.request('PATCH','/api/profile',mutation(0));
  const responses=await Promise.all([f.request('PATCH','/api/profile',mutation(1,{displayName:'A'},'editA')),f.request('PATCH','/api/profile',mutation(1,{displayName:'B'},'editB'))]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const saved=await(await f.request('GET','/api/profile')).json();assert.equal(saved.profile.xp,77);assert.equal(saved.profile.subscription.plan,'pro');
});
test('onboarding must use allowed enum values, nonfuture timestamp and cannot be reversed',()=>{
  const now=new Date('2026-10-29T00:00:00Z');
  const onboarding={goal:'Prepare for IELTS',profile:'IELTS learner',challenge:'Time management'};
  const patch={onboardingCompleted:true,onboarding,onboardingCompletedAt:new Date('2026-10-28T00:00:00Z')};
  assert.equal(validProfilePatch(patch,{},now),true);
  assert.equal(validProfilePatch({...patch,onboarding:{...onboarding,extra:'forged'}},{},now),false);
  assert.equal(validProfilePatch({...patch,onboardingCompletedAt:new Date('2027-01-01')},{},now),false);
  assert.equal(validProfilePatch({onboardingCompleted:false},patch,now),false);
});
test('daily visit uses Tashkent day boundary, repeats once per day and does not award XP',async t=>{
  let clock=new Date('2026-10-28T18:59:59Z');const f=await studyHarness(t,createProfileApi,{now:()=>clock});
  await f.request('PATCH','/api/profile',mutation(0));
  let result=await(await f.request('POST','/api/profile/visit',{baseRevision:1,mutationId:'visit1'})).json();assert.equal(result.profile.visitStreak,1);
  result=await(await f.request('POST','/api/profile/visit',{baseRevision:2,mutationId:'visit2'})).json();assert.equal(result.profile.visitStreak,1);
  clock=new Date('2026-10-28T19:00:00Z');
  result=await(await f.request('POST','/api/profile/visit',{baseRevision:3,mutationId:'visit3'})).json();assert.equal(result.profile.visitStreak,2);assert.equal(result.profile.bestVisitStreak,2);assert.equal(result.profile.xp,0);
  assert.equal(dailyVisitPatch({visitStreak:5,bestVisitStreak:9,lastVisitDay:0},clock).visitStreak,1);
});
