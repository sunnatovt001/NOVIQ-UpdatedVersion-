const { createHash } = require('node:crypto');
const { AggregateField } = require('firebase-admin/firestore');
const VERSION = 1;
const SOURCES = {studySessions:'session',notebookNotes:'note',notebookSources:'source',notebookMessages:'notebookMessage',tutorMessages:'tutorMessage',roadmapTasks:'task',decks:'deck'};
const dateMillis = value => {
  try {
    const date = value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate() : typeof value?.seconds === 'number' ? new Date(value.seconds*1000) : typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  } catch { return null; }
};
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const projectionId = path => createHash('sha256').update(path).digest('hex');
function normalize(kind, data, sourcePath, deckId) {
  const timestamp = dateMillis(kind === 'session' ? data.timestamp : data.createdAt);
  const result = {version:VERSION,kind,sourcePath,createdMillis:timestamp ?? Number.MAX_SAFE_INTEGER};
  if (kind === 'session') {
    const valid = numeric(data.duration) >= 60 && dateMillis(data.timestamp) !== null && !['inProgress','in_progress','pending','cancelled'].includes(String(data.status));
    Object.assign(result,{focusSeconds:valid && data.category === 'focus' ? numeric(data.duration) : 0,xp:numeric(data.xpEarned)});
  } else if (kind === 'card') {
    Object.assign(result,{deckId,dueMillis:dateMillis(data.dueAt) ?? Number.MAX_SAFE_INTEGER,reviewed:numeric(data.reviewCount)>0});
  } else if (kind === 'task') {
    const status=String(data.status || data.state || '').trim().toLowerCase().replace(/[\s-]+/g,'_');
    Object.assign(result,{completed:data.done===true || data.completed===true || ['completed','done'].includes(status),completedMillis:dateMillis(data.completedAt) ?? dateMillis(data.updatedAt) ?? dateMillis(data.createdAt) ?? Number.MAX_SAFE_INTEGER});
  } else if (kind.endsWith('Message')) result.roleUser = data.role === 'user';
  return result;
}
module.exports = ({db,onCall,onDocumentWritten,onDocumentCreated,HttpsError,FieldValue,logger,database}) => {
  const api = {};
  const records = uid => db.collection(`users/${uid}/metricRecords`);
  const state = uid => db.doc(`users/${uid}/trusted/metrics`);
  async function projectCurrent(uid, kind, sourcePath, deckId) {
    const source = db.doc(sourcePath), projected = records(uid).doc(projectionId(sourcePath));
    await db.runTransaction(async tx => {
      const refs = [source,projected];
      if (kind === 'card') refs.push(db.doc(`users/${uid}/decks/${deckId}`));
      const snapshots = await tx.getAll(...refs);
      const exists = snapshots[0].exists && (kind !== 'card' || snapshots[2].exists && snapshots[0].data()?.deleted !== true);
      if (!exists) { if (snapshots[1].exists) tx.delete(projected); return; }
      const next=normalize(kind,snapshots[0].data(),sourcePath,deckId);
      const previous=snapshots[1].data();
      if (!previous || Object.keys(previous).length!==Object.keys(next).length || Object.entries(next).some(([key,value])=>previous[key]!==value)) tx.set(projected,next);
    });
  }
  async function walk(collection, visit) {
    let after;
    while (true) {
      let q=collection.orderBy('__name__').limit(250);
      if (after) q=q.startAfter(after);
      const page=await q.get(); if (!page.docs.length) return;
      // All transaction reads observe the current source, not stale event data.
      for (let offset=0;offset<page.docs.length;offset+=10) await Promise.all(page.docs.slice(offset,offset+10).map(visit));
      after=page.docs.at(-1).id;
    }
  }
  async function backfillUser(uid) {
    await state(uid).set({version:VERSION,ready:false,startedAt:FieldValue.serverTimestamp()},{merge:true});
    for (const [collection,kind] of Object.entries(SOURCES)) {
      await walk(db.collection(`users/${uid}/${collection}`),async document => {
        await projectCurrent(uid,kind,document.ref.path);
        if (kind === 'deck') await walk(document.ref.collection('cards'),card=>projectCurrent(uid,'card',card.ref.path,document.id));
      });
    }
    // Remove stale derived rows after source deletions, without touching sources.
    await walk(records(uid),document=>{
      const data=document.data();
      return projectCurrent(uid,data.kind,data.sourcePath,data.deckId);
    });
    await state(uid).set({version:VERSION,ready:true,completedAt:FieldValue.serverTimestamp()},{merge:true});
  }
  for (const [collection,kind] of Object.entries(SOURCES)) {
    const name=`onMetrics${kind[0].toUpperCase()+kind.slice(1)}Written`;
    api[name]=onDocumentWritten({document:`users/{userId}/${collection}/{recordId}`,database,retry:true,timeoutSeconds:540,memory:'512MiB',maxInstances:2},async event=>{
      const {userId,recordId}=event.params;
      await projectCurrent(userId,kind,`users/${userId}/${collection}/${recordId}`);
      if (kind === 'deck') {
        // Deleting a deck does not delete Firestore subcollections. Count cards
        // only while their owning deck exists; support restoring that same deck.
        await walk(db.collection(`users/${userId}/decks/${recordId}/cards`),card=>projectCurrent(userId,'card',card.ref.path,recordId));
      }
      // Notify clients after derived rows commit. A source listener can fire
      // before its trigger and would otherwise leave the summary stale.
      await state(userId).set({updatedAt:FieldValue.serverTimestamp()},{merge:true});
    });
  }
  api.onMetricsCardWritten=onDocumentWritten({document:'users/{userId}/decks/{deckId}/cards/{recordId}',database,retry:true,maxInstances:2},async event=>{
    await projectCurrent(event.params.userId,'card',`users/${event.params.userId}/decks/${event.params.deckId}/cards/${event.params.recordId}`,event.params.deckId);
    await state(event.params.userId).set({updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
  api.onMetricsUserCreated=onDocumentCreated({document:'users/{userId}',database,retry:true,timeoutSeconds:540,maxInstances:2},event=>backfillUser(event.params.userId));
  api.getActivityMetrics=onCall({timeoutSeconds:60,memory:'256MiB',maxInstances:2},async request=>{
    if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in first.');
    const {start,end}=request.data || {};
    const scoped=start!==undefined || end!==undefined;
    if (scoped && (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>=end || end-start>27*3600000 || Math.abs(start)>8640000000000000 || Math.abs(end)>8640000000000000)) throw new HttpsError('invalid-argument','Invalid statistics date range.');
    const uid=request.auth.uid;
    const ready=await state(uid).get();
    if (ready.data()?.version!==VERSION || ready.data()?.ready!==true) throw new HttpsError('failed-precondition','Statistics are being prepared. Please retry shortly.');
    const target=kind=>records(uid).where('kind','==',kind);
    const scope=(q,field='createdMillis')=>scoped?q.where(field,'>=',start).where(field,'<',end):q;
    const count=async q=>(await q.count().get()).data().count;
    try {
      const [sessions,notes,sources,notebook,tutor,decks,roadmap,created,due,reviewed]=await Promise.all([
        scope(target('session')).aggregate({seconds:AggregateField.sum('focusSeconds'),xp:AggregateField.sum('xp')}).get(),
        count(scope(target('note'))),count(scope(target('source'))),
        count(scope(target('notebookMessage').where('roleUser','==',true))),
        count(scope(target('tutorMessage').where('roleUser','==',true))),
        count(scope(target('deck'))),count(scope(target('task').where('completed','==',true),'completedMillis')),
        count(scope(target('card'))),count(target('card').where('dueMillis','<=',Date.now())),
        count(target('card').where('reviewed','==',true)),
      ]);
      const totals=sessions.data();
      return {focusMinutes:Math.round(totals.seconds/60),notesCreated:notes,sourcesUploaded:sources,notebookMessages:notebook,tutorMessages:tutor,decksCreated:decks,tasksDone:roadmap,flashcardsCreated:created,dueCards:due,reviewedCards:reviewed,...(scoped?{xp:totals.xp}:{}),asOf:Date.now()};
    } catch (error) {logger.error('Activity aggregation failed',{code:error.code,userId:uid});throw new HttpsError('unavailable','Statistics temporarily unavailable. Please retry.');}
  });
  return {api,backfillUser,projectCurrent};
};
module.exports.normalize=normalize;
module.exports.dateMillis=dateMillis;
module.exports.exportNames=[...Object.values(SOURCES).map(kind=>`onMetrics${kind[0].toUpperCase()+kind.slice(1)}Written`),'onMetricsCardWritten','onMetricsUserCreated','getActivityMetrics'];
