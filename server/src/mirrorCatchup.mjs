import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {openMirrorRecord,verifyMirrorBackup} from './firebaseMirror.mjs';

// Only the existing encrypted mirror destination and its delivery bookkeeping
// may change. Never invoke application triggers or modify application records.
export async function catchUpMirror({db,sink,root,key,maxEvents=6000,maxWrites=10000,budgetMs=600000,now=()=>new Date(),onProgress=()=>{}}){
  if(!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>6000||!Number.isInteger(maxWrites)||maxWrites<2||maxWrites>10000)throw new Error('Invalid catch-up bounds.');
  const started=now(),worker=randomBytes(12).toString('hex'),states=db.collection('firebase_mirror_state'),queue=db.collection('firebase_mirror_outbox');
  await states.updateOne({_id:'sink'},{$setOnInsert:{leaseUntil:new Date(0),circuitUntil:new Date(0)}},{upsert:true});
  const lease=await states.findOneAndUpdate({_id:'sink',leaseUntil:{$lte:started},circuitUntil:{$lte:started}},{$set:{worker,leaseUntil:new Date(started.getTime()+180000)}},{returnDocument:'after'});
  if(!lease)return {delivered:0,writes:0,deferred:true};
  let delivered=0,writes=0,failed=false;
  try{
    while(delivered<maxEvents&&now().getTime()-started.getTime()<budgetMs){
      const renewed=await states.updateOne({_id:'sink',worker},{$set:{leaseUntil:new Date(now().getTime()+180000)}});
      if(renewed.matchedCount!==1)throw new Error('Mirror lease lost.');
      const rows=await queue.find({state:'pending',createdAt:{$lte:started},nextAttemptAt:{$lte:now()}}).sort({createdAt:1,_id:1}).limit(400).maxTimeMS(10000).toArray();
      const batch=selectCatchupBatch(rows,{remainingEvents:maxEvents-delivered,remainingWrites:maxWrites-writes});
      if(!batch.length)break;
      // Authenticate the existing source envelopes before any delivery.
      const originals=batch.map(event=>openMirrorRecord(event.envelope,key,event.entityId,event.sequence));
      await sink.batch(batch);
      const manifests=await root.firestore.getAll(...batch.map(event=>root.collection('records').doc(event.entityId)));
      const references=manifests.flatMap(snapshot=>{
        const manifest=snapshot.data();
        if(!Number.isSafeInteger(manifest?.chunks)||manifest.chunks<1||manifest.chunks>60)throw new Error('Backup manifest mismatch.');
        return Array.from({length:manifest.chunks},(_,n)=>root.collection('chunks').doc(`${manifest.eventId}:${n}`));
      });
      const allChunks=await root.firestore.getAll(...references);let chunkOffset=0;
      for(let i=0;i<batch.length;i++){
        const event=batch[i],manifest=manifests[i].data();
        if(!Number.isSafeInteger(manifest?.sequence)||manifest.sequence<event.sequence)throw new Error('Backup manifest mismatch.');
        const chunks=allChunks.slice(chunkOffset,chunkOffset+manifest.chunks);chunkOffset+=manifest.chunks;
        const restored=verifyMirrorBackup(manifest,chunks.map(chunk=>chunk.data()),key,event.entityId);
        let expected=originals[i];
        if(manifest.sequence>event.sequence){
          const newer=await queue.findOne({_id:manifest.eventId,entityId:event.entityId,sequence:manifest.sequence});
          if(!newer)throw new Error('Newer source envelope unavailable.');
          expected=openMirrorRecord(newer.envelope,key,newer.entityId,newer.sequence);
        }
        if(!isDeepStrictEqual(restored,expected))throw new Error('Backup read-back mismatch.');
      }
      // Acknowledge only after every delivered record was read and decrypted.
      await queue.updateMany({_id:{$in:batch.map(event=>event._id)},state:'pending'},{$set:{state:'delivered',deliveredAt:now()}});
      delivered+=batch.length;writes+=batch.reduce((sum,event)=>sum+1+Math.ceil(JSON.stringify(event.envelope).length/250000),0);
      onProgress({delivered,writeUpperBound:writes});
      if(writes>=maxWrites)break;
    }
    const pending=await queue.countDocuments({state:'pending'},{maxTimeMS:10000});
    return {delivered,writeUpperBound:writes,pending,readBackAndDecryptionVerified:delivered,applicationRecordsChanged:false};
  }catch{failed=true;throw new Error('Backup catch-up stopped; unacknowledged events remain pending.');}
  finally{await states.updateOne({_id:'sink',worker},{$set:{leaseUntil:now(),circuitUntil:new Date(now().getTime()+(failed?300000:0))}});}
}

export function selectCatchupBatch(rows,{remainingEvents,remainingWrites}){
  const batch=[],entities=new Set();let bytes=0,writes=0;
  for(const event of rows){
    if(batch.length>=Math.min(40,remainingEvents))break;
    if(!event||event.state!=='pending'||!/^[a-f0-9]{64}$/.test(event.entityId)||!Number.isSafeInteger(event.sequence)||event.sequence<1||event._id!==`${event.entityId}:${event.sequence}`)throw new Error('Invalid mirror event.');
    if(entities.has(event.entityId))continue;
    const size=JSON.stringify(event.envelope).length,cost=1+Math.ceil(size/250000);
    if(size>5*1024*1024)throw new Error('Oversized backup requires separate handling.');
    if(bytes+size>5*1024*1024||writes+cost>remainingWrites)break;
    batch.push(event);entities.add(event.entityId);bytes+=size;writes+=cost;
  }
  return batch;
}
