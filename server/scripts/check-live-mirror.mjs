import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {createDatabaseConnection,readDatabaseConfig} from '../src/database.mjs';
import {databaseNamespace} from '../src/databaseNamespace.mjs';
import {enqueueMirrorRecord,readMirrorKey,createFirestoreMirrorSink,verifyMirrorBackup} from '../src/firebaseMirror.mjs';
let connection,firestore,stage='configuration';
try{
  const config=readDatabaseConfig();if(config.database!=='noviq_staging')throw new Error('Unexpected database.');
  stage='firebase-authorization';const cloud=await createRequire(import.meta.url)('../../scripts/cloud-client.cjs')(process.argv[2]);firestore=cloud.db;
  connection=createDatabaseConnection(config);const db=databaseNamespace(await connection.getDatabase(),'verification_');
  const key=readMirrorKey(process.env.FIREBASE_MIRROR_ENCRYPTION_KEY),id=`mirror_probe_${randomBytes(6).toString('hex')}`;
  const records=[0,1].map(i=>({_id:`users/${id}/notebookNotes/${i}`,data:{title:'Synthetic backup verification',count:i},version:1,deleted:false}));
  stage='enqueue';for(const row of records)await connection.transaction(session=>enqueueMirrorRecord(db,'mongo_documents',row,{key,session}));
  const events=await db.collection('firebase_mirror_outbox').find({state:'pending'}).toArray();
  // Select by the canonical SHA-256 entity identity, never decrypt unrelated rows.
  const {createHash}=await import('node:crypto');const {BSON}=await import('mongodb');
  const entities=new Set(records.map(row=>createHash('sha256').update(BSON.EJSON.stringify(['mongo_documents',row._id])).digest('hex')));
  const batch=events.filter(event=>entities.has(event.entityId));assert.equal(batch.length,2);
  const namespace='noviq_migration_verification',sink=createFirestoreMirrorSink(firestore,namespace);
  stage='firebase-delivery';await sink.batch(batch);
  for(const event of batch){
    const root=firestore.collection('mongoBackupNamespaces').doc(namespace);
    const manifest=(await root.collection('records').doc(event.entityId).get()).data();
    const chunks=await Promise.all(Array.from({length:manifest.chunks},(_,i)=>root.collection('chunks').doc(`${event._id}:${i}`).get()));
    stage='read-back-verification';const restored=verifyMirrorBackup(manifest,chunks.map(chunk=>chunk.data()),key,event.entityId);
    assert.deepEqual(restored.record,records.find(row=>row._id===restored.record._id));
    await db.collection('firebase_mirror_outbox').updateOne({_id:event._id},{$set:{state:'delivered',deliveredAt:new Date()}});
  }
  console.log(JSON.stringify({encryptedBackupWritten:true,firebaseReadBack:true,decryptionAndIdentityVerified:true,records:2,namespace,sourceApplicationRecordsChanged:false}));
}catch(error){console.error(JSON.stringify({verificationFailed:true,stage,code:error.code||'verification-failed',sourceApplicationRecordsChanged:false}));process.exitCode=1;}
finally{if(connection)await connection.close();if(firestore)await firestore.terminate();}
