import runtime from '../functions/databaseRuntime.cjs';
import {createMongoDataApi} from '../server/src/mongoDataApi.mjs';
import backend from '../functions/vercel.cjs';
import {waitUntil} from '@vercel/functions';
import {runMongoMaintenance} from '../server/src/mongoMaintenance.mjs';
let handler;
export default async function(request,response){
  if(process.env.NOVIQ_DATA_BACKEND!=='mongodb'){response.statusCode=404;return response.end('Not found');}
  if(!handler){
    const origins=[process.env.APP_ORIGIN,process.env.PUBLIC_APP_URL,process.env.VERCEL_URL&&`https://${process.env.VERCEL_URL}`,
      process.env.VERCEL_BRANCH_URL&&`https://${process.env.VERCEL_BRANCH_URL}`].filter(Boolean).map(url=>new URL(url).origin);
    handler=createMongoDataApi({store:runtime.getMongoRuntime().store,origins:[...new Set(origins)]});
  }
  const work=handler(request,response);
  waitUntil(Promise.resolve(work).then(async()=>{
    if(response.statusCode<400)await runMongoMaintenance({runtime:runtime.getMongoRuntime(),handlers:backend.loadHandlers(),triggerLimit:20,mirrorLimit:20,budgetMs:20000});
  }).catch(()=>console.warn('MongoDB background maintenance deferred; durable jobs are retained.')));
  return work;
}
