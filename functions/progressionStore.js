const {createHash,randomBytes} = require('node:crypto');
const {number,levelInfo,freshDay,evaluate,dayKey} = require('./progression');
const hash = value => createHash('sha256').update(value).digest('hex');
const idValid = value => typeof value === 'string' && /^[\w-]{1,160}$/.test(value);
const millis = value => value?.toDate ? value.toDate().getTime() : Date.parse(value || '');
const ordinaryTarget = user => Math.max(20,Math.min(480,number(user.dailyTargetMinutes)||30));

module.exports = function progressionStore({db,onCall,HttpsError,FieldValue,Timestamp}) {
  const userRef = uid => db.doc(`users/${uid}`);
  const auth = request => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in first.');
    return request.auth.uid;
  };
  async function readDay(tx,root,snapshot,key,user,progress) {
    if(snapshot.exists) return snapshot.data();
    const daily=freshDay(key,ordinaryTarget(user)), legacy=user.xpAwarded||{};
    // A rollout must not pay yesterday's implementation twice on the same day.
    if(legacy[`daily-login:${key}`]) {daily.loginAwarded=true;daily.ordinaryXp+=5;}
    if(legacy[`daily-goal:${key}`]) {daily.goalAwarded=true;daily.ordinaryXp+=20;}
    if(legacy[`flashcard-review:${key}`]) {daily.recallXp=15;daily.ordinaryXp+=15;}
    if(progress.version!==2 && progress.dayKey===key) {
      const start=new Date(`${key}T00:00:00+05:00`), end=new Date(start.getTime()+86400000);
      const sessions=await tx.get(root.collection('studySessions').where('timestamp','>=',start.toISOString()).where('timestamp','<',end.toISOString()));
      const focus=sessions.docs.filter(s=>s.data().category==='focus'&&s.data().verified===true&&s.data().progressionVersion!==2);
      const awards=await Promise.all(focus.map(s=>tx.get(root.collection('progressEvents').doc(`session-${s.id}`))));
      daily.focusXp=awards.reduce((sum,entry)=>sum+(entry.data()?.processedAt?Math.min(20,number(entry.data().rawXpApplied)):0),0);
      daily.ordinaryXp+=daily.focusXp;
    }
    daily.legacyOrdinaryXp=daily.ordinaryXp;
    return daily;
  }
  // All reads precede every write. The progress document serializes rewards
  // from different sources/devices; event IDs serialize retries of one proof.
  async function prepareAward(tx,uid,event,previousProgress) {
    const root=userRef(uid), ledger=root.collection('progressEvents').doc(event.id);
    const [entry,userSnap,progressSnap,daySnap] = await Promise.all([
      tx.get(ledger),tx.get(root),tx.get(root.collection('trusted').doc('progress')),
      tx.get(root.collection('xpDays').doc(event.dayKey)),
    ]);
    if (entry.data()?.processedAt) {
      const result=entry.data().result || {eventId:event.id,xpDelta:0,status:'processed'};
      return {result,patch:previousProgress||progressSnap.data(),commit:()=>result};
    }
    if (!userSnap.exists) throw new HttpsError('failed-precondition','Create your profile first.');
    const user=userSnap.data(), old=previousProgress||progressSnap.data()||{};
    const legacyAwards=user.xpAwarded||{};
    const progress={...old,xp:number(old.xp ?? user.xp),streak:number(old.streak ?? user.streak)};
    const lastActive=millis(old.lastActive ?? user.lastActive);
    if(!progress.lastQualifiedDay && progress.streak>0 && Number.isFinite(lastActive)) progress.lastQualifiedDay=dayKey(new Date(lastActive));
    // v2 counters begin with verified v2 evidence. Never import Planner localXp.
    const daily=await readDay(tx,root,daySnap,event.dayKey,user,old);
    const next=evaluate(progress,daily,{...event,legacyStreak7:Object.keys(legacyAwards).some(key=>key.startsWith('streak-7:')&&legacyAwards[key]),legacyStreak30:Object.keys(legacyAwards).some(key=>key.startsWith('streak-30:')&&legacyAwards[key])});
    const before=levelInfo(progress.xp).level;
    const history={...(old.levelHistory||{})};
    for(let level=before+1;level<=next.state.level;level++) history[String(level)]={at:event.at,eventId:event.id};
    const totalStudySeconds=number(old.totalStudySeconds ?? user.totalStudySeconds)+(event.source==='focus'?event.duration:0);
    const patch={...next.state,totalStudySeconds,levelHistory:history,updatedAt:FieldValue.serverTimestamp()};
    if(event.source==='focus') patch.lastStudySessionAt=event.at;
    if(next.state.lastQualifiedDay) patch.lastActive=`${next.state.lastQualifiedDay}T12:00:00+05:00`;
    const mirror={xp:patch.xp,level:patch.level,levelName:patch.levelName,totalStudySeconds,updatedAt:FieldValue.serverTimestamp()};
    if(next.state.lastQualifiedDay) Object.assign(mirror,{streak:patch.streak,lastActive:patch.lastActive});
    if(event.source==='focus') mirror.lastStudySessionAt=event.at;
    return {result:next.result,patch,commit:()=>{
      tx.set(root.collection('trusted').doc('progress'),patch,{merge:true});
      tx.set(root,mirror,{merge:true});
      tx.set(root.collection('xpDays').doc(event.dayKey),next.day,{merge:true});
      tx.set(ledger,{type:'verified_v2',uid,source:event.source,verifiedReference:event.reference,dayKey:event.dayKey,xpDelta:next.result.xpDelta,ordinaryXp:next.result.ordinaryXp,bonusXp:next.result.bonusXp,awardReason:next.result.reasons,status:'processed',processedAt:FieldValue.serverTimestamp(),createdAt:event.at,result:next.result},{merge:true});
      return next.result;
    }};
  }
  const award=async(tx,uid,event)=>(await prepareAward(tx,uid,event)).commit();
  const event = (source,id,extra={}) => { const at=new Date().toISOString(); return {source,id,at,dayKey:dayKey(new Date(at)),reference:id,...extra}; };
  async function prepareDay(tx,uid) {
    const root=userRef(uid), key=dayKey(), ref=root.collection('xpDays').doc(key);
    const [user,snapshot,progress]=await Promise.all([tx.get(root),tx.get(ref),tx.get(root.collection('trusted').doc('progress'))]);
    if(!user.exists) throw new HttpsError('failed-precondition','Create your profile first.');
    return {ref,user:user.data(),daily:await readDay(tx,root,snapshot,key,user.data(),progress.data()||{})};
  }
  const checkInProgress = onCall(async request => {
    const uid=auth(request), key=dayKey();
    // Token auth_time is Firebase verified. Session restoration on later days
    // prepares the target snapshot without masquerading as a fresh login.
    const authTime=Number(request.auth.token?.auth_time)*1000;
    if(Number.isFinite(authTime) && dayKey(new Date(authTime))===key) {
      return db.runTransaction(tx=>award(tx,uid,event('login',`login-v2-${key}`)));
    }
    return db.runTransaction(async tx=>{const day=await prepareDay(tx,uid);tx.set(day.ref,day.daily,{merge:true});return {xpDelta:0,status:'restored'};});
  });
  const updateDailyGoalTarget = onCall(async request => {
    const uid=auth(request), target=request.data?.minutes;
    if(!Number.isInteger(target)||target<5||target>480) throw new HttpsError('invalid-argument','Choose a target from 5 to 480 minutes.');
    return db.runTransaction(async tx=>{
      const day=await prepareDay(tx,uid);
      // Preserve the pre-edit target even when this is the first request today.
      tx.set(day.ref,day.daily,{merge:true});
      tx.update(userRef(uid),{dailyTargetMinutes:target});
      return {minutes:target,effectiveTomorrow:true};
    });
  });
  const startStudySession = onCall(async request => {
    const uid=auth(request), category=request.data?.category, context=request.data?.context||'focus';
    if(!['focus','revision','quiz'].includes(category)||typeof context!=='string'||context.length>200) throw new HttpsError('invalid-argument','Invalid study session.');
    return db.runTransaction(async tx=>{
      const root=userRef(uid), lock=root.collection('trusted').doc('focusLease');
      const pointer=root.collection('trusted').doc(`session-${hash(context)}`);
      const [leaseSnap,day,rateSnap,priorSnap]=await Promise.all([tx.get(lock),prepareDay(tx,uid),tx.get(root.collection('trusted').doc('sessionRate')),tx.get(pointer)]);
      const lease=leaseSnap.data()||{}, now=Date.now();
      const prior=priorSnap.data(), priorProof=prior?.id ? await tx.get(root.collection('trusted').doc(`start-${prior.id}`)) : null;
      if(!request.data?.restart && priorProof?.exists && !priorProof.data().completed && priorProof.data().category===category && now-millis(priorProof.data().startedAt)<28800000) return {sessionId:prior.id,resumed:true};
      const previousRef=lease.id ? root.collection('trusted').doc(`start-${lease.id}`) : null;
      const previous=previousRef ? await tx.get(previousRef) : null;
      const rate=rateSnap.data()||{}, count=rate.dayKey===dayKey()?number(rate.count):0;
      if(count>=100) throw new HttpsError('resource-exhausted','Daily session limit reached.');
      const id=randomBytes(16).toString('hex');
      const proof={id,category,context,startedAt:Timestamp.now(),seenAt:now,running:true,verifiedSeconds:0,daySeconds:{},completed:false,version:2};
      // Starting another context pauses the previous proof. It preserves its
      // record while ensuring that two timers never earn the same wall time.
      if(previous?.exists && !previous.data().completed) tx.update(previousRef,{...accrue(previous.data(),now),running:false,seenAt:now});
      tx.set(root.collection('trusted').doc(`start-${id}`),proof);
      tx.set(pointer,{id,startedAt:proof.startedAt});
      tx.set(lock,{id,category,context,seenAt:now});
      tx.set(day.ref,day.daily,{merge:true});
      tx.set(root.collection('trusted').doc('sessionRate'),{dayKey:dayKey(),count:count+1});
      return {sessionId:id,resumed:false};
    });
  });
  const accrue = (proof,now) => {
    const days={...proof.daySeconds};
    const accounted=Object.values(days).reduce((sum,value)=>sum+number(value),0);
    const missing=Math.max(0,number(proof.verifiedSeconds)-accounted);
    const originalDay=dayKey(new Date(millis(proof.startedAt)||now));
    if(missing) days[originalDay]=number(days[originalDay])+missing;
    if(proof.running) {
      let start=number(proof.seenAt), end=Math.min(now,start+90000);
      while(start<end) {
        const key=dayKey(new Date(start)), boundary=Date.parse(`${key}T00:00:00+05:00`)+86400000;
        const stop=Math.min(end,boundary);
        days[key]=number(days[key])+(stop-start)/1000; start=stop;
      }
    }
    return {verifiedSeconds:Object.values(days).reduce((sum,value)=>sum+number(value),0),daySeconds:days};
  };
  const updateStudySessionState = onCall(async request => {
    const uid=auth(request), {sessionId,state}=request.data||{};
    if(!/^[a-f0-9]{32}$/.test(sessionId)||!['pause','resume','heartbeat'].includes(state)) throw new HttpsError('invalid-argument','Invalid session update.');
    return db.runTransaction(async tx=>{
      const root=userRef(uid), ref=root.collection('trusted').doc(`start-${sessionId}`), lock=root.collection('trusted').doc('focusLease');
      const [snap,lease]=await Promise.all([tx.get(ref),tx.get(lock)]), proof=snap.data(), now=Date.now();
      if(!proof||proof.completed||proof.version!==2||now-millis(proof.startedAt)>28800000) throw new HttpsError('failed-precondition','Start a new study session.');
      if(lease.data()?.id!==sessionId && now-number(lease.data()?.seenAt)<90000) throw new HttpsError('failed-precondition','Another timer is active.');
      // An expired/superseded lease never accrues abandoned time.
      const accrued=accrue(lease.data()?.id===sessionId?proof:{...proof,running:false},now);
      tx.update(ref,{...accrued,seenAt:now,running:state==='pause'?false:state==='resume'?true:proof.running});
      tx.set(lock,{id:sessionId,category:proof.category,context:proof.context,seenAt:state==='pause'?0:now});
      return {verifiedSeconds:Math.floor(accrued.verifiedSeconds)};
    });
  });
  const completeStudySession = onCall(async request => {
    const uid=auth(request), {sessionId,duration,subject}=request.data||{};
    if(!/^[a-f0-9]{32}$/.test(sessionId)||!Number.isFinite(duration)||duration<60||duration>28800||typeof subject!=='string'||subject.length>200) throw new HttpsError('invalid-argument','Invalid study session.');
    return db.runTransaction(async tx=>{
      const root=userRef(uid), sessionRef=root.collection('studySessions').doc(sessionId), lock=root.collection('trusted').doc('focusLease');
      let ref=root.collection('trusted').doc(`start-${sessionId}`);
      let [proofSnap,saved,lease]=await Promise.all([tx.get(ref),tx.get(sessionRef),tx.get(lock)]);
      if(saved.exists) {
        const ledger=await tx.get(root.collection('progressEvents').doc(`session-${sessionId}`));
        return {sessionId,...(ledger.data()?.result||{xpDelta:0,status:'unverified'})};
      }
      if(!proofSnap.exists) {ref=root.collection('trusted').doc('activeSession');proofSnap=await tx.get(ref);}
      const proof=proofSnap.data(), now=Date.now();
      if(!proof || proof.id!==sessionId || proof.completed || now-millis(proof.startedAt)>28800000) throw new HttpsError('failed-precondition','Start an online study session first.');
      if(proof.version!==2) {
        // Finish an already-running pre-upgrade timer without fabricating v2
        // verification or losing its recorded history. There is no XP backfill.
        const seconds=Math.min(Math.floor(duration),Math.max(0,Math.floor((now-millis(proof.startedAt))/1000)));
        if(seconds<60) throw new HttpsError('failed-precondition','Record at least one minute.');
        tx.create(sessionRef,{userId:uid,duration:seconds,recordedDuration:Math.floor(duration),verifiedDuration:0,subject,category:proof.category,timestamp:new Date(now).toISOString(),verified:false,status:'unverified',xpEarned:0,progressionVersion:2,syncStatus:'synced'});
        tx.update(ref,{completed:true});
        return {sessionId,duration:seconds,recordedDuration:Math.floor(duration),xpDelta:0,sourceXp:0,status:'unverified'};
      }
      const accrued=accrue(lease.data()?.id===sessionId?proof:{...proof,running:false},now);
      const seconds=Math.min(Math.floor(duration),Math.floor(accrued.verifiedSeconds));
      if(seconds<60) throw new HttpsError('failed-precondition','At least one verified minute is needed to save a server session. Your timer can continue.');
      const at=new Date(now).toISOString();
      // Legacy revision/quiz timers keep their study records, but are not an XP source.
      let result={xpDelta:0,sourceXp:0,status:'unverified'};
      const prepared=[];
      if(proof.category==='focus') {
        let remaining=seconds, sessionCap=20, carry=0, previous;
        const parts=Object.entries(accrued.daySeconds).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>{
          const duration=Math.min(remaining,number(value));remaining-=duration;return {key,duration};
        }).filter(part=>part.duration>0);
        for(let i=0;i<parts.length;i++) {
          const part=parts[i], minutes=Math.floor((carry+part.duration)/60);carry=(carry+part.duration)%60;
          const id=parts.length===1?`session-${sessionId}`:`session-${sessionId}-${part.key}`;
          const item=await prepareAward(tx,uid,event('focus',id,{duration:part.duration,dayKey:part.key,reference:sessionId,sessionEligible:seconds>=300,focusXpRequested:Math.min(sessionCap,minutes),countSession:i===parts.length-1,longSession:i===parts.length-1&&seconds>=1500}),previous);
          prepared.push(item);previous=item.patch;sessionCap-=item.result.sourceXp;
        }
        const last=prepared.at(-1).result;
        result={...last,eventId:`session-${sessionId}`,xpDelta:prepared.reduce((sum,p)=>sum+p.result.xpDelta,0),sourceXp:prepared.reduce((sum,p)=>sum+p.result.sourceXp,0),bonusXp:prepared.reduce((sum,p)=>sum+p.result.bonusXp,0),unlocked:prepared.flatMap(p=>p.result.unlocked)};
      }
      // Multi-day preparation above completes all reads before any writes.
      prepared.forEach(item=>item.commit());
      if(prepared.length>1) tx.set(root.collection('progressEvents').doc(`session-${sessionId}`),{type:'session_receipt',status:'processed',processedAt:FieldValue.serverTimestamp(),result});
      tx.create(sessionRef,{userId:uid,duration:seconds,recordedDuration:Math.floor(duration),verifiedDuration:seconds,subject,category:proof.category,timestamp:at,createdAt:FieldValue.serverTimestamp(),verified:true,progressionVersion:2,xpEarned:result.sourceXp||0,xpDelta:result.xpDelta,syncStatus:'synced'});
      tx.update(ref,{completed:true,running:false,verifiedSeconds:seconds,daySeconds:accrued.daySeconds});
      if(lease.data()?.id===sessionId) tx.set(lock,{id:sessionId,seenAt:0});
      return {sessionId,duration:seconds,recordedDuration:Math.floor(duration),...result};
    });
  });
  const startRecallSession = onCall(async request => {
    const uid=auth(request), {deckId,cardIds,mode,sessionId}=request.data||{};
    if(!idValid(deckId)||!idValid(sessionId)||!['type','choice','match','missing','listen','learn'].includes(mode)||!Array.isArray(cardIds)||!cardIds.length||cardIds.length>200||!cardIds.every(idValid)) throw new HttpsError('invalid-argument','Choose an active recall mode and saved cards.');
    return db.runTransaction(async tx=>{
      const root=userRef(uid), proofRef=root.collection('trusted').doc(`recall-${hash(sessionId)}`);
      const [prior,day,...cards]=await Promise.all([tx.get(proofRef),prepareDay(tx,uid),...cardIds.map(id=>tx.get(root.collection('decks').doc(deckId).collection('cards').doc(id)))]);
      if(prior.exists) {
        if(prior.data().dayKey!==dayKey()||prior.data().deckId!==deckId||prior.data().mode!==mode) throw new HttpsError('failed-precondition','Start a new recall session.');
        return {proofId:hash(sessionId)};
      }
      const fingerprints={};
      cards.forEach((snap,i)=>{
        const card=snap.data();
        if(!card || card.deleted || !String(card.front||'').trim() || !String(card.back||'').trim()) throw new HttpsError('failed-precondition','Save the cards online before earning recall XP.');
        // Equal content across duplicate/imported decks counts as the same card.
        const normalize=v=>String(v).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
        fingerprints[cardIds[i]]=hash(`${normalize(card.front)}\n${normalize(card.back)}`);
      });
      tx.set(proofRef,{deckId,mode,fingerprints,dayKey:dayKey(),startedAt:Date.now(),version:2});
      tx.set(day.ref,day.daily,{merge:true});
      return {proofId:hash(sessionId)};
    });
  });
  const submitRecallAttempt = onCall(async request => {
    const uid=auth(request), {proofId,cardId,answer}=request.data||{};
    if(!/^[a-f0-9]{64}$/.test(proofId)||!idValid(cardId)||typeof answer!=='string'||!answer.trim()||answer.length>4000) throw new HttpsError('invalid-argument','An active answer is required.');
    return db.runTransaction(async tx=>{
      const root=userRef(uid), proofRef=root.collection('trusted').doc(`recall-${proofId}`), proofSnap=await tx.get(proofRef), proof=proofSnap.data();
      if(!proof||proof.version!==2||proof.dayKey!==dayKey()||!Object.hasOwn(proof.fingerprints,cardId)) throw new HttpsError('failed-precondition','This recall proof expired. Start a new online session.');
      const fingerprint=proof.fingerprints[cardId], id=`recall-v2-${proof.dayKey}-${fingerprint}`;
      const lifetime=root.collection('recallEvidence').doc(fingerprint);
      const identity=hash(`${proof.deckId}/${cardId}`);
      const identityRef=root.collection('recallEvidence').doc(`card-${identity}`);
      const dailyRef=root.collection('recallEvidence').doc(`day-${proof.dayKey}-${identity}`);
      const [seen,prior,knownCard,dailyCard]=await Promise.all([tx.get(lifetime),tx.get(root.collection('progressEvents').doc(id)),tx.get(identityRef),tx.get(dailyRef)]);
      if(prior.data()?.processedAt) return prior.data().result;
      if(dailyCard.exists) return dailyCard.data().result;
      const count=number(proof.acceptedCount);
      if(Date.now()-proof.startedAt<(count+1)*2000) throw new HttpsError('failed-precondition','Take time to attempt each card before submitting.');
      const result=await award(tx,uid,event('recall',id,{reference:proofId,newCards:1,newLifetimeCards:seen.exists||knownCard.exists?0:1}));
      if(!seen.exists) tx.create(lifetime,{firstSeenAt:FieldValue.serverTimestamp(),fingerprint});
      if(!knownCard.exists) tx.create(identityRef,{firstSeenAt:FieldValue.serverTimestamp()});
      tx.create(dailyRef,{result});
      tx.update(proofRef,{acceptedCount:count+1});
      return result;
    });
  });
  async function processLegacyEvent(uid,id) {
    const ref=userRef(uid).collection('progressEvents').doc(id);
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists||snap.data().processedAt) return;
      // Old client proposals are retained for audit, never promoted to proof.
      tx.set(ref,{status:'rejected',rejectionReason:'verified_v2_proof_required',processedAt:FieldValue.serverTimestamp()},{merge:true});
    });
  }
  return {award,processLegacyEvent,api:{checkInProgress,updateDailyGoalTarget,startStudySession,updateStudySessionState,completeStudySession,startRecallSession,submitRecallAttempt}};
};
