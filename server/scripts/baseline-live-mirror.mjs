import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {BSON} from 'mongodb';
import assert from 'node:assert/strict';
import {createDatabaseConnection,readDatabaseConfig} from '../src/database.mjs';
import {readMirrorKey,sealMirrorRecord,openMirrorRecord,createFirestoreMirrorSink,verifyMirrorBackup} from '../src/firebaseMirror.mjs';
let connection,firestore;
try{
  if(!process.argv.includes('--execute'))throw new Error('Explicit execution required.');
  const config=readDatabaseConfig();if(config.database!=='noviq_staging'||process.env.MONGODB_COLLECTION_PREFIX)throw new Error('Unexpected baseline target.');
  connection=createDatabaseConnection(config);const db=await connection.getDatabase();
  const baseline=await db.collection('mongo_baselines').findOne({_id:process.argv[3]});
  if(!baseline?.verified||baseline.prefix!=='')throw new Error('Verified main baseline required.');
  const rows=await db.collection('mongo_documents').find({sourceSnapshot:baseline._id}).toArray();assert.equal(rows.length,baseline.documents);
  if(rows.some(row=>row.version!==1||row.deleted))throw new Error('Application has already changed baseline records.');
  const key=readMirrorKey(process.env.FIREBASE_MIRROR_ENCRYPTION_KEY),events=rows.map(row=>{
    const entityId=createHash('sha256').update(BSON.EJSON.stringify(['mongo_documents',row._id])).digest('hex');
    return {_id:`${entityId}:1`,entityId,sequence:1,envelope:sealMirrorRecord({collection:'mongo_documents',record:row},key,entityId,1),state:'pending',attempts:0,createdAt:new Date(),nextAttemptAt:new Date()};
  });
  for(let offset=0;offset<events.length;offset+=100){
    const batch=events.slice(offset,offset+100);
    await connection.transaction(async session=>{
      await db.collection('firebase_mirror_counters').bulkWrite(batch.map(event=>({updateOne:{filter:{_id:event.entityId},update:{$setOnInsert:{sequence:1}},upsert:true}})),{session});
      const counters=await db.collection('firebase_mirror_counters').find({_id:{$in:batch.map(e=>e.entityId)}},{session}).toArray();
      if(counters.length!==batch.length||counters.some(row=>row.sequence!==1))throw new Error('Concurrent baseline change detected.');
      await db.collection('firebase_mirror_outbox').bulkWrite(batch.map(event=>({updateOne:{filter:{_id:event._id},update:{$setOnInsert:event},upsert:true}})),{session});
    });
  }
  console.log(JSON.stringify({baselineQueued:events.length,snapshotId:baseline._id}));
  if(!process.argv.includes('--queue-only')){
  const saved=await db.collection('firebase_mirror_outbox').find({_id:{$in:events.map(event=>event._id)}}).toArray();
  const byId=new Map(saved.map(event=>[event._id,event]));
  for(let i=0;i<events.length;i++){const persisted=byId.get(events[i]._id);if(!persisted)throw new Error('Queued baseline missing.');events[i]=persisted;}
  const cloud=await createRequire(import.meta.url)('../../scripts/cloud-client.cjs')(process.argv[2]);firestore=cloud.db;
  const sink=createFirestoreMirrorSink(firestore,config.database),root=firestore.collection('mongoBackupNamespaces').doc(config.database);
  let verified=0;
  for(let offset=0;offset<events.length;){
    const batch=[];let size=0;
    while(offset<events.length&&batch.length<40){
      const event=events[offset],bytes=JSON.stringify(event.envelope).length;
      if(batch.length&&size+bytes>5*1024*1024)break;
      batch.push(event);size+=bytes;offset++;
    }
    await sink.batch(batch);
    const manifests=await firestore.getAll(...batch.map(event=>root.collection('records').doc(event.entityId)));
    const references=manifests.flatMap(snapshot=>{const manifest=snapshot.data();return Array.from({length:manifest.chunks},(_,index)=>root.collection('chunks').doc(`${manifest.eventId}:${index}`));});
    const allChunks=await firestore.getAll(...references);let chunkOffset=0;
    for(let i=0;i<batch.length;i++){
      const event=batch[i],manifest=manifests[i].data();
      const chunks=allChunks.slice(chunkOffset,chunkOffset+manifest.chunks);chunkOffset+=manifest.chunks;
      const restored=verifyMirrorBackup(manifest,chunks.map(chunk=>chunk.data()),key,event.entityId);
      assert.equal(manifest.sequence,1);assert.deepEqual(restored,openMirrorRecord(event.envelope,key,event.entityId,1));verified++;
    }
    await db.collection('firebase_mirror_outbox').updateMany({_id:{$in:batch.map(event=>event._id)},state:'pending'},{$set:{state:'delivered',deliveredAt:new Date()}});
    if(verified%200<40)console.log(JSON.stringify({backupVerified:verified,total:events.length}));
  }
  await db.collection('firebase_mirror_baselines').updateOne({_id:baseline._id},{$setOnInsert:{records:verified,verifiedAt:new Date(),namespace:config.database,verified:true}},{upsert:true});
  console.log(JSON.stringify({complete:true,records:verified,encrypted:true,readBackVerified:true,sourceApplicationRecordsChanged:false}));
  }
}catch(error){console.error(JSON.stringify({baselineBackupFailed:true,code:error.code||'verification-failed',pendingRetained:true}));process.exitCode=1;}
finally{if(connection)await connection.close();if(firestore)await firestore.terminate();}
