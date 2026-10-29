import { createHash } from 'node:crypto';
import { studyEndpoint, jsonBody, reject, isRecord, validId } from './studyHttp.mjs';
import { mutableProfileKeys, validProfilePatch, dailyVisitPatch } from './profilePolicy.mjs';
const readable = new Set([...mutableProfileKeys,'uid','email','createdAt','isAdmin','dailyTargetMinutes','xp','level','levelName','xpAwarded','streak','lastActive','lastStudySessionAt','totalStudySeconds','subscription','usage','visitStreak','bestVisitStreak','lastVisitDay','lastVisitAt','telegramId']);
const publicProfile = row => ({ profile:Object.fromEntries(Object.entries(row.data).filter(([k]) => readable.has(k))), revision:row.revision });
export function createProfileApi(db,sessions,{origin,now=()=>new Date()}) {
  return studyEndpoint(sessions,origin,async ({request,user,url,send}) => {
    if (!['/api/profile','/api/profile/visit'].includes(url.pathname)) throw reject(404);
    if (url.search) throw reject(400);
    const collection=db.collection('user_profiles');
    if(request.method==='GET' && url.pathname==='/api/profile') {
      const row=await collection.findOne({_id:user.uid},{maxTimeMS:5000});
      return send(200,row?publicProfile(row):{profile:null,revision:0});
    }
    const visit=url.pathname.endsWith('/visit');
    if(request.method!==(visit?'POST':'PATCH'))throw reject(405);
    const body=await jsonBody(request,64*1024);
    if(!isRecord(body) || Object.keys(body).some(k=>!(visit?['baseRevision','mutationId']:['baseRevision','mutationId','patch']).includes(k)) ||
      !Number.isSafeInteger(body.baseRevision)||body.baseRevision<0||!validId(body.mutationId))throw reject(400);
    const timestamp=now();
    const patch=visit?null:body.patch;
    if(!visit && !isRecord(patch))throw reject(400);
    // JSON transport dates become actual server-side Date values before applying
    // the timestamp rule. Invalid/future timestamps are rejected, not rewritten.
    if(patch && Object.hasOwn(patch,'onboardingCompletedAt')) {
      if(typeof patch.onboardingCompletedAt!=='string')throw reject(400);
      patch.onboardingCompletedAt=new Date(patch.onboardingCompletedAt);
    }
    const fingerprint=createHash('sha256').update(JSON.stringify([visit,body.baseRevision,patch])).digest('hex');
    const previous=await collection.findOne({_id:user.uid},{maxTimeMS:5000});
    if(previous?.lastMutation===body.mutationId) {
      if(previous.mutationHash!==fingerprint)throw reject(409);
      return send(200,publicProfile(previous));
    }
    if((previous?.revision??0)!==body.baseRevision)throw reject(409);
    if(visit&&!previous)throw reject(404);
    const initial={uid:user.uid,email:user.email||'',displayName:user.displayName||'',isAdmin:false,createdAt:timestamp.toISOString(),
      onboarded:false,goals:[],currentLevel:'Beginner',dailyTargetMinutes:30,xp:0,level:1,levelName:'Novice Student',
      xpAwarded:{},streak:0,totalStudySeconds:0,subscription:{plan:'free',status:'active'},usage:{},settings:{}};
    const current=previous?.data||initial;
    if(!visit&&!validProfilePatch(patch,current,timestamp))throw reject(400);
    const data={...current,...(visit?dailyVisitPatch(current,timestamp):patch)};
    const row={_id:user.uid,data,revision:body.baseRevision+1,lastMutation:body.mutationId,mutationHash:fingerprint};
    if(!previous) {
      try{await collection.insertOne(row);}catch(e){if(e.code===11000)throw reject(409);throw e;}
    } else {
      // Set only mutable fields. Concurrent trusted XP/subscription updates must
      // not be replaced by a stale profile snapshot.
      const updates=Object.fromEntries(Object.entries(visit?dailyVisitPatch(current,timestamp):patch).map(([k,v])=>[`data.${k}`,v]));
      Object.assign(updates,{revision:row.revision,lastMutation:body.mutationId,mutationHash:fingerprint});
      const changed=await collection.updateOne({_id:user.uid,revision:body.baseRevision},{$set:updates});
      if(changed.modifiedCount!==1)throw reject(409);
    }
    const saved=await collection.findOne({_id:user.uid},{maxTimeMS:5000});
    if(!saved)throw reject(503);
    return send(previous?200:201,publicProfile(saved));
  });
}
