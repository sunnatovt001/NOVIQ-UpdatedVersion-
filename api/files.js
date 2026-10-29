import runtime from '../functions/databaseRuntime.cjs';
import backend from '../functions/vercel.cjs';
import {waitUntil} from '@vercel/functions';
import {createMongoFilesApi} from '../server/src/mongoFiles.mjs';
import {readMirrorKey} from '../server/src/firebaseMirror.mjs';
import {runMongoMaintenance} from '../server/src/mongoMaintenance.mjs';
let handler;
export default function(request,response){
  if(process.env.NOVIQ_DATA_BACKEND!=='mongodb'){response.statusCode=404;return response.end('Not found');}
  const state=runtime.getMongoRuntime();
  if(!handler){
    const origins=[process.env.APP_ORIGIN,process.env.PUBLIC_APP_URL,process.env.VERCEL_URL&&`https://${process.env.VERCEL_URL}`,process.env.VERCEL_BRANCH_URL&&`https://${process.env.VERCEL_BRANCH_URL}`].filter(Boolean).map(url=>new URL(url).origin);
    handler=createMongoFilesApi({getDatabase:state.getDatabase,transaction:work=>state.connection.transaction(work),origins,
      key:readMirrorKey(process.env.MONGO_FILE_SIGNING_KEY),backupKey:process.env.NOVIQ_FIREBASE_MIRROR==='true'?readMirrorKey(process.env.FIREBASE_MIRROR_ENCRYPTION_KEY):null});
  }
  const work=handler(request,response);
  waitUntil(Promise.resolve(work).then(async()=>{if(response.statusCode<400&&request.method==='POST')await runMongoMaintenance({runtime:state,handlers:backend.loadHandlers(),triggerLimit:5,mirrorLimit:5});}).catch(()=>console.warn('File backup deferred; durable events are retained.')));
  return work;
}
