const {test,after}=require('node:test');
const assert=require('node:assert/strict');
if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Metrics tests require a local emulator; production access is prohibited');
const {Firestore,FieldValue,Timestamp}=require('../functions/node_modules/@google-cloud/firestore');
const db=new Firestore({projectId:'demo-noviq'});
const factory=require('../functions/metrics');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
const service=factory({db,FieldValue,onCall:(_,fn)=>fn,onDocumentWritten:(_,fn)=>fn,onDocumentCreated:(_,fn)=>fn,HttpsError,logger:console,database:'(default)'});
const uid='metrics-emulator-fixture';
after(async()=>{await db.recursiveDelete(db.doc(`users/${uid}`));await db.terminate();});
test('large mixed legacy data backfills and aggregates without caps or original mutation',{timeout:180000},async()=>{
  await db.doc(`users/${uid}`).set({uid});
  await db.doc(`users/${uid}/decks/real`).set({createdAt:'2026-01-01T00:00:00Z'});
  const writer=db.bulkWriter(); let focus=0,due=0,reviewed=0;
  const instant=Date.parse('2026-01-02T12:00:00Z');
  for(let i=0;i<2501;i++){
    const date=[new Date(instant).toISOString(),Timestamp.fromMillis(instant),instant,{seconds:instant/1000}][i%4];
    const session={category:'focus',duration:120,timestamp:date,status:i%7===0?'pending':'completed',xpEarned:2};
    focus+=factory.normalize('session',session,'x').focusSeconds;
    writer.set(db.doc(`users/${uid}/studySessions/s${String(i).padStart(5,'0')}`),session);
    const card={dueAt:i%11===0?'invalid':date,createdAt:date,reviewCount:i%3===0?2:0,front:'Original fixture text'};
    due+=i%11!==0?1:0;reviewed+=i%3===0?1:0;
    writer.set(db.doc(`users/${uid}/decks/real/cards/c${String(i).padStart(5,'0')}`),card);
  }
  await writer.close();
  await assert.rejects(service.api.getActivityMetrics({data:{}}),{code:'unauthenticated'});
  await assert.rejects(service.api.getActivityMetrics({auth:{uid},data:{start:0,end:1e12}}),{code:'invalid-argument'});
  await assert.rejects(service.api.getActivityMetrics({auth:{uid},data:{}}),{code:'failed-precondition'});
  await service.backfillUser(uid);
  const all=await service.api.getActivityMetrics({auth:{uid},data:{}});
  assert.equal(all.focusMinutes,Math.round(focus/60));assert.equal(all.flashcardsCreated,2501);
  assert.equal(all.dueCards,due);assert.equal(all.reviewedCards,reviewed);
  const day=await service.api.getActivityMetrics({auth:{uid},data:{start:Date.parse('2026-01-02T00:00:00Z'),end:Date.parse('2026-01-03T00:00:00Z')}});
  assert.equal(day.flashcardsCreated,2501);assert.equal(day.xp,5002);
  assert.equal((await db.doc(`users/${uid}/decks/real/cards/c00000`).get()).data().front,'Original fixture text');
  const source=`users/${uid}/decks/real/cards/c00001`;
  await db.doc(source).update({reviewCount:3,dueAt:'2099-01-01T00:00:00Z'});
  // Replayed/older trigger payloads must reread current source.
  await service.api.onMetricsCardWritten({params:{userId:uid,deckId:'real',recordId:'c00001'},data:{after:{data:()=>({reviewCount:0})}}});
  await service.api.onMetricsCardWritten({params:{userId:uid,deckId:'real',recordId:'c00001'}});
  const changed=await service.api.getActivityMetrics({auth:{uid},data:{}});
  assert.equal(changed.dueCards,due-1);assert.equal(changed.reviewedCards,reviewed+1);
  await db.doc(`users/${uid}/decks/real`).delete();
  await service.api.onMetricsDeckWritten({params:{userId:uid,recordId:'real'}});
  const removed=await service.api.getActivityMetrics({auth:{uid},data:{}});
  assert.equal(removed.dueCards,0);assert.equal(removed.flashcardsCreated,0);
  assert.equal((await db.doc(source).get()).exists,true);
});
