import backend from '../functions/vercel.cjs';
import runtime from '../functions/databaseRuntime.cjs';
import {runMongoMaintenance} from '../server/src/mongoMaintenance.mjs';
export default async function(request,response){
  response.setHeader('Cache-Control','no-store');
  if(process.env.NOVIQ_DATA_BACKEND!=='mongodb'){response.statusCode=404;return response.end('Not found');}
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.authorization!==`Bearer ${secret}`){response.statusCode=401;return response.end('Unauthorized');}
  try{const result=await runMongoMaintenance({runtime:runtime.getMongoRuntime(),handlers:backend.loadHandlers(),triggerLimit:50,mirrorLimit:50,budgetMs:50000});
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({ok:true,...result}));
  }catch{response.statusCode=503;response.end('Maintenance unavailable. Pending changes are retained.');}
}
