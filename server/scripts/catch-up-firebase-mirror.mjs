import {createRequire} from 'node:module';
import {createDatabaseConnection,readDatabaseConfig} from '../src/database.mjs';
import {createFirestoreMirrorSink,readMirrorKey} from '../src/firebaseMirror.mjs';
import {catchUpMirror} from '../src/mirrorCatchup.mjs';
import source from '../../firebase-applet-config.json' with {type:'json'};
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp,cert,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
let connection,app;
try{
  if(!process.argv.includes('--execute')||process.env.NOVIQ_FIREBASE_MIRROR!=='true'||process.env.MONGODB_COLLECTION_PREFIX)throw new Error();
  const config=readDatabaseConfig();if(config.database!=='noviq_staging')throw new Error();
  const credentials=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'{}');if(credentials.project_id!==source.projectId)throw new Error();
  const key=readMirrorKey(process.env.FIREBASE_MIRROR_ENCRYPTION_KEY);
  connection=createDatabaseConnection(config);const db=await connection.getDatabase();
  app=initializeApp({projectId:source.projectId,credential:cert(credentials)},'bounded-mirror-catchup');
  const firestore=getFirestore(app,source.firestoreDatabaseId),root=firestore.collection('mongoBackupNamespaces').doc(config.database);
  const result=await catchUpMirror({db,sink:createFirestoreMirrorSink(firestore,config.database),root,key,onProgress:report=>console.log(JSON.stringify(report))});
  console.log(JSON.stringify(result));if(result.deferred||result.pending)process.exitCode=1;
}catch{console.error('Bounded mirror catch-up stopped. Pending events retained; no application records changed.');process.exitCode=1;}
finally{if(connection)await connection.close();if(app)await deleteApp(app);}
