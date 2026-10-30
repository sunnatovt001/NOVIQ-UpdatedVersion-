import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentPolicy} from '../src/documentPolicy.mjs';
import {scalarOrderKey,documentOrderKeys} from '../src/documentOrder.mjs';
import {createCanonicalStore,compareDocumentValues,Timestamp} from '../src/canonicalStore.mjs';
import {canonicalMemory} from './helpers/canonicalMemory.mjs';

test('retired room documents and collection queries are denied even to authenticated owners and admins',async()=>{
  for(const claims of [{},{admin:true}]){
    const policy=createDocumentPolicy({uid:'owner',claims,lookup:async()=>({userId:'owner',isAdmin:true})});
    assert.equal(await policy.canRead('accountabilityRooms/private/messages/message',{userId:'owner'}),false);
    assert.equal(await policy.canQuery({path:'accountabilityRooms/private/messages'}),false);
    assert.equal(await policy.canWrite({path:'accountabilityRooms/private/messages/message',before:null,after:{userId:'owner'},now:new Date()}),false);
  }
});

test('normalized scalar keys preserve mixed types, negative numbers, timestamp precision and string prefixes',()=>{
  const values=[null,false,true,-Number.MAX_VALUE,-100,-1,-Number.MIN_VALUE,0,Number.MIN_VALUE,1,100,Number.MAX_VALUE,
    new Timestamp(-1,0),new Timestamp(0,0),new Timestamp(0,1),'','\0','\0a','a','aa','b','é','😀'];
  for(const a of values)for(const b of values){
    const ka=scalarOrderKey(a),kb=scalarOrderKey(b);
    assert.equal(Math.sign(ka<kb?-1:ka>kb?1:0),Math.sign(compareDocumentValues(a,b)),`${String(a)} vs ${String(b)}`);
  }
  assert.equal(scalarOrderKey({a:1}),null);
});

test('scalar cursor pages work past 10,000 candidates and return only the requested page',async()=>{
  const f=canonicalMemory(),store=createCanonicalStore({getDatabase:async()=>f.db,transaction:f.transaction});
  for(let n=0;n<12050;n++){
    const data={createdAt:n},path=`users/a/tutorMessages/${String(n).padStart(6,'0')}`;
    f.table('mongo_documents').set(path,{_id:path,parent:'users/a/tutorMessages',collectionGroup:'tutorMessages',id:path.split('/').at(-1),deleted:false,version:1,data,sortKeys:documentOrderKeys(data)});
  }
  const query=store.collection('users/a/tutorMessages').orderBy('createdAt','desc').limit(50);
  const first=await query.get(),second=await query.startAfter(first.docs.at(-1)).get();
  assert.equal(first.size,50);assert.equal(first.docs[0].data().createdAt,12049);
  assert.equal(second.size,50);assert.equal(second.docs[0].data().createdAt,11999);
  // Legacy metadata absence uses bounded-memory comparison without a 10k cliff.
  for(const row of f.table('mongo_documents').values())delete row.sortKeys;
  assert.deepEqual((await query.get()).docs.map(doc=>doc.id),first.docs.map(doc=>doc.id));
});
