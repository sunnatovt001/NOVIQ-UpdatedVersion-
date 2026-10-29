import {randomBytes} from 'node:crypto';
function parameters(pattern,path){
  if(typeof pattern!=='string')return null;
  const template=pattern.split('/'),parts=path.split('/'),result={};
  if(template.length!==parts.length)return null;
  for(let i=0;i<parts.length;i++){
    if(/^\{[A-Za-z0-9_]+\}$/.test(template[i]))result[template[i].slice(1,-1)]=parts[i];
    else if(template[i]!==parts[i])return null;
  }
  return result;
}
export async function drainMongoTriggers({db,store,handlers,limit=10,budgetMs=8000,now=()=>new Date()}){
  const jobs=db.collection('mongo_trigger_jobs'),started=Date.now(),worker=randomBytes(12).toString('hex');
  let completed=0,failed=0;
  for(let count=0;count<limit&&Date.now()-started<budgetMs;count++){
    const clock=now();
    const job=await jobs.findOneAndUpdate({$or:[{state:'pending',nextAttemptAt:{$lte:clock}},{state:'processing',leaseUntil:{$lte:clock}}]},
      {$set:{state:'processing',worker,leaseUntil:new Date(clock.getTime()+180000)}},{sort:{createdAt:1},returnDocument:'after'});
    if(!job)break;
    try{
      const before=job.before===null?store._missing(job.path):store._snapshot({_id:job.path,data:job.before,deleted:false,version:job.version-1});
      const after=job.after===null?store._missing(job.path):store._snapshot({_id:job.path,data:job.after,deleted:false,version:job.version});
      for(const handler of Object.values(handlers)){
        const trigger=handler?.__endpoint?.eventTrigger;
        const params=parameters(trigger?.eventFilterPathPatterns?.document,job.path);
        if(!params||typeof handler.run!=='function')continue;
        const type=trigger.eventType?.split('.').at(-1);
        if(type==='created'&&(before.exists||!after.exists)||type==='deleted'&&(after.exists||!before.exists)||type==='updated'&&(!before.exists||!after.exists))continue;
        if(!['created','updated','deleted','written'].includes(type))continue;
        await handler.run({id:job._id,params,time:job.createdAt.toISOString(),data:type==='created'?after:type==='deleted'?before:{before,after}});
      }
      await jobs.updateOne({_id:job._id,worker},{$set:{state:'completed',completedAt:now()}});completed++;
    }catch{
      const attempts=(job.attempts||0)+1;
      await jobs.updateOne({_id:job._id,worker},{$set:{state:'pending',attempts,nextAttemptAt:new Date(now().getTime()+Math.min(3600000,10000*2**Math.min(attempts,8)))}});
      failed++;break;
    }
  }
  return {completed,failed};
}
