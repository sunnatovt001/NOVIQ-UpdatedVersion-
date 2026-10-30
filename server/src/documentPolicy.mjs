import { mutableProfileKeys,validProfilePatch,dailyVisitPatch } from './profilePolicy.mjs';
import { Timestamp,equal,pack } from '../../shared/mongoValues.mjs';
const isTime=value=>value?.__noviqTimestamp===true&&typeof value.toDate==='function';
const map=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&!isTime(value);
const hasOnly=(value,keys)=>map(value)&&Object.keys(value).every(key=>keys.includes(key));
const changed=(before,after)=>[...new Set([...Object.keys(before||{}),...Object.keys(after||{})])].filter(key=>
  !(key in (before||{}))||!(key in (after||{}))||!equal(before[key],after[key]));
const onlyChanged=(before,after,keys)=>changed(before,after).every(key=>keys.includes(key));
const sync=data=>!('syncStatus'in data)||['pending','synced','failed'].includes(data.syncStatus);
const syncOnly=(before,after)=>map(after)&&onlyChanged(before,after,['syncStatus','syncedAt'])&&sync(after);
const normal=data=>({...data,...(isTime(data?.onboardingCompletedAt)?{onboardingCompletedAt:data.onboardingCompletedAt.toDate()}: {})});
const ownerKinds=new Set(['tutorMessages','notebookNotes','notebookSources','notebookMessages','journals','roadmapTasks']);
const ownerReadOnly=new Set(['xpDays','recallEvidence','trusted','studySessions','progressEvents','subscriptionCheckouts','subscriptionRequests']);
const privateReadOnly=new Set(['proEvents','plannerHistory','joinedCommunities','friendInvites','friends']);
const adminGroups=new Set(['studySessions','progressEvents','notebookNotes','notebookMessages','tutorMessages','decks','trusted','subscriptionRequests','subscriptionCheckouts']);
const createKeys=['uid','email','displayName','photoURL','createdAt','isAdmin','onboarded','onboardingAnswers','onboardingCompleted','onboarding','onboardingCompletedAt','goals','currentLevel','dailyTargetMinutes','xp','level','levelName','xpAwarded','streak','lastActive','totalStudySeconds','subscription','usage','settings','showActionButtons'];
function safeCreate(data,uid,now){
  if(!hasOnly(data,createKeys)||data.uid!==uid||'createdAt'in data&&typeof data.createdAt!=='string')return false;
  for(const [key,value]of Object.entries({isAdmin:false,xp:0,level:1,levelName:'Novice Student',streak:0,totalStudySeconds:0}))if(key in data&&data[key]!==value)return false;
  if('xpAwarded'in data&&!hasOnly(data.xpAwarded,[]))return false;
  if('subscription'in data&&(!hasOnly(data.subscription,['plan','status'])||data.subscription.plan!=='free'||data.subscription.status!=='active'))return false;
  if('usage'in data&&!hasOnly(data.usage,[]))return false;
  const partial=Object.fromEntries(Object.entries(normal(data)).filter(([key])=>mutableProfileKeys.includes(key)));
  return validProfilePatch(partial,{},now);
}
const ownerPath=(path,uid)=>path[0]==='users'&&path[1]===uid;
const plannerValid=(data,uid)=>map(data)&&data.userId===uid&&data.version===2&&data.persistenceVersion===3&&
  typeof data.revision==='string'&&data.revision.length>0&&Array.isArray(data.tasks)&&Array.isArray(data.sessions)&&
  Array.isArray(data.subjects)&&typeof data.ready==='boolean'&&Number.isSafeInteger(data.sequence);
export function createDocumentPolicy({uid,claims={},lookup}){
  let admin;
  const isAdmin=async()=>admin??=(claims.admin===true||(await lookup(`users/${uid}`))?.isAdmin===true);
  async function canRead(path,data){
    if(!uid)return false;
    const p=path.split('/'),own=ownerPath(p,uid);
    if(p[0]==='users'){
      if(p.length===2)return own||await isAdmin();
      if(p.length===4){
        if(ownerKinds.has(p[2])||ownerReadOnly.has(p[2])||p[2]==='decks'||p[2]==='flashcardSessions')return own||await isAdmin();
        if(p[2]==='notifications'||p[2]==='planner'||privateReadOnly.has(p[2])||['proExperience','proReflections'].includes(p[2]))return own;
      }
      if(p.length===6&&p[2]==='decks'&&['cards','reviews'].includes(p[4]))return own||await isAdmin();
    }
    if(p[0]==='communities'){
      if(p.length===2)return true;
      if(p.length===4&&p[2]==='members')return p[3]===uid||await isAdmin();
      if(p.length===4&&p[2]==='messages')return !!await lookup(`communities/${p[1]}/members/${uid}`);
    }
    if(p.length===2&&['analytics','analyticsEvents'].includes(p[0]))return isAdmin();
    if(p.length===2&&p[0]==='analyticsUsers')return p[1]===uid||await isAdmin();
    if((p.length===2&&['studyPlans','notes','studySessions'].includes(p[0])||p.length===4&&p[0]==='decks'&&p[2]==='flashcards'))return data?.userId===uid;
    return adminGroups.has(p.at(-2))&&await isAdmin();
  }
  const ownerConstraint=filters=>(filters||[]).some(c=>c.kind==='where'&&c.field==='userId'&&c.op==='=='&&c.value===uid);
  async function canQuery(spec){
    if(!uid)return false;
    if(spec.group)return adminGroups.has(spec.group)&&await isAdmin();
    const p=spec.path.split('/');
    if(p.length===1){
      if(['users','analytics','analyticsEvents'].includes(p[0]))return isAdmin();
      if(p[0]==='communities')return true;
      if(['studyPlans','notes','studySessions'].includes(p[0]))return ownerConstraint(spec.filters);
      if(p[0]==='analyticsUsers')return await isAdmin()||(spec.filters||[]).some(c=>c.kind==='where'&&c.field==='__name__'&&c.op==='=='&&[uid,`analyticsUsers/${uid}`].includes(c.value));
      return false;
    }
    if(p[0]==='users')return canRead(`${spec.path}/query-placeholder`,null);
    if(p[0]==='communities'&&p.length===3&&p[2]==='members')return await isAdmin()||(spec.filters||[]).some(c=>c.kind==='where'&&c.field==='__name__'&&c.op==='=='&&[uid,`${spec.path}/${uid}`].includes(c.value));
    if(p[0]==='communities'&&p.length===3&&p[2]==='messages')return !!await lookup(`communities/${p[1]}/members/${uid}`);
    if(p[0]==='decks'&&p.length===3&&p[2]==='flashcards')return ownerConstraint(spec.filters);
    return false;
  }
  async function canWrite({path,before,after,now}){
    if(!uid)return false;
    const p=path.split('/'),own=ownerPath(p,uid),creating=before===null,deleting=after===null;
    if(p[0]==='users'){
      if(p.length===2){
        if(await isAdmin())return true;
        if(!own||deleting)return false;
        if(creating)return safeCreate(after,uid,now);
        const keys=changed(before,after);
        if(keys.every(key=>mutableProfileKeys.includes(key))&&validProfilePatch({},normal(after),now)&&
          !(before.onboardingCompleted===true&&after.onboardingCompleted!==true))return true;
        try{
          const expected=dailyVisitPatch(before,now);
          return onlyChanged(before,after,['visitStreak','bestVisitStreak','lastVisitDay','lastVisitAt'])&&
            ['visitStreak','bestVisitStreak','lastVisitDay'].every(key=>after[key]===expected[key])&&
            isTime(after.lastVisitAt)&&after.lastVisitAt.isEqual(Timestamp.fromDate(now));
        }catch{return false;}
      }
      if(!own)return false;
      if(p.length===4){
        if(ownerKinds.has(p[2])||p[2]==='notifications'||p[2]==='decks')return true;
        if(['proExperience','proReflections'].includes(p[2]))return true;
        if(p[2]==='flashcardSessions')return deleting||after.id===p[3]&&Array.isArray(after.attempts)&&after.attempts.length<=200&&Array.isArray(after.cardIds)&&after.cardIds.length<=200&&typeof after.activeSeconds==='number'&&after.activeSeconds>=0;
        if(['studySessions','subscriptionCheckouts'].includes(p[2]))return !creating&&!deleting&&syncOnly(before,after);
        if(p[2]==='progressEvents'){
          if(deleting)return false;if(!creating)return syncOnly(before,after);
          return hasOnly(after,['type','sessionId','dayKey','awards','rawXp','activity','proposedProgressPatch','createdAt','syncStatus','syncedAt','status'])&&
            ['daily_activity','xp_award','study_session'].includes(after.type)&&typeof after.createdAt==='string'&&
            (after.type!=='study_session'||typeof after.sessionId==='string'&&p[3]===`session-${after.sessionId}`)&&
            (!('status'in after)||after.status==='pending')&&(!('rawXp'in after)||typeof after.rawXp==='number'&&after.rawXp>=0&&after.rawXp<=30)&&sync(after);
        }
        if(p[2]==='subscriptionRequests')return !deleting&&(creating?
          hasOnly(after,['action','status','currentPlan','currentStatus','createdAt','syncStatus','syncedAt'])&&after.status==='pending'&&['cancel_renewal','update_billing'].includes(after.action)&&sync(after):syncOnly(before,after));
        if(p[2]==='planner'){
          if(p[3]!=='smart-v2')return true;
          return !deleting&&plannerValid(after,uid)&&(creating?after.sequence===1&&after.previousRevision===null:
            after.previousRevision===(before.revision??null)&&after.sequence===(before.sequence??0)+1&&after.revision!==(before.revision??null));
        }
        if(p[2]==='plannerHistory'){
          const plan=await lookup(`users/${uid}/planner/smart-v2`);
          return creating&&!deleting&&after.userId===uid&&after.plan?.userId===uid&&after.plan.revision===plan?.revision;
        }
      }
      if(p.length===6&&p[2]==='decks'){
        if(p[4]==='cards')return true;
        if(p[4]==='reviews')return deleting||after.id===p[5]&&typeof after.reviewCount==='number'&&after.reviewCount>=0&&typeof after.dueAt==='string';
      }
    }
    if(p.length===2&&p[0]==='analyticsEvents')return creating?!deleting&&hasOnly(after,['userId','eventType','xp','details','page','createdAt','syncStatus','syncedAt'])&&after.userId===uid&&typeof after.eventType==='string'&&/^[a-z_]{1,64}$/.test(after.eventType)&&(!('xp'in after)||typeof after.xp==='number'&&after.xp<=500)&&sync(after):!deleting&&before.userId===uid&&syncOnly(before,after);
    return false;
  }
  return {canRead,canQuery,canWrite,isAdmin};
}
