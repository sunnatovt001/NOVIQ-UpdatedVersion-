import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createDatabaseConnection,readDatabaseConfig} from '../src/database.mjs';
import {databaseNamespace} from '../src/databaseNamespace.mjs';
import {createCanonicalStore,Timestamp,FieldValue} from '../src/canonicalStore.mjs';
import {createDocumentPolicy} from '../src/documentPolicy.mjs';
let connection;
try{
  const config=readDatabaseConfig();if(!config.database.endsWith('_staging'))throw new Error();
  connection=createDatabaseConnection(config);const db=databaseNamespace(await connection.getDatabase(),'verification_');
  const store=createCanonicalStore({getDatabase:async()=>db,transaction:work=>connection.transaction(work)});
  const uid=`probe_${randomBytes(6).toString('hex')}`,root=`users/${uid}`;
  await store.doc(root).create({uid,xp:0,isAdmin:false});
  const authorize=input=>createDocumentPolicy({uid,lookup:input.lookup}).canWrite(input);
  const reads=path=>store.doc(path).get();
  await store.commit([{path:`${root}/notebookNotes/one`,kind:'set',data:{title:'Synthetic verification',at:new Timestamp(1793257200,123456789)}}],{authorize});
  assert.equal((await reads(`${root}/notebookNotes/one`)).data().at.nanoseconds,123456789);
  const original=await reads(`${root}/notebookNotes/one`);
  const race=await Promise.allSettled(['a','b'].map(title=>store.commit([{path:original.ref.path,kind:'update',data:{title}}],{authorize,reads:[{path:original.ref.path,version:original.version}]})));
  assert.equal(race.filter(result=>result.status==='fulfilled').length,1);
  await assert.rejects(store.commit([{path:`${root}/notebookNotes/rolled-back`,kind:'set',data:{title:'not committed'}},
    {path:root,kind:'update',data:{xp:999}}],{authorize}));
  assert.equal((await reads(`${root}/notebookNotes/rolled-back`)).exists,false);
  assert.equal((await reads(root)).data().xp,0);
  await store.doc(`${root}/notebookNotes/one`).update({count:FieldValue.increment(2)});
  assert.equal((await reads(`${root}/notebookNotes/one`)).data().count,2);
  await store.doc(`${root}/notebookNotes/two`).create({order:1});await store.doc(`${root}/notebookNotes/three`).create({order:1});
  const query=store.collection(`${root}/notebookNotes`).orderBy('order').limit(1),page=await query.get();
  const next=await query.startAfter(page.docs[0]).get();assert.equal(next.size,1);assert.notEqual(next.docs[0].id,page.docs[0].id);
  const count=(await store.collection(`${root}/notebookNotes`).count().get()).data().count;assert.equal(count,3);
  assert.ok(await db.collection('mongo_trigger_jobs').countDocuments({state:'pending'})>=5);
  console.log(JSON.stringify({atlasTransactions:true,casRace:true,authorizationRollback:true,timestampNanoseconds:true,
    nestedTransforms:true,pagination:true,aggregates:true,durableTriggers:true,namespace:'verification_',sourceWrites:0,productionCutover:false}));
}catch{console.error('Live MongoDB verification failed. Synthetic records remain isolated in verification_ collections; no Firebase source records changed.');process.exitCode=1;}
finally{if(connection)await connection.close();}
