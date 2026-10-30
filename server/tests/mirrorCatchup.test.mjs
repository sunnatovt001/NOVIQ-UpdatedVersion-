import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BSON} from 'mongodb';
import {catchUpMirror,selectCatchupBatch} from '../src/mirrorCatchup.mjs';
import {sealMirrorRecord,createFirestoreMirrorSink} from '../src/firebaseMirror.mjs';
const key=Buffer.alloc(32,7);
function event(id,sequence=1){
 const record={_id:`users/synthetic/notebookNotes/${id}`,data:{title:'Synthetic backup'},version:sequence};
 const entityId=createHash('sha256').update(BSON.EJSON.stringify(['mongo_documents',record._id])).digest('hex');
 return {_id:`${entityId}:${sequence}`,entityId,sequence,state:'pending',createdAt:new Date(0),nextAttemptAt:new Date(0),envelope:sealMirrorRecord({collection:'mongo_documents',record},key,entityId,sequence)};
}
function fixture(events,{busy=false,tamper=false}={}){
 const rows=new Map(events.map(e=>[e._id,structuredClone(e)])),records=new Map();let acknowledgments=0,deliveries=0;
 const queue={
  find(){let count=0;const cursor={sort(){return cursor;},limit(n){count=n;return cursor;},maxTimeMS(){return cursor;},async toArray(){return [...rows.values()].filter(e=>e.state==='pending').slice(0,count);}};return cursor;},
  async findOne(query){return [...rows.values()].find(e=>Object.entries(query).every(([k,v])=>e[k]===v));},
  async updateMany(query,update){for(const id of query._id.$in){Object.assign(rows.get(id),update.$set);acknowledgments++;}},
  async countDocuments(){return [...rows.values()].filter(e=>e.state==='pending').length;},
 };
 const states={async updateOne(){return {matchedCount:1};},async findOneAndUpdate(){return busy?null:{_id:'sink'};}};
 const db={collection(name){assert.ok(['firebase_mirror_state','firebase_mirror_outbox'].includes(name),'Application collections must not be accessed');return name==='firebase_mirror_state'?states:queue;}};
 let firestore;
 const ref=path=>({path,get firestore(){return firestore;},collection:name=>ref(`${path}/${name}`),doc:id=>ref(`${path}/${id}`)});
 const snapshot=r=>({exists:records.has(r.path),data:()=>{const value=records.get(r.path);return tamper&&r.path.includes('/chunks/')?{...value,ciphertextChunk:'corrupt'}:value;}});
 firestore={collection:name=>ref(name),getAll:async(...refs)=>refs.map(snapshot),async runTransaction(work){
  const staged=[];await work({getAll:async(...refs)=>refs.map(snapshot),set:(r,value)=>staged.push([r.path,value])});
  for(const [path,value]of staged)records.set(path,value);deliveries++;
 }};
 const root=firestore.collection('mongoBackupNamespaces').doc('noviq_staging');
 return {db,root,sink:createFirestoreMirrorSink(firestore,'noviq_staging'),key,rows,records,get acknowledgments(){return acknowledgments;},get deliveries(){return deliveries;}};
}

test('catch-up batches enforce unique identities, event count and a hard write budget',()=>{
 const first=event('a'),duplicate=event('a',2),second=event('b');
 assert.equal(selectCatchupBatch([first,duplicate,second],{remainingEvents:40,remainingWrites:4}).length,2);
 assert.equal(selectCatchupBatch([first,second],{remainingEvents:1,remainingWrites:100}).length,1);
 assert.equal(selectCatchupBatch([first,second],{remainingEvents:40,remainingWrites:2}).length,1);
 assert.throws(()=>selectCatchupBatch([{...first,_id:'forged'}],{remainingEvents:40,remainingWrites:100}));
});

test('catch-up acknowledges only real encrypted read-backs and never touches application collections',async()=>{
 const f=fixture([event('a'),event('b')]);const result=await catchUpMirror({...f,maxWrites:4});
 assert.equal(result.delivered,2);assert.equal(result.pending,0);assert.equal(result.readBackAndDecryptionVerified,2);
 assert.equal(result.applicationRecordsChanged,false);assert.equal(f.acknowledgments,2);
 assert.ok([...f.records.keys()].every(path=>path.startsWith('mongoBackupNamespaces/noviq_staging/')));
});

test('wrong encryption keys or corrupt destination chunks leave source events pending',async()=>{
 for(const mode of ['key','chunks']){
  const f=fixture([event('a')],{tamper:mode==='chunks'});
  await assert.rejects(catchUpMirror({...f,key:mode==='key'?Buffer.alloc(32):key}),/stopped/);
  assert.equal(f.acknowledgments,0);assert.equal(f.rows.values().next().value.state,'pending');
  if(mode==='key')assert.equal(f.deliveries,0);
 }
});

test('an already delivered newer sequence safely supersedes an older pending event',async()=>{
 const older=event('a'),newer={...event('a',2),state:'delivered'};const f=fixture([older,newer]);
 await f.sink.batch([newer]);const result=await catchUpMirror(f);
 assert.equal(result.delivered,1);assert.equal(result.pending,0);
 assert.equal(f.records.get(`mongoBackupNamespaces/noviq_staging/records/${older.entityId}`).sequence,2);
});

test('busy workers defer and bounded catch-up never exceeds its event budget',async()=>{
 const busy=fixture([event('a')],{busy:true});const result=await catchUpMirror(busy);assert.equal(result.deferred,true);assert.equal(busy.deliveries,0);
 const f=fixture([event('a'),event('b')]);const bounded=await catchUpMirror({...f,maxEvents:1});assert.equal(bounded.delivered,1);assert.equal(bounded.pending,1);
 await assert.rejects(catchUpMirror({...f,maxEvents:6001}),/bounds/);
});
