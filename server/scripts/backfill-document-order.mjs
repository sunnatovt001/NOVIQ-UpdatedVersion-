// Explicit, resumable maintenance for pre-upgrade canonical documents. No user
// content/version changes or trigger jobs. CAS prevents racing a real write.
import {createDatabaseConnection,readDatabaseConfig} from '../src/database.mjs';
import {databaseNamespace} from '../src/databaseNamespace.mjs';
import {documentOrderKeys} from '../src/documentOrder.mjs';
const connection=createDatabaseConnection(readDatabaseConfig());
try{
  const db=databaseNamespace(await connection.getDatabase(),process.env.MONGODB_COLLECTION_PREFIX||'');
  const collection=db.collection('mongo_documents');let scanned=0,updated=0;
  for await(const row of collection.find({deleted:false,sortKeys:{$exists:false}}).batchSize(100)){
    const result=await collection.updateOne({_id:row._id,version:row.version,sortKeys:{$exists:false}},{$set:{sortKeys:documentOrderKeys(row.data)}});
    scanned++;updated+=result.modifiedCount;
  }
  const fields=['createdAt','updatedAt','timestamp','startedAt','processedAt','order','code','subscription.currentPeriodEnd'];
  for(const field of fields){
    const key=`sortKeys.${Buffer.from(field).toString('hex')}`;
    await collection.createIndex({parent:1,deleted:1,[key]:1,_id:1});
    await collection.createIndex({collectionGroup:1,deleted:1,[key]:1,_id:1});
  }
  await collection.createIndex({parent:1,deleted:1,_id:1});
  console.log(JSON.stringify({scanned,updated,remaining:await collection.countDocuments({deleted:false,sortKeys:{$exists:false}})}));
}finally{await connection.close();}
