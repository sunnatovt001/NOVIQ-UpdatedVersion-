import {auth} from './firebaseAuth';
export const getStorage=app=>({app,__mongo:true});
export function ref(storage,path){return {storage,fullPath:path,name:path.split('/').at(-1)};}
async function call(body){
  const user=auth.currentUser;if(!user)throw new Error('Sign in required.');
  const token=await user.getIdToken();if(auth.currentUser?.uid!==user.uid)throw new Error('Account changed.');
  const response=await fetch('/api/files',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(auth.currentUser?.uid!==user.uid)throw new Error('Account changed.');
  if(!response.ok)throw Object.assign(new Error('File request failed.'),{code:response.status===401?'storage/unauthorized':'storage/unknown'});
  return response.json();
}
function base64(bytes){let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);}
async function upload(target,data,metadata={},progress=()=>{},cancelled=()=>false){
  const blob=data instanceof Blob?data:new Blob([data]),userId=auth.currentUser?.uid;
  const contentType=metadata.contentType||blob.type||'application/octet-stream';
  const start=await call({action:'begin',path:target.fullPath,contentType,size:blob.size});
  for(let offset=0,index=0;offset<blob.size;offset+=start.chunkSize,index++){
    if(cancelled()||auth.currentUser?.uid!==userId)throw new Error('Upload cancelled.');
    const bytes=new Uint8Array(await blob.slice(offset,offset+start.chunkSize).arrayBuffer());
    await call({action:'chunk',id:start.id,index,base64:base64(bytes)});
    progress({ref:target,totalBytes:blob.size,bytesTransferred:Math.min(blob.size,offset+start.chunkSize),state:'running'});
  }
  const complete=await call({action:'complete',id:start.id});target._url=complete.url;
  return {ref:target,totalBytes:blob.size,bytesTransferred:blob.size,state:'success',metadata:{contentType,size:blob.size}};
}
export const uploadBytes=(target,data,metadata)=>upload(target,data,metadata);
export function uploadBytesResumable(target,data,metadata){
  const observers=new Set();let cancelled=false,result,failure;
  const task={snapshot:{ref:target,bytesTransferred:0,totalBytes:data.size??data.byteLength,state:'running'},
    on(event,next,error,complete){if(event!=='state_changed')throw new Error('Unsupported upload observer.');const observer={next,error,complete};observers.add(observer);
      if(result)queueMicrotask(()=>complete?.());if(failure)queueMicrotask(()=>error?.(failure));return()=>observers.delete(observer);},
    cancel(){cancelled=true;return true;}};
  const work=upload(target,data,metadata,snapshot=>{task.snapshot=snapshot;for(const observer of observers)observer.next?.(snapshot);},()=>cancelled)
    .then(snapshot=>{result=snapshot;task.snapshot=snapshot;for(const observer of observers)observer.complete?.();return snapshot;},error=>{failure=error;for(const observer of observers)observer.error?.(error);throw error;});
  work.catch(()=>{});task.then=work.then.bind(work);task.catch=work.catch.bind(work);return task;
}
export async function getDownloadURL(target){return new URL(target._url||(await call({action:'resolve',path:target.fullPath})).url,window.location.origin).href;}
export async function deleteObject(target){const url=new URL(await getDownloadURL(target));await call({action:'delete',id:url.searchParams.get('download')});}
