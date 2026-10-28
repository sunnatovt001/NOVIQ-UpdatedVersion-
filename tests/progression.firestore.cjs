const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
if(process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Progression integration tests require the isolated demo Firestore emulator.');
const functionsRequire=require('node:module').createRequire(require.resolve('../functions/package.json'));
const admin = functionsRequire('firebase-admin');
const {getFirestore,Timestamp,FieldValue} = functionsRequire('firebase-admin/firestore');
const {dayKey} = require('../functions/policy');
const {createHash} = require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const app=admin.initializeApp({projectId:'demo-noviq'},'progression-tests');
const db=getFirestore(app);
class HttpsError extends Error { constructor(code,message) {super(message);this.code=code;} }
const store=require('../functions/progressionStore')({db,onCall:fn=>fn,HttpsError,Timestamp,FieldValue});
const api=store.api;
let sequence=0;
const student=async (patch={})=>{
  const uid=`xp-emulator-${Date.now()}-${++sequence}`;
  await db.doc(`users/${uid}`).set({uid,xp:0,level:1,streak:0,dailyTargetMinutes:30,...patch});
  return {uid,auth:{uid,token:{auth_time:Math.floor(Date.now()/1000)}}};
};
const request=(user,data)=>({auth:user.auth,data});
const finish=async (user,duration,context='focus')=>{
  const {sessionId}=await api.startStudySession(request(user,{category:'focus',context,restart:true}));
  // Seed isolated server evidence, avoiding minutes of wall-clock waiting.
  // Actual transaction execution and contention are still real Firestore.
  await db.doc(`users/${user.uid}/trusted/start-${sessionId}`).update({verifiedSeconds:duration,running:false});
  return api.completeStudySession(request(user,{sessionId,duration,subject:'Fixture'}));
};
after(async()=>{await app.delete();});

test('real Firestore concurrent check-ins, session completions, cross-account isolation and persisted ledger',async()=>{
  const user=await student({xp:1300});
  const logins=await Promise.all(Array.from({length:5},()=>api.checkInProgress(request(user,{}))));
  assert.ok(logins.every(r=>r.xpDelta===5));
  let progress=(await db.doc(`users/${user.uid}/trusted/progress`).get()).data();
  assert.equal(progress.xp,1305);assert.equal(progress.level,5);assert.equal(progress.streak,0);
  const {sessionId}=await api.startStudySession(request(user,{category:'focus',context:'focus'}));
  await db.doc(`users/${user.uid}/trusted/start-${sessionId}`).update({verifiedSeconds:1500,running:false});
  const completions=await Promise.all(Array.from({length:5},()=>api.completeStudySession(request(user,{sessionId,duration:1500,subject:'Math'}))));
  assert.ok(completions.every(r=>r.xpDelta===60));
  progress=(await db.doc(`users/${user.uid}/trusted/progress`).get()).data();
  assert.equal(progress.xp,1365);assert.equal(progress.totalStudySeconds,1500);
  assert.equal(progress.achievements.A01.xp,20);assert.equal(progress.achievements.A02.xp,20);
  const ledger=await db.collection(`users/${user.uid}/progressEvents`).get();
  assert.equal(ledger.size,2);assert.equal(ledger.docs.reduce((sum,d)=>sum+d.data().xpDelta,0),65);
  const other=await student();
  await assert.rejects(api.completeStudySession(request(other,{sessionId,duration:1500,subject:'Forged'})),{code:'failed-precondition'});
  assert.equal((await db.doc(`users/${other.uid}`).get()).data().xp,0);
});
test('real Firestore Focus caps retain legitimate time, and goal target cannot be lowered for today',async()=>{
  const user=await student({dailyTargetMinutes:120});
  await api.updateDailyGoalTarget(request(user,{minutes:5}));
  assert.equal((await db.doc(`users/${user.uid}/xpDays/${dayKey()}`).get()).data().targetMinutes,120);
  for(let i=0;i<5;i++) await finish(user,1500);
  const progress=(await db.doc(`users/${user.uid}/trusted/progress`).get()).data();
  const daily=(await db.doc(`users/${user.uid}/xpDays/${dayKey()}`).get()).data();
  assert.equal(daily.focusXp,80);assert.equal(daily.goalAwarded,true);assert.equal(daily.focusSeconds,7500);
  assert.equal(progress.totalStudySeconds,7500);assert.equal(progress.counters.goalDays,1);
});
test('real Firestore recall uniqueness across modes, duplicate content, card edits and concurrent requests',async()=>{
  const user=await student();
  const deck=db.collection(`users/${user.uid}/decks`).doc('deck');
  await deck.set({title:'Fixture'});
  const cards=Array.from({length:21},(_,i)=>`card-${i}`);
  const batch=db.batch();cards.forEach((id,i)=>batch.set(deck.collection('cards').doc(id),{front:`Question ${i}`,back:`Answer ${i}`}));await batch.commit();
  const start=await api.startRecallSession(request(user,{deckId:'deck',cardIds:cards,mode:'type',sessionId:'first'}));
  await db.doc(`users/${user.uid}/trusted/recall-${start.proofId}`).update({startedAt:Date.now()-120000});
  for(const cardId of cards) await api.submitRecallAttempt(request(user,{proofId:start.proofId,cardId,answer:'An actual attempt; accuracy is not required'}));
  const dailyPath=`users/${user.uid}/xpDays/${dayKey()}`;
  let day=(await db.doc(dailyPath).get()).data();assert.equal(day.recallXp,30);assert.equal(day.recallCards,21);
  const before=(await db.doc(`users/${user.uid}/trusted/progress`).get()).data();
  await Promise.all(Array.from({length:4},()=>api.submitRecallAttempt(request(user,{proofId:start.proofId,cardId:cards[9],answer:'retry'}))));
  await deck.collection('cards').doc('copy').set({front:'Question 0',back:'Answer 0'});
  const copied=await api.startRecallSession(request(user,{deckId:'deck',cardIds:['copy'],mode:'choice',sessionId:'duplicate'}));
  await db.doc(`users/${user.uid}/trusted/recall-${copied.proofId}`).update({startedAt:Date.now()-10000});
  await api.submitRecallAttempt(request(user,{proofId:copied.proofId,cardId:'copy',answer:'Answer 0'}));
  await deck.collection('cards').doc('card-0').update({front:'Edited front',back:'Edited back'});
  const edited=await api.startRecallSession(request(user,{deckId:'deck',cardIds:['card-0'],mode:'type',sessionId:'edited'}));
  await db.doc(`users/${user.uid}/trusted/recall-${edited.proofId}`).update({startedAt:Date.now()-10000});
  await api.submitRecallAttempt(request(user,{proofId:edited.proofId,cardId:'card-0',answer:'Edited attempt'}));
  day=(await db.doc(dailyPath).get()).data();assert.equal(day.recallCards,21);
  const after=(await db.doc(`users/${user.uid}/trusted/progress`).get()).data();
  assert.equal(after.xp,before.xp);assert.equal(after.counters.uniqueRecallCards,21);
  await assert.rejects(api.startRecallSession(request(user,{deckId:'deck',cardIds:cards,mode:'classic',sessionId:'flip'})),{code:'invalid-argument'});
  await assert.rejects(api.submitRecallAttempt(request(user,{proofId:hash('fake'),cardId:'card-0',answer:'forged'})),{code:'failed-precondition'});
});
test('real Firestore mixed-source contention preserves cumulative totals and ledger reconciliation',async()=>{
  const user=await student();
  const starts=[];
  for(let i=0;i<4;i++) {
    const {sessionId}=await api.startStudySession(request(user,{category:'focus',context:`context-${i}`}));
    await db.doc(`users/${user.uid}/trusted/start-${sessionId}`).update({verifiedSeconds:1500,running:false});
    starts.push(sessionId);
  }
  await Promise.all([
    api.checkInProgress(request(user,{})),
    ...starts.map(sessionId=>api.completeStudySession(request(user,{sessionId,duration:1500,subject:'Fixture'}))),
  ]);
  const userData=(await db.doc(`users/${user.uid}`).get()).data(),progress=(await db.doc(`users/${user.uid}/trusted/progress`).get()).data();
  const ledger=await db.collection(`users/${user.uid}/progressEvents`).get();
  assert.equal(progress.xp,ledger.docs.reduce((sum,d)=>sum+d.data().xpDelta,0));
  assert.equal(userData.xp,progress.xp);assert.equal(progress.totalStudySeconds,6000);
  assert.equal((await db.doc(`users/${user.uid}/xpDays/${dayKey()}`).get()).data().focusXp,80);
});
test('restored auth cannot earn a fresh login; old XP and unrelated user fields are preserved',async()=>{
  const user=await student({xp:4600,streak:9,lastActive:new Date().toISOString(),settings:{privateSetting:true}});
  user.auth.token.auth_time=Math.floor(Date.now()/1000)-86400;
  const result=await api.checkInProgress(request(user,{}));assert.equal(result.xpDelta,0);
  await finish(user,300);
  const saved=(await db.doc(`users/${user.uid}`).get()).data();assert.ok(saved.xp>=4600);assert.equal(saved.level,9);
  assert.equal(saved.streak,9);assert.equal(saved.settings.privateSetting,true);
});

test('real Firestore pauses, expired heartbeat leases and overlapping contexts never double-count',async()=>{
  const user=await student();
  const first=await api.startStudySession(request(user,{category:'focus',context:'focus'}));
  const proof=db.doc(`users/${user.uid}/trusted/start-${first.sessionId}`);
  await proof.update({seenAt:Date.now()-60000});
  await api.updateStudySessionState(request(user,{sessionId:first.sessionId,state:'pause'}));
  let saved=(await proof.get()).data();assert.ok(saved.verifiedSeconds>=60&&saved.verifiedSeconds<62);assert.equal(saved.running,false);
  await proof.update({seenAt:Date.now()-3600000});
  await api.updateStudySessionState(request(user,{sessionId:first.sessionId,state:'resume'}));
  assert.ok((await proof.get()).data().verifiedSeconds<62);
  await proof.update({seenAt:Date.now()-300000});
  await api.updateStudySessionState(request(user,{sessionId:first.sessionId,state:'heartbeat'}));
  saved=(await proof.get()).data();assert.ok(saved.verifiedSeconds>=150&&saved.verifiedSeconds<152);
  const second=await api.startStudySession(request(user,{category:'focus',context:'planner'}));
  assert.equal((await proof.get()).data().running,false);
  await assert.rejects(api.updateStudySessionState(request(user,{sessionId:first.sessionId,state:'resume'})),{code:'failed-precondition'});
  await assert.rejects(api.completeStudySession(request(user,{sessionId:second.sessionId,duration:300,subject:'Too early'})),{code:'failed-precondition'});
  const receipt=await api.completeStudySession(request(user,{sessionId:first.sessionId,duration:300,subject:'Retained earlier time'}));
  assert.equal(receipt.sourceXp,0);assert.ok(receipt.duration>=150&&receipt.duration<153);
});

test('pre-upgrade timers retain their history without being converted into verified XP',async()=>{
  const user=await student({xp:777});
  const sessionId='a'.repeat(32);
  await db.doc(`users/${user.uid}/trusted/start-${sessionId}`).set({id:sessionId,category:'focus',startedAt:Timestamp.fromMillis(Date.now()-1500000),completed:false});
  const result=await api.completeStudySession(request(user,{sessionId,duration:1500,subject:'Legacy timer'}));
  assert.equal(result.status,'unverified');assert.equal(result.xpDelta,0);assert.equal(result.duration,1500);
  assert.equal((await db.doc(`users/${user.uid}`).get()).data().xp,777);
  const saved=(await db.doc(`users/${user.uid}/studySessions/${sessionId}`).get()).data();assert.equal(saved.verified,false);assert.equal(saved.xpEarned,0);
});

test('a verified overnight Focus session splits Tashkent days with one shared 20 XP session cap',async()=>{
  const user=await student({dailyTargetMinutes:20});
  const {sessionId}=await api.startStudySession(request(user,{category:'focus',context:'overnight'}));
  const today=dayKey(), yesterday=dayKey(new Date(Date.now()-86400000));
  await db.doc(`users/${user.uid}/trusted/start-${sessionId}`).update({verifiedSeconds:3000,running:false,daySeconds:{[yesterday]:1500,[today]:1500}});
  const receipt=await api.completeStudySession(request(user,{sessionId,duration:3000,subject:'Across midnight'}));
  assert.equal(receipt.sourceXp,20);
  const prior=(await db.doc(`users/${user.uid}/xpDays/${yesterday}`).get()).data(),current=(await db.doc(`users/${user.uid}/xpDays/${today}`).get()).data();
  assert.equal(prior.focusSeconds,1500);assert.equal(current.focusSeconds,1500);assert.equal(prior.focusXp+current.focusXp,20);
  assert.equal(prior.goalAwarded,true);assert.equal(current.goalAwarded,true);
  const progress=(await db.doc(`users/${user.uid}/trusted/progress`).get()).data();
  assert.equal(progress.streak,2);assert.equal(progress.totalStudySeconds,3000);assert.equal(progress.counters.longFocusSessions,1);
  const ledger=await db.collection(`users/${user.uid}/progressEvents`).get();
  assert.equal(ledger.docs.reduce((sum,d)=>sum+(d.data().xpDelta||0),0),progress.xp);
  const replay=await api.completeStudySession(request(user,{sessionId,duration:3000,subject:'retry'}));assert.equal(replay.xpDelta,receipt.xpDelta);
});

test('same-day cutover preserves legacy XP and does not repay login, goal or previously credited source limits',async()=>{
  const key=dayKey(),user=await student({xp:250,xpAwarded:{[`daily-login:${key}`]:true,[`daily-goal:${key}`]:true,[`flashcard-review:${key}`]:true}});
  await db.doc(`users/${user.uid}/trusted/progress`).set({xp:250,dayKey:key,dailyStudySeconds:1500});
  await db.doc(`users/${user.uid}/studySessions/legacy-today`).set({category:'focus',verified:true,duration:1500,timestamp:new Date().toISOString()});
  await db.doc(`users/${user.uid}/progressEvents/session-legacy-today`).set({processedAt:Timestamp.now(),rawXpApplied:20});
  const receipt=await api.checkInProgress(request(user,{}));assert.equal(receipt.xpDelta,0);
  const day=(await db.doc(`users/${user.uid}/xpDays/${key}`).get()).data();
  assert.equal(day.loginAwarded,true);assert.equal(day.goalAwarded,true);assert.equal(day.focusXp,20);assert.equal(day.recallXp,15);assert.equal(day.ordinaryXp,60);
  assert.equal((await db.doc(`users/${user.uid}`).get()).data().xp,250);
});
