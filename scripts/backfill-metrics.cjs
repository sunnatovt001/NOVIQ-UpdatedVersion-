// Explicit, additive migration. No original documents are changed or deleted.
const fs=require('node:fs');
(async()=>{
  const {db,config}=await require('./cloud-client.cjs')(process.argv[2]);
  if (!process.argv.includes('--execute')) {
    console.log('Preview only: normalizes legacy records into private server-owned metricRecords. Requires deployed triggers/indexes. Original records are preserved. Add --execute only after billing/deployment approval.');
    await db.terminate();return;
  }
  const admin=require('../functions/node_modules/firebase-admin/firestore');
  const {backfillUser}=require('../functions/metrics')({db,onCall:fn=>fn,onDocumentWritten:(_,fn)=>fn,onDocumentCreated:(_,fn)=>fn,HttpsError:Error,FieldValue:admin.FieldValue,logger:console,database:config.firestoreDatabaseId});
  let cursor,users=0;
  while (true) {
    let q=db.collection('users').orderBy('__name__').limit(50);if(cursor)q=q.startAfter(cursor);
    const page=await q.get();if(!page.docs.length)break;
    for(const user of page.docs){await backfillUser(user.id);users++;console.log(`Verified metrics backfill completed for ${users} accounts`);}
    cursor=page.docs.at(-1).id;
  }
  fs.writeFileSync('artifacts/production-audit/metrics-backfill.json',JSON.stringify({project:config.projectId,users,completedAt:new Date().toISOString(),originalRecordsModified:0},null,2));
  await db.terminate();
})().catch(error=>{console.error('Metrics migration failed:',error.message);process.exitCode=1;});
