import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentPolicy} from '../src/documentPolicy.mjs';
import {Timestamp,FieldValue,applyDocumentWrite,nativeFields,pack,revive} from '../../shared/mongoValues.mjs';
const now=new Date('2026-10-29T07:00:00Z');
const context=(uid='owner',records={},claims={})=>createDocumentPolicy({uid,claims,lookup:async path=>records[path]??null});
const write=(policy,path,before,after)=>policy.canWrite({path,before,after,now});
test('source value codec preserves nanoseconds, server transforms and unsafe-integer rejection',()=>{
  const data=nativeFields({at:{timestampValue:'2026-10-29T07:00:00.123456789Z'},nested:{mapValue:{fields:{n:{integerValue:'7'}}}}});
  assert.equal(data.at.nanoseconds,123456789);assert.equal(revive(pack(data)).at.nanoseconds,123456789);
  assert.throws(()=>nativeFields({n:{integerValue:'9223372036854775807'}}));
  const after=applyDocumentWrite({counter:1,nested:{a:1,b:2},tags:['a']},{kind:'update',data:{counter:FieldValue.increment(2),'nested.a':FieldValue.delete(),at:FieldValue.serverTimestamp(),tags:FieldValue.arrayUnion('a','b')}},now);
  assert.equal(after.counter,3);assert.deepEqual(after.nested,{b:2});assert.deepEqual(after.tags,['a','b']);assert.ok(after.at.isEqual(Timestamp.fromDate(now)));
  assert.deepEqual(applyDocumentWrite({nested:{a:1,b:2}},{kind:'set',merge:true,data:{nested:{a:3}}},now),{nested:{a:3,b:2}});
  assert.throws(()=>applyDocumentWrite({}, {kind:'update',data:JSON.parse('{"__proto__.polluted":true}')},now));
});
test('owner/admin boundaries preserve the source private and collection-group read differences',async()=>{
  const owner=context(),other=context('other'),admin=context('admin',{'users/admin':{isAdmin:true}});
  for(const domain of ['notebookNotes','notebookSources','tutorMessages','trusted','studySessions','decks','xpDays','recallEvidence']){
    const path=`users/owner/${domain}/record`;
    assert.equal(await owner.canRead(path,{}),true);assert.equal(await other.canRead(path,{}),false);assert.equal(await admin.canRead(path,{}),true);
  }
  for(const domain of ['planner','plannerHistory','notifications','proEvents','proExperience','friends']){
    assert.equal(await owner.canRead(`users/owner/${domain}/record`,{}),true);
    assert.equal(await admin.canRead(`users/owner/${domain}/record`,{}),false);
  }
  assert.equal(await owner.canQuery({group:'notebookNotes'}),false);
  assert.equal(await admin.canQuery({group:'notebookNotes'}),true);
  assert.equal(await admin.canQuery({group:'promoUsages'}),false);
  assert.equal(await admin.canRead('mongoBackupNamespaces/secret',{}),false);
});
test('profile privilege injection, protected-field removal and invalid onboarding are rejected',async()=>{
  const p=context(),base={uid:'owner',displayName:'Name',xp:10,isAdmin:false,subscription:{plan:'free',status:'active'}};
  assert.equal(await write(p,'users/owner',null,{uid:'owner',xp:0,isAdmin:false}),true);
  for(const patch of [{isAdmin:true},{xp:10},{subscription:{plan:'pro',status:'active'}},{usage:{total:999}}])
    assert.equal(await write(p,'users/owner',null,{uid:'owner',...patch}),false);
  assert.equal(await write(p,'users/owner',base,{...base,displayName:'Changed'}),true);
  for(const patch of [{xp:99},{isAdmin:true},{dailyTargetMinutes:1},{subscription:{plan:'pro',status:'active'}}])
    assert.equal(await write(p,'users/owner',base,{...base,...patch}),false);
  const removed={...base};delete removed.xp;assert.equal(await write(p,'users/owner',base,removed),false);
  const complete={...base,onboardingCompleted:true,onboarding:{goal:'Prepare for IELTS',profile:'IELTS learner',challenge:'Procrastination'},onboardingCompletedAt:Timestamp.fromDate(now)};
  assert.equal(await write(p,'users/owner',base,complete),true);
  const invalid={...complete};delete invalid.onboarding;assert.equal(await write(p,'users/owner',complete,invalid),false);
  assert.equal(await write(p,'users/owner',complete,{...complete,onboardingCompleted:false}),false);
  assert.equal(await write(p,'users/owner',null,{uid:'owner',onboardingCompleted:true,onboarding:{},onboardingCompletedAt:Timestamp.fromDate(now)}),false);
});
test('server-owned progress/payment/community domains stay write-denied while source sync-only updates remain possible',async()=>{
  const p=context();
  for(const domain of ['trusted','studySessions','xpDays','recallEvidence','proEvents','joinedCommunities','friendInvites','friends','promoUsages','subscriptionCheckouts']){
    assert.equal(await write(p,`users/owner/${domain}/id`,null,{userId:'owner',xp:999}),false);
  }
  const path='users/owner/studySessions/id',before={verified:true,duration:70};
  assert.equal(await write(p,path,before,{...before,syncStatus:'synced',syncedAt:'now'}),true);
  assert.equal(await write(p,path,before,{...before,duration:700}),false);
  assert.equal(await write(p,'communities/public/messages/id',null,{userId:'owner',text:'forged'}),false);
  assert.equal(await write(p,'promoCodes/id',null,{discountPercent:100}),false);
});
test('planner revisions/history, daily visits, card-review IDs and session bounds preserve source checks',async()=>{
  const current={userId:'owner',version:2,persistenceVersion:3,revision:'old',sequence:1,tasks:[],sessions:[],subjects:[],ready:true};
  const p=context('owner',{'users/owner/planner/smart-v2':current});
  assert.equal(await write(p,'users/owner/planner/smart-v2',current,{...current,revision:'new',sequence:2,previousRevision:'old'}),true);
  assert.equal(await write(p,'users/owner/planner/smart-v2',current,{...current,revision:'new',sequence:2,previousRevision:'forged'}),false);
  assert.equal(await write(p,'users/owner/plannerHistory/new',null,{userId:'owner',plan:current}),true);
  assert.equal(await write(p,'users/owner/plannerHistory/new',{},{}),false);
  const profile={visitStreak:2,bestVisitStreak:4,lastVisitDay:Math.floor((now.getTime()+18000000)/86400000)-1};
  const visit={...profile,visitStreak:3,lastVisitDay:profile.lastVisitDay+1,lastVisitAt:Timestamp.fromDate(now)};
  assert.equal(await write(p,'users/owner',profile,visit),true);
  assert.equal(await write(p,'users/owner',profile,{...visit,visitStreak:30}),false);
  assert.equal(await write(p,'users/owner/decks/d/reviews/c',null,{id:'c',reviewCount:1,dueAt:'later'}),true);
  assert.equal(await write(p,'users/owner/decks/d/reviews/c',null,{id:'other',reviewCount:1,dueAt:'later'}),false);
  assert.equal(await write(p,'users/owner/flashcardSessions/s',null,{id:'s',attempts:[],cardIds:Array(201).fill('c'),activeSeconds:0}),false);
});
test('community membership and legacy owner query constraints cannot be bypassed with a disjunction',async()=>{
  const p=context('owner',{'communities/room/members/owner':{uid:'owner'}});
  assert.equal(await p.canQuery({path:'communities/room/messages'}),true);
  assert.equal(await context().canQuery({path:'communities/room/messages'}),false);
  assert.equal(await p.canQuery({path:'communities/room/members'}),false);
  assert.equal(await p.canQuery({path:'notes',filters:[{kind:'where',field:'userId',op:'==',value:'owner'}]}),true);
  assert.equal(await p.canQuery({path:'notes',filters:[{kind:'or',conditions:[{kind:'where',field:'userId',op:'==',value:'owner'}]}]}),false);
});
