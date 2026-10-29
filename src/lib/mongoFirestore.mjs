import {auth} from './firebaseAuth';
import {Timestamp,FieldValue,pack,revive,fieldAt,validPath} from '../../shared/mongoValues.mjs';
export {Timestamp};
export const serverTimestamp=FieldValue.serverTimestamp,increment=FieldValue.increment,deleteField=FieldValue.delete,
  arrayUnion=FieldValue.arrayUnion,arrayRemove=FieldValue.arrayRemove;
const listeners=new Map();
const error=code=>Object.assign(new Error(code==='permission-denied'?'Permission denied.':code==='unauthenticated'?'Sign in required.':'Data request failed.'),{code});
async function request(body){
  const user=auth.currentUser;if(!user)throw error('unauthenticated');
  const token=await user.getIdToken();
  if(auth.currentUser?.uid!==user.uid)throw error('cancelled');
  let response;
  try{response=await fetch('/api/data',{method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(pack(body)),signal:AbortSignal.timeout(20000)});}
  catch{throw error('unavailable');}
  if(auth.currentUser?.uid!==user.uid)throw error('cancelled');
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw error(result?.error?.code||'unavailable');
  return result;
}
export const getFirestore=(app,databaseId)=>({app,databaseId,__mongo:true});
function path(base,parts,document){
  const value=[base.path,...parts].filter(v=>v!==undefined&&v!=='').join('/');
  if(!validPath(value)||(value.split('/').length%2===0)!==document)throw error('invalid-argument');
  return value;
}
function reference(database,value,kind){
  const result={type:kind,path:value,id:value.split('/').at(-1),firestore:database};
  Object.defineProperty(result,'parent',{get(){const parent=value.split('/').slice(0,-1).join('/');return parent?reference(database,parent,kind==='document'?'collection':'document'):null;}});
  return result;
}
export function doc(base,...parts){if(base.type==='collection'&&!parts.length)parts=[crypto.randomUUID()];return reference(base.firestore||base,path(base,parts,true),'document');}
export function collection(base,...parts){return reference(base.firestore||base,path(base,parts,false),'collection');}
export const collectionGroup=(database,group)=>({type:'query',firestore:database,spec:{group}});
export const where=(field,op,value)=>({kind:'where',field,op,value});
export const or=(...conditions)=>({kind:'or',conditions});
export const and=(...conditions)=>({kind:'and',conditions});
export const orderBy=(field,direction='asc')=>({kind:'order',field,direction});
export const limit=value=>({kind:'limit',value});
export const startAfter=(...values)=>({kind:'after',values});
export const documentId=()=>'__name__';
const querySpec=target=>target.type==='query'?target.spec:{path:target.path};
export function query(target,...constraints){
  const spec={...querySpec(target),filters:[...(querySpec(target).filters||[])],orders:[...(querySpec(target).orders||[])]};
  for(const c of constraints){
    if(c.kind==='where'||c.kind==='or'||c.kind==='and')spec.filters.push(c);
    else if(c.kind==='order')spec.orders.push({field:c.field,direction:c.direction});
    else if(c.kind==='limit')spec.limit=c.value;
    else if(c.kind==='after'){
      const snapshot=c.values[0];
      if(snapshot?.ref){const orders=spec.orders.length?spec.orders:[{field:'__name__',direction:'asc'}];
        spec.after=orders.map(o=>o.field==='__name__'?snapshot.ref.path:fieldAt(snapshot.data(),o.field));
        if(!orders.some(o=>o.field==='__name__'))spec.after.push(snapshot.ref.path);
      }else spec.after=c.values;
    }else throw error('invalid-argument');
  }
  return {type:'query',firestore:target.firestore,spec};
}
function snapshot(row,database,fromCache=false){
  const data=row.exists?revive(row.data):undefined;
  const ref=reference(database,row.path,'document');
  return {id:ref.id,ref,_version:row.version,_row:row,exists:()=>row.exists,data:()=>data,get:field=>fieldAt(data,field),
    metadata:{fromCache,hasPendingWrites:false},isEqual(other){return other?.ref.path===ref.path&&other?._version===row.version;}};
}
function snapshots(rows,database,fromCache=false){
  const docs=rows.map(row=>snapshot(row,database,fromCache));return {docs,size:docs.length,empty:docs.length===0,
    metadata:{fromCache,hasPendingWrites:false},forEach:callback=>docs.forEach(callback),docChanges:()=>docs.map((doc,index)=>({type:'added',doc,oldIndex:-1,newIndex:index}))};
}
export async function getDoc(ref){return snapshot((await request({operation:'get',path:ref.path})).document,ref.firestore);}
export const getDocFromServer=getDoc,getDocFromCache=getDoc;
export async function getDocs(target){return snapshots((await request({operation:'query',query:querySpec(target)})).documents,target.firestore);}
export const getDocsFromServer=getDocs,getDocsFromCache=getDocs;
export const sum=field=>({operation:'sum',field});
export const count=()=>({operation:'count'});
export async function getAggregateFromServer(target,fields){const result=await request({operation:'aggregate',query:querySpec(target),fields});return {data:()=>result.data};}
export const getCountFromServer=target=>getAggregateFromServer(target,{count:count()});
function refresh(){for(const entry of listeners.values())entry.refresh();}
async function commit(writes,reads=[]){const result=await request({operation:'commit',writes,reads});refresh();return result;}
export const setDoc=(ref,data,options={})=>commit([{path:ref.path,kind:'set',data,merge:options.merge===true}]);
export const updateDoc=(ref,data)=>commit([{path:ref.path,kind:'update',data}]);
export const deleteDoc=ref=>commit([{path:ref.path,kind:'delete'}]);
export async function addDoc(col,data){const ref=doc(col);await setDoc(ref,data);return ref;}
export function writeBatch(){const writes=[],batch={set(ref,data,options={}){writes.push({path:ref.path,kind:'set',data,merge:options.merge===true});return batch;},
  update(ref,data){writes.push({path:ref.path,kind:'update',data});return batch;},delete(ref){writes.push({path:ref.path,kind:'delete'});return batch;},commit:()=>commit(writes)};return batch;}
export async function runTransaction(database,callback,options={}){
  const uid=auth.currentUser?.uid;
  for(let attempt=0;attempt<(options.maxAttempts||5);attempt++){
    const reads=new Map(),writes=[];
    const tx={async get(ref){if(ref.type!=='document')throw error('invalid-argument');
      if(!reads.has(ref.path))reads.set(ref.path,await getDoc(ref));return reads.get(ref.path);},
      set(ref,data,opts={}){writes.push({path:ref.path,kind:'set',data,merge:opts.merge===true});return tx;},
      update(ref,data){writes.push({path:ref.path,kind:'update',data});return tx;},delete(ref){writes.push({path:ref.path,kind:'delete'});return tx;}};
    const value=await callback(tx);
    if(auth.currentUser?.uid!==uid)throw error('cancelled');
    try{await commit(writes,[...reads.entries()].map(([path,snapshot])=>({path,version:snapshot._version})));return value;}
    catch(cause){if(cause.code!=='aborted'||attempt===(options.maxAttempts||5)-1)throw cause;}
  }
}
export function onSnapshot(target,...args){
  const observer=typeof args[0]==='function'||args[0]?.next?args[0]:args[1];
  const next=typeof observer==='function'?observer:observer.next.bind(observer);
  const onError=typeof observer==='object'?observer.error?.bind(observer):(typeof args[0]==='function'?args[1]:args[2]);
  const uid=auth.currentUser?.uid,key=JSON.stringify(pack([uid,target.type,target.path||querySpec(target)]));
  let entry=listeners.get(key);
  if(!entry){
    const subscribers=new Set();let timer,stopped=false,inFlight=false,lastSignature,lastResult;
    const poll=async()=>{
      if(stopped||inFlight)return;inFlight=true;
      try{
        if(auth.currentUser?.uid!==uid)throw error('cancelled');
        const result=target.type==='document'?await request({operation:'get',path:target.path}):await request({operation:'query',query:querySpec(target)});
        if(stopped)return;
        const signature=JSON.stringify(result);lastResult=result;
        const changed=signature!==lastSignature;lastSignature=signature;
        for(const sub of subscribers)if(changed||!sub.confirmed){sub.confirmed=true;sub.next(target.type==='document'?snapshot(result.document,target.firestore):snapshots(result.documents,target.firestore));}
      }catch(cause){if(!stopped)for(const sub of subscribers)sub.error?.(cause);lastSignature=undefined;}
      finally{inFlight=false;if(!stopped){clearTimeout(timer);timer=setTimeout(poll,typeof document!=='undefined'&&document.hidden?30000:5000);}}
    };
    entry={subscribers,refresh(){clearTimeout(timer);void poll();},cached(){return lastResult;},stop(){stopped=true;clearTimeout(timer);}};
    listeners.set(key,entry);
  }
  const subscriber={next,error:onError};entry.subscribers.add(subscriber);
  const cached=entry.cached();if(cached)queueMicrotask(()=>{if(entry.subscribers.has(subscriber))next(target.type==='document'?snapshot(cached.document,target.firestore,true):snapshots(cached.documents,target.firestore,true));});
  entry.refresh();
  return ()=>{entry.subscribers.delete(subscriber);if(!entry.subscribers.size){entry.stop();listeners.delete(key);}};
}
