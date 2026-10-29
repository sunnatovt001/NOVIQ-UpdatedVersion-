import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createCanonicalStore,mongoQuery,FieldValue,Timestamp} from '../src/canonicalStore.mjs';
import {createDocumentPolicy} from '../src/documentPolicy.mjs';
import {createMongoDataApi} from '../src/mongoDataApi.mjs';
import {canonicalMemory} from './helpers/canonicalMemory.mjs';
const fixture=()=>{const f=canonicalMemory();return {...f,store:createCanonicalStore({getDatabase:async()=>f.db,transaction:f.transaction})};};
test('Mongo document transactions preserve CAS, nested fields, immutable tombstones and trigger delivery',async()=>{
  const f=fixture(),ref=f.store.doc('users/a/notebookNotes/n');
  await ref.create({title:'Original',settings:{a:1,b:2}});const original=await ref.get();
  assert.equal(original.exists,true);assert.equal(original.version,1);
  const results=await Promise.allSettled(['First','Second'].map(title=>f.store.commit([{path:ref.path,kind:'update',data:{title}}],{reads:[{path:ref.path,version:1}]})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'aborted');
  await ref.set({settings:{a:3}},{merge:true});assert.deepEqual((await ref.get()).data().settings,{a:3,b:2});
  await ref.update({'settings.b':FieldValue.delete()});assert.deepEqual((await ref.get()).data().settings,{a:3});
  const title=(await ref.get()).data().title;await ref.delete();assert.equal((await ref.get()).exists,false);
  assert.equal(f.table('mongo_documents').get(ref.path).data.title,title);
  assert.equal((await f.store.collection('users/a/notebookNotes').get()).size,0);
  assert.ok(f.table('mongo_trigger_jobs').size>=4);
});
test('a failed authorization rolls back the whole multi-document commit and all queued jobs',async()=>{
  const f=fixture();await f.store.doc('users/a').set({uid:'a',xp:0});
  const count=f.table('mongo_trigger_jobs').size;
  await assert.rejects(f.store.commit([{path:'users/a/notebookNotes/n',kind:'set',data:{title:'Should roll back'}},
    {path:'users/a',kind:'update',data:{xp:999}}],{authorize:input=>createDocumentPolicy({uid:'a',lookup:input.lookup}).canWrite(input)}),{code:'permission-denied'});
  assert.equal((await f.store.doc('users/a/notebookNotes/n').get()).exists,false);
  assert.equal((await f.store.doc('users/a').get()).data().xp,0);assert.equal(f.table('mongo_trigger_jobs').size,count);
});
test('query cursors preserve duplicate order values and reject operator/field injection',async()=>{
  const f=fixture();for(const id of ['c','a','b'])await f.store.doc(`users/a/tutorMessages/${id}`).set({createdAt:10,role:'user'});
  const query=f.store.collection('users/a/tutorMessages').orderBy('createdAt','desc').limit(2);
  const first=await query.get();assert.deepEqual(first.docs.map(d=>d.id),['c','b']);
  const next=await query.startAfter(first.docs.at(-1)).get();assert.deepEqual(next.docs.map(d=>d.id),['a']);
  assert.throws(()=>mongoQuery({path:'users/a/tutorMessages',filters:[{kind:'where',field:'$where',op:'==',value:'x'}]}));
  assert.throws(()=>mongoQuery({path:'users/a/tutorMessages',filters:[{kind:'where',field:'role',op:'$where',value:'x'}]}));
  assert.throws(()=>mongoQuery({path:'users/a/tutorMessages',limit:1001}));
});
test('HTTP data API protects owner reads/writes, rejects forged identity and prevents cross-owner readset version probes',async t=>{
  const f=fixture();await f.store.doc('users/a').set({uid:'a',xp:10,isAdmin:false});await f.store.doc('users/b').set({uid:'b',xp:77,isAdmin:false});
  const handler=createMongoDataApi({store:f.store,origins:['https://app.invalid'],verify:async token=>token==='verified-a'?{uid:'a'}:null});
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const call=(body,token='verified-a',origin='https://app.invalid')=>fetch(`http://127.0.0.1:${server.address().port}`,{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await call({operation:'get',path:'users/a'})).status,200);
  assert.equal((await call({operation:'get',path:'users/b'})).status,403);
  assert.equal((await call({operation:'get',path:'users/a'},'forged')).status,401);
  assert.equal((await call({operation:'get',path:'users/a'},'verified-a','https://evil.invalid')).status,403);
  assert.equal((await call({operation:'commit',writes:[{path:'users/a',kind:'update',data:{xp:999}}]})).status,403);
  for(const version of [1,2,null])assert.equal((await call({operation:'commit',writes:[],reads:[{path:'users/b',version}]})).status,403);
  assert.equal((await call({operation:'query',query:{path:'users/b/notebookNotes'}})).status,403);
  assert.equal((await call({operation:'commit',writes:[{path:'users/a/notebookNotes/n',kind:'set',data:{title:'Saved'}}]})).status,200);
  assert.equal((await f.store.doc('users/a').get()).data().xp,10);
});

test('legacy mixed timestamps and strings retain Firestore ordering across cursor pages and limited aggregates',async()=>{
  const f=fixture(),collection=f.store.collection('users/a/tutorMessages');
  await collection.doc('timestamp1').create({at:new Timestamp(200,1)});
  await collection.doc('timestamp2').create({at:new Timestamp(200,2)});
  await collection.doc('string').create({at:'2026-01-01'});
  await collection.doc('missing').create({text:'excluded by orderBy'});
  const first=await collection.orderBy('at','desc').limit(2).get();
  assert.deepEqual(first.docs.map(doc=>doc.id),['string','timestamp2']);
  const cursor=collection.orderBy('at','desc').startAfter(first.docs.at(-1)).limit(2);
  assert.deepEqual((await cursor.get()).docs.map(doc=>doc.id),['timestamp1']);
  assert.equal((await cursor.count().get()).data().count,1);
});
