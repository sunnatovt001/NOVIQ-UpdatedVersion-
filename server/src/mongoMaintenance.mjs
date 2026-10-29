import {getApps,initializeApp,cert} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createFirestoreMirrorSink,deliverMirrorEvent} from './firebaseMirror.mjs';
import {drainMongoTriggers} from './mongoTriggers.mjs';
import source from '../../firebase-applet-config.json' with {type:'json'};
import {randomBytes} from 'node:crypto';
let sink;
export async function runMongoMaintenance({runtime,handlers,triggerLimit=5,mirrorLimit=5,budgetMs=8000}){
  const db=await runtime.getDatabase();
  const triggers=await drainMongoTriggers({db,store:runtime.store,handlers,limit:triggerLimit,budgetMs});
  let delivered=0,failed=0;
  if(process.env.NOVIQ_FIREBASE_MIRROR==='true'){
    const states=db.collection('firebase_mirror_state'),clock=new Date(),worker=randomBytes(12).toString('hex');
    await states.updateOne({_id:'sink'},{$setOnInsert:{leaseUntil:new Date(0),circuitUntil:new Date(0)}},{upsert:true});
    const lease=await states.findOneAndUpdate({_id:'sink',leaseUntil:{$lte:clock},circuitUntil:{$lte:clock}},
      {$set:{worker,leaseUntil:new Date(clock.getTime()+180000)}},{returnDocument:'after'});
    if(!lease)return {triggers,mirror:{delivered,failed,deferred:true}};
    try{
    if(!sink){
      const credential=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'{}');
      if(credential.project_id!==source.projectId)throw new Error('Backup project mismatch.');
      const name='noviq-live-backup';
      const app=getApps().find(app=>app.name===name)||initializeApp({projectId:source.projectId,credential:cert(credential)},name);
      const prefix=process.env.MONGODB_COLLECTION_PREFIX||'';
      sink=createFirestoreMirrorSink(getFirestore(app,source.firestoreDatabaseId),`${process.env.MONGODB_DATABASE}${prefix?`__${prefix}`:''}`);
    }
    const events=await db.collection('firebase_mirror_outbox').find({state:'pending',nextAttemptAt:{$lte:new Date()}})
      .sort({createdAt:1}).limit(mirrorLimit).maxTimeMS(5000).toArray();
    for(const event of events){if((await deliverMirrorEvent(db,event,sink)).delivered)delivered++;else{failed++;break;}}
    }catch{failed++;}
    finally{await states.updateOne({_id:'sink',worker},{$set:{leaseUntil:new Date(),circuitUntil:new Date(Date.now()+(failed?300000:0))}});}
  }
  return {triggers,mirror:{delivered,failed}};
}
