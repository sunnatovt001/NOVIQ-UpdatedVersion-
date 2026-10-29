// One database authority per deployment. This module never falls back to
// Firestore after a MongoDB failure.
if (process.env.NOVIQ_DATA_BACKEND !== 'mongodb') {
  module.exports = require('firebase-admin/firestore');
} else {
  const {createDatabaseConnection,readDatabaseConfig,createCanonicalStore,Timestamp,FieldValue,AggregateField,
    readMirrorKey,enqueueMirrorRecord,databaseNamespace}=require('./mongo-runtime.generated.cjs');
  const connection = createDatabaseConnection(readDatabaseConfig());
  const key = process.env.NOVIQ_FIREBASE_MIRROR === 'true' ? readMirrorKey(process.env.FIREBASE_MIRROR_ENCRYPTION_KEY) : null;
  let ready;
  const getDatabase = async () => {
    if (!ready) ready = (async()=>{
      const db=databaseNamespace(await connection.getDatabase(),process.env.MONGODB_COLLECTION_PREFIX||'');
      await db.collection('mongo_documents').createIndex({parent:1,deleted:1,id:1});
      await db.collection('mongo_documents').createIndex({collectionGroup:1,deleted:1});
      await db.collection('mongo_trigger_jobs').createIndex({state:1,nextAttemptAt:1,createdAt:1});
      await db.collection('firebase_mirror_outbox').createIndex({state:1,nextAttemptAt:1,createdAt:1});
      return db;
    })().catch(error=>{ready=undefined;throw error;});
    return ready;
  };
  const store=createCanonicalStore({getDatabase,transaction:work=>connection.transaction(work),
    ...(key?{enqueueBackup:(db,row,session)=>enqueueMirrorRecord(db,'mongo_documents',row,{key,session})}:{})});
  module.exports={getFirestore:()=>store,Timestamp,FieldValue,AggregateField,
    getMongoRuntime:()=>({store,getDatabase,connection})};
}
