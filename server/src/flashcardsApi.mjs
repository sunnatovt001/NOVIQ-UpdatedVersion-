import { createHash } from 'node:crypto';
import { studyEndpoint,jsonBody,reject,isRecord,validId } from './studyHttp.mjs';
const fields = {
  decks:['id','title','description','subject','tags','favorite','archived','color','icon','updatedAt','createdAt','syncStatus','syncedAt'],
  cards:['id','deckId','front','back','question','answer','term','definition','translation','example','pronunciation','partOfSpeech','hint','imageUrl','source','language','lastReviewedAt','alternateAnswers','order','revision','deleted','favorite','updatedAt','createdAt','dueAt','reviewCount','interval','easeFactor','repetition','lapses','syncStatus','syncedAt'],
  reviews:['id','dueAt','interval','ease','repetitions','lapses','reviewCount','revision','syncStatus','syncedAt'],
  sessions:['id','deckId','mode','cardIds','index','attempts','startedAt','activeSeconds','completed','taskId','syncStatus','syncedAt'],
};
const modes=['classic','match','type','missing','choice','listen','learn'];
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const strings=(a,n)=>Array.isArray(a)&&a.length<=n&&a.every(v=>typeof v==='string');
export function validFlashcardRecord(kind,data,id,deckId) {
  if(!isRecord(data)||Object.keys(data).some(k=>!fields[kind]?.includes(k))||data.id!==id||
    (data.syncStatus!==undefined&&!['pending','synced','failed'].includes(data.syncStatus)))return false;
  if(kind==='decks')return typeof data.title==='string'&&data.title.trim().length>0&&data.title.length<=160&&
    ['color','icon'].every(k=>data[k]===undefined||typeof data[k]==='string'&&data[k].length<=160);
  if(kind==='cards')return data.deckId===deckId&&typeof data.front==='string'&&typeof data.back==='string'&&
    (data.deleted===true||data.front.trim().length>0&&data.back.trim().length>0)&&
    (data.alternateAnswers===undefined||strings(data.alternateAnswers,100));
  if(kind==='reviews')return typeof data.dueAt==='string'&&finite(data.reviewCount);
  if(kind==='sessions')return validId(data.deckId)&&modes.includes(data.mode)&&strings(data.cardIds,200)&&data.cardIds.every(validId)&&
    new Set(data.cardIds).size===data.cardIds.length&&Array.isArray(data.attempts)&&data.attempts.length<=200&&data.attempts.length<=data.cardIds.length&&
    data.attempts.every(a=>isRecord(a)&&Object.keys(a).every(k=>['cardId','mode','answer','correct','hints','rating','at','revision','mistakes'].includes(k))&&
      data.cardIds.includes(a.cardId)&&typeof a.correct==='boolean'&&typeof a.answer==='string'&&
      finite(a.hints)&&modes.includes(a.mode)&&['again','hard','good','easy'].includes(a.rating))&&
    new Set(data.attempts.map(a=>a.cardId)).size===data.attempts.length&&finite(data.activeSeconds)&&
    Number.isInteger(data.index)&&data.index>=0&&data.index<=data.cardIds.length&&typeof data.completed==='boolean'&&
    typeof data.startedAt==='string'&&Number.isFinite(Date.parse(data.startedAt));
  return false;
}
const rowKey=(uid,kind,parentId,id)=>JSON.stringify([uid,kind,parentId,id]);
const publicRecord=row=>({id:row.id,data:row.data,revision:row.revision});
export function createFlashcardsApi(db,sessions,{origin,now=()=>new Date()}) {
  return studyEndpoint(sessions,origin,async({request,user,url,send})=>{
    const root=/^\/api\/flashcards\/(decks|sessions)(?:\/([A-Za-z0-9_-]{1,128}))?$/.exec(url.pathname);
    const child=/^\/api\/flashcards\/decks\/([A-Za-z0-9_-]{1,128})\/(cards|reviews)(?:\/([A-Za-z0-9_-]{1,128}))?$/.exec(url.pathname);
    if(!root&&!child)throw reject(404);
    const kind=child?child[2]:root[1],parentId=child?child[1]:'',id=child?child[3]:root[2];
    const collection=db.collection('flashcard_records');
    const owner={userId:user.uid,kind,parentId};
    const deckExists=async deckId=>!!await collection.findOne({_id:rowKey(user.uid,'decks','',deckId),userId:user.uid,deleted:false},{maxTimeMS:5000});
    if(parentId&&!await deckExists(parentId))throw reject(404);
    if(request.method==='GET') {
      if(id) {
        if(url.search)throw reject(400);
        const row=await collection.findOne({...owner,_id:rowKey(user.uid,kind,parentId,id),deleted:false},{maxTimeMS:5000});
        if(!row)throw reject(404);return send(200,{record:publicRecord(row)});
      }
      if([...url.searchParams.keys()].some(k=>k!=='after')||url.searchParams.getAll('after').length>1)throw reject(400);
      const after=url.searchParams.get('after');if(after!==null&&!validId(after))throw reject(400);
      const rows=await collection.find({...owner,deleted:false,...(after?{id:{$gt:after}}:{})}).sort({id:1}).limit(51).maxTimeMS(5000).toArray();
      return send(200,{records:rows.slice(0,50).map(publicRecord),nextCursor:rows.length>50?rows[49].id:null});
    }
    if(!id||!['PUT','DELETE'].includes(request.method))throw reject(405);
    if(url.search)throw reject(400);
    const body=await jsonBody(request),deleting=request.method==='DELETE';
    if(!isRecord(body)||Object.keys(body).some(k=>!(deleting?['baseRevision','mutationId']:['baseRevision','mutationId','data']).includes(k))||
      !validId(body.mutationId)||!Number.isSafeInteger(body.baseRevision)||body.baseRevision<0)throw reject(400);
    if(!deleting&&!validFlashcardRecord(kind,body.data,id,parentId))throw reject(400);
    // Session evidence stays private and is never a request to award trusted XP.
    if(!deleting&&kind==='sessions'&&!await deckExists(body.data.deckId))throw reject(404);
    const query={...owner,_id:rowKey(user.uid,kind,parentId,id)};
    const previous=await collection.findOne(query,{maxTimeMS:5000});
    const hash=createHash('sha256').update(JSON.stringify([deleting,body.baseRevision,body.data??null])).digest('hex');
    if(previous?.lastMutation===body.mutationId){if(previous.mutationHash!==hash)throw reject(409);return send(200,deleting?{id,deleted:true,revision:previous.revision}:{record:publicRecord(previous)});}
    if(previous?.deleted||(previous?.revision??0)!==body.baseRevision)throw reject(409);
    if(deleting&&!previous)throw reject(404);
    const row={...query,id,data:deleting?previous.data:body.data,deleted:deleting,revision:body.baseRevision+1,
      updatedAt:now().toISOString(),lastMutation:body.mutationId,mutationHash:hash};
    if(!previous){try{await collection.insertOne(row);}catch(e){if(e.code===11000)throw reject(409);throw e;}}
    else {const changed=await collection.replaceOne({...query,revision:body.baseRevision,deleted:false},row);if(changed.modifiedCount!==1)throw reject(409);}
    return send(previous?200:201,deleting?{id,deleted:true,revision:row.revision}:{record:publicRecord(row)});
  });
}
