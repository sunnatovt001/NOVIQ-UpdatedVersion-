import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {collection,getDocs,limit,onSnapshot,orderBy,query,startAfter,type QueryDocumentSnapshot} from '@/src/lib/dataStore';
import {db} from "./firebase";
import {isReadOnlyAudit} from "./auditMode";
import {loadLocalDataStrict,makeSyncId,saveLocalData} from "./localStore";
import {getOfflineSyncQueue,writeDocWithQueue,type OfflineSyncOperation} from "./offlineSync";
import {withDeadline} from "./asyncRequest";

export type ChatAttachment={id:string;name:string;mimeType:string;size:number;previewUrl?:string;text?:string;contentStored?:boolean};
export type ChatMessage={id:string;role:"user"|"assistant";content:string;createdAt?:number;conversationId?:string;attachments?:ChatAttachment[];pendingCloud?:boolean};
export const chatTime=(value: unknown):number=>{
  const stamp=value as {toMillis?:()=>number;seconds?:number}|null;
  const time=typeof stamp?.toMillis==="function"?stamp.toMillis():typeof stamp?.seconds==="number"?stamp.seconds*1000:typeof value==="number"?value:typeof value==="string"?Date.parse(value):NaN;
  return Number.isFinite(time)?time:0;
};
export const mergeChatMessages=(...groups:ChatMessage[][]):ChatMessage[]=>{
  const items=new Map<string,ChatMessage>();
  for(const group of groups)for(const item of group)if(item && typeof item.id==="string" && ["user","assistant"].includes(item.role) && typeof item.content==="string")items.set(item.id,item);
  return [...items.values()].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id));
};
// Only a matching, acknowledged queue record can clear a local pending flag.
export const reconcileTutorSync=(messages:ChatMessage[],operations:OfflineSyncOperation[],uid:string):ChatMessage[]=>{
  const synced=new Map(operations.filter(item=>item.userId===uid && item.status==="synced" && item.path.length===4 && item.path[0]==="users" && item.path[1]===uid && item.path[2]==="tutorMessages").map(item=>[item.path[3],item.data]));
  let changed=false;
  const result=messages.map(message=>{
    const record=synced.get(message.id);
    if(!message.pendingCloud || !record || record.content!==message.content || record.role!==message.role || record.conversationId!==message.conversationId)return message;
    changed=true;return {...message,pendingCloud:false};
  });
  return changed?result:messages;
};
const key=(uid:string)=>`noviq:tutor-history:v1:${uid}`;
const PAGE=80;
export function useTutorHistory(uid?:string){
  const [all,setAll]=useState<ChatMessage[]>([]);
  const [stateUid,setStateUid]=useState<string|undefined>();
  const [activeId,setActiveId]=useState("legacy");
  const [error,setError]=useState("");
  const [saveError,setSaveError]=useState("");
  const [revision,setRevision]=useState(0);
  const [hasOlder,setHasOlder]=useState(false);
  const [loadingOlder,setLoadingOlder]=useState(false);
  const generation=useRef(0),cursor=useRef<QueryDocumentSnapshot|null>(null),loadingRef=useRef(false);
  const owner=useRef(uid);owner.current=uid;
  const cacheWritable=useRef(true);
  const cache=(records:ChatMessage[],userId:string)=>{
    if(!cacheWritable.current)return;
    try{
      if(JSON.stringify(loadLocalDataStrict(key(userId),[]))===JSON.stringify(records))return;
      saveLocalData(key(userId),records);
      window.dispatchEvent(new CustomEvent("noviq:tutor-history",{detail:{uid:userId}}));
    }
    catch{setSaveError("This device could not save the conversation. Keep this page open and retry saving.");}
  };
  useEffect(()=>{
    const run=++generation.current;
    setStateUid(uid);setAll([]);setActiveId("legacy");setError("");setSaveError("");setHasOlder(false);cursor.current=null;loadingRef.current=false;setLoadingOlder(false);
    cacheWritable.current=true;
    if(!uid)return;
    try{
      const saved=loadLocalDataStrict<ChatMessage[]>(key(uid),[]);
      if(!Array.isArray(saved))throw new Error("Invalid chat cache");
      setAll(mergeChatMessages(saved));
      const selection=loadLocalDataStrict<string>(`${key(uid)}:active`,"legacy");
      if(typeof selection==="string")setActiveId(selection);
    }catch{cacheWritable.current=false;setSaveError("Saved device history could not be read. It has been preserved; cloud history is still available.");}
    const refresh=(event:Event)=>{
      if((event as CustomEvent).detail?.uid===uid){
        try{const saved=loadLocalDataStrict<ChatMessage[]>(key(uid),[]);setAll(current=>mergeChatMessages(current,saved));}catch{/* Preserve corrupt cache. */}
      }
    };
    window.addEventListener("noviq:tutor-history",refresh);
    const refreshSync=()=>{
      if(owner.current!==uid)return;
      try{const queue=getOfflineSyncQueue();setAll(current=>reconcileTutorSync(current,queue,uid));}
      catch{/* The queue preserves its data and SyncRecovery displays the failure. */}
    };
    refreshSync();
    window.addEventListener("noviq:offline-sync",refreshSync);
    const refreshStorage=(event:StorageEvent)=>{if(event.key==="noviq:offlineSyncQueue:v1")refreshSync();};
    window.addEventListener("storage",refreshStorage);
    const timer=window.setTimeout(()=>setError("Saved conversation temporarily unavailable. You can still ask a question."),15000);
    const stop=onSnapshot(query(collection(db,"users",uid,"tutorMessages"),orderBy("createdAt","desc"),limit(PAGE)),{includeMetadataChanges:true},snapshot=>{
      if(run!==generation.current)return;
      const messages=snapshot.docs.map(document=>({...document.data(),id:document.id,createdAt:chatTime(document.data().createdAt)} as ChatMessage));
      setAll(current=>{const merged=mergeChatMessages(current,messages);return merged;});
      if(snapshot.metadata.fromCache)return;
      window.clearTimeout(timer);setError("");
      if(!cursor.current){cursor.current=snapshot.docs.at(-1)||null;setHasOlder(snapshot.docs.length===PAGE);}
    },failure=>{window.clearTimeout(timer);console.error("Tutor history read failed",{code:failure.code});if(run===generation.current)setError("Saved conversation temporarily unavailable. You can still ask a question.");});
    return()=>{generation.current++;window.clearTimeout(timer);stop();window.removeEventListener("noviq:tutor-history",refresh);window.removeEventListener("noviq:offline-sync",refreshSync);window.removeEventListener("storage",refreshStorage);};
  },[uid,revision]);
  const pendingCloud=all.some(message=>message.pendingCloud);
  useEffect(()=>{
    if(!pendingCloud)setSaveError(current=>/cloud sync|cloud save failed|could not sync/.test(current)?"":current);
  },[pendingCloud]);
  useEffect(()=>{if(uid && stateUid===uid)cache(all,uid);},[all,uid,stateUid]);
  const select=useCallback((id:string)=>{
    setActiveId(id);if(uid)try{saveLocalData(`${key(uid)}:active`,id);}catch{setSaveError("Chat selection could not be saved on this device.");}
  },[uid]);
  const newChat=()=>select(makeSyncId("conversation"));
  const add=useCallback((message:Omit<ChatMessage,"id">,conversationId=activeId)=>{
    if(!uid)throw new Error("Sign in to save your conversation.");
    const record:ChatMessage={...message,id:makeSyncId("tutor-message"),createdAt:Date.now(),conversationId,pendingCloud:!isReadOnlyAudit};
    setAll(current=>{const merged=mergeChatMessages(current,[record]);return merged;});
    if(!isReadOnlyAudit){
      const data=JSON.parse(JSON.stringify({...record,createdAt:new Date(record.createdAt!).toISOString()}));delete data.id;delete data.pendingCloud;
      void writeDocWithQueue({userId:uid,path:["users",uid,"tutorMessages",record.id],data,merge:true}).then(status=>{
        if(owner.current!==uid)return;
        if(status!=="synced")setSaveError("Conversation is saved on this device and waiting for cloud sync.");
        else setAll(current=>current.map(item=>item.id===record.id?{...item,pendingCloud:false}:item));
        window.dispatchEvent(new CustomEvent("noviq:tutor-history",{detail:{uid}}));
      }).catch(failure=>{console.error("Tutor message save failed",{code:failure?.code});if(owner.current===uid)setSaveError("Conversation cloud save failed. Your device copy is retained; retry saving.");});
    }
    return record;
  },[uid,activeId]);
  const retrySaving=async()=>{
    if(!uid || isReadOnlyAudit)return;
    try{
      const pending=all.filter(item=>item.pendingCloud && item.id.startsWith("tutor-message-"));
      let pendingCloud=false;
      for(const item of pending){if(owner.current!==uid)return;const data=JSON.parse(JSON.stringify({...item,createdAt:new Date(item.createdAt||0).toISOString()}));delete data.id;delete data.pendingCloud;
        const status=await writeDocWithQueue({userId:uid,path:["users",uid,"tutorMessages",item.id],data,merge:true});pendingCloud ||= status!=="synced";
        if(status==="synced" && owner.current===uid)setAll(current=>current.map(record=>record.id===item.id?{...record,pendingCloud:false}:record));}
      if(owner.current===uid)setSaveError(pendingCloud?"Conversation is waiting for cloud sync.":"");
    }catch{if(owner.current===uid)setSaveError("Conversation could not sync. Keep the device copy and retry.");}
  };
  const loadOlder=async()=>{
    if(!uid || !cursor.current || loadingRef.current)return;
    const run=generation.current;loadingRef.current=true;setLoadingOlder(true);
    try{
      const snapshot=await withDeadline(getDocs(query(collection(db,"users",uid,"tutorMessages"),orderBy("createdAt","desc"),startAfter(cursor.current),limit(PAGE))),15000);
      if(run!==generation.current)return;
      cursor.current=snapshot.docs.at(-1)||cursor.current;setHasOlder(snapshot.docs.length===PAGE);setError("");
      const records=snapshot.docs.map(document=>({...document.data(),id:document.id,createdAt:chatTime(document.data().createdAt)} as ChatMessage));
      setAll(current=>{const merged=mergeChatMessages(current,records);return merged;});
    }catch(failure){console.error("Older tutor history read failed",failure);if(run===generation.current)setError("Older conversations could not load. Please retry.");}
    finally{if(run===generation.current){loadingRef.current=false;setLoadingOlder(false);}}
  };
  const conversations=useMemo(()=>{
    const groups=new Map<string,{id:string;title:string;updatedAt:number}>();
    for(const message of all){const id=message.conversationId||"legacy",existing=groups.get(id);
      if(!existing)groups.set(id,{id,title:id==="legacy"?"Old conversations":message.content.slice(0,65),updatedAt:message.createdAt||0});
      else existing.updatedAt=Math.max(existing.updatedAt,message.createdAt||0);}
    if(!groups.has(activeId))groups.set(activeId,{id:activeId,title:activeId==="legacy"?"Old conversations":"New conversation",updatedAt:Date.now()});
    return [...groups.values()].sort((a,b)=>b.updatedAt-a.updatedAt);
  },[all,activeId]);
  const visible=useMemo(()=>all.filter(message=>(message.conversationId||"legacy")===activeId),[all,activeId]);
  return {messages:visible,activeId,conversations,select,newChat,add,error,saveError:saveError || (pendingCloud?"Conversation is saved on this device and waiting for cloud sync.":""),retrySaving,hasOlder,loadingOlder,loadOlder,retry:()=>setRevision(value=>value+1)};
}
