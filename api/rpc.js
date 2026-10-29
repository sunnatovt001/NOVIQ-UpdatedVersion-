import backend from '../functions/vercel.cjs';
import runtime from '../functions/databaseRuntime.cjs';
import {waitUntil} from '@vercel/functions';
import {runMongoMaintenance} from '../server/src/mongoMaintenance.mjs';

const handle=backend.createHandler();
export default function(request,response){
  const work=handle(request,response);
  if(process.env.NOVIQ_DATA_BACKEND==='mongodb')waitUntil(Promise.resolve(work).then(async()=>{
    if(response.statusCode<400)await runMongoMaintenance({runtime:runtime.getMongoRuntime(),handlers:backend.loadHandlers(),triggerLimit:20,mirrorLimit:20,budgetMs:20000});
  }).catch(()=>console.warn('MongoDB background maintenance deferred; durable jobs are retained.')));
  return work;
}
