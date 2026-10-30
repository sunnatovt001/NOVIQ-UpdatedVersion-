// Run only inside the deployment's server environment. Never download secrets.
import {createRequire} from 'node:module';
import {createDatabaseConnection,readDatabaseConfig} from '../server/src/database.mjs';
import {readMirrorKey,verifyMirrorBackup} from '../server/src/firebaseMirror.mjs';
import source from '../firebase-applet-config.json' with {type:'json'};
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,cert,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const failures=[];
const report={checkedAt:new Date().toISOString(),userRecordsChanged:false};
let connection,app,stage='configuration';
const check=(ok,name)=>{if(!ok)failures.push(name);};
try{
  check(process.env.NOVIQ_DATA_BACKEND==='mongodb'&&process.env.VITE_DATA_BACKEND==='mongodb','backend-selection');
  stage='mongodb';const config=readDatabaseConfig();connection=createDatabaseConnection(config);
  const db=await connection.getDatabase();await db.command({ping:1});report.mongoConnected=true;
  const docs=db.collection(`${process.env.MONGODB_COLLECTION_PREFIX||''}mongo_documents`);
  report.missingOrderMetadata=await docs.countDocuments({deleted:false,sortKeys:{$exists:false}},{maxTimeMS:15000});
  check(report.missingOrderMetadata===0,'document-order-backfill');
  const outbox=db.collection(`${process.env.MONGODB_COLLECTION_PREFIX||''}firebase_mirror_outbox`);
  report.pendingBackups=await outbox.countDocuments({state:'pending'},{maxTimeMS:15000});
  const oldest=await outbox.find({state:'pending'},{projection:{createdAt:1}}).sort({createdAt:1}).limit(1).maxTimeMS(5000).toArray();
  report.oldestPendingBackup=oldest[0]?.createdAt||null;
  stage='backup-read-back';const credential=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'{}');
  check(credential.project_id===source.projectId,'backup-project');
  if(credential.project_id===source.projectId){
    app=initializeApp({projectId:source.projectId,credential:cert(credential)},'release-readiness');
    const firestore=getFirestore(app,source.firestoreDatabaseId);
    const prefix=process.env.MONGODB_COLLECTION_PREFIX||'';
    const root=firestore.collection('mongoBackupNamespaces').doc(`${config.database}${prefix?`__${prefix}`:''}`);
    const manifests=await root.collection('records').limit(3).get();
    let verified=0;const key=readMirrorKey(process.env.FIREBASE_MIRROR_ENCRYPTION_KEY);
    for(const document of manifests.docs){
      const manifest=document.data();
      if(!Number.isSafeInteger(manifest.chunks)||manifest.chunks<1||manifest.chunks>60)throw new Error('invalid-backup');
      const chunks=await Promise.all(Array.from({length:manifest.chunks},(_,i)=>root.collection('chunks').doc(`${manifest.eventId}:${i}`).get()));
      verifyMirrorBackup(manifest,chunks.map(chunk=>chunk.data()),key,document.id);verified++;
    }
    report.backupReadAndDecryptionVerified=verified;check(verified>0,'backup-read-back');
    check(!oldest[0]||Date.now()-new Date(oldest[0].createdAt).getTime()<86400000,'backup-lag-over-24h');
  }
  stage='gemini';const apiKey=process.env.GEMINI_API_KEY;
  check(Boolean(apiKey),'gemini-key');
  if(apiKey){
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
      body:JSON.stringify({contents:[{parts:[{text:'Reply only OK.'}]}],generationConfig:{maxOutputTokens:16}}),signal:AbortSignal.timeout(30000)});
    const body=await response.json();report.gemini={status:response.status,generated:Boolean(body.candidates?.[0]?.content?.parts?.some(part=>part.text))};
    check(response.ok&&report.gemini.generated,'gemini-generation');
  }
  stage='telegram';const token=process.env.TELEGRAM_BOT_TOKEN;
  check(Boolean(token),'telegram-token');
  if(token){
    const response=await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`,{signal:AbortSignal.timeout(15000)});
    const body=await response.json();const webhook=body.result?.url||'';
    report.telegram={connected:body.ok===true,webhookMatches:webhook===`${process.env.APP_ORIGIN}/api/telegram`,pending:body.result?.pending_update_count||0,hasDeliveryError:Boolean(body.result?.last_error_message)};
    check(response.ok&&report.telegram.connected&&report.telegram.webhookMatches,'telegram-webhook');
  }
  report.paymentConfigured=['PAYMENT_CHECKOUT_URL','PAYMENT_CHECKOUT_SECRET','PAYMENT_WEBHOOK_SECRET'].every(name=>Boolean(process.env[name]));
}catch{
  // Provider/driver exceptions can contain private configuration; do not log them.
  failures.push(`${stage}-check-incomplete`);
}finally{
  if(connection)await connection.close();if(app)await deleteApp(app);
}
console.log(JSON.stringify({...report,failures}));
if(failures.length)process.exitCode=1;
