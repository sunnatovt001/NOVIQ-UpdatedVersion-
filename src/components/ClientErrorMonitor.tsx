import React, {useEffect,useState} from "react";
import {collection,limit,onSnapshot,orderBy,query,where} from "firebase/firestore";
import {db} from "@/src/lib/firebase";
type Entry={id:string;createdAt:string;source:string;code:string;route:string};
export const ClientErrorMonitor=()=>{
  const [entries,setEntries]=useState<Entry[]>([]);
  const [state,setState]=useState<"loading"|"ready"|"error">("loading");
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    setState("loading");
    const deadline=window.setTimeout(()=>setState("error"),15000);
    const stop=onSnapshot(query(collection(db,"analyticsEvents"),where("eventType","==","client_error"),orderBy("createdAt","desc"),limit(50)),{includeMetadataChanges:true},snapshot=>{
      if(snapshot.metadata.fromCache)return;
      window.clearTimeout(deadline);
      setEntries(snapshot.docs.map(doc=>{const data=doc.data();return {id:doc.id,createdAt:String(data.createdAt||""),source:String(data.details?.source||"unknown"),code:String(data.details?.code||"unknown"),route:String(data.details?.route||"unknown")};}));
      setState("ready");
    },error=>{console.error("Client error monitoring read failed",{code:error.code});window.clearTimeout(deadline);setState("error");});
    return()=>{stop();window.clearTimeout(deadline);};
  },[revision]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900" aria-label="Client error monitoring">
    <h3 className="text-lg font-bold">Client error monitoring</h3>
    <p className="mt-1 text-sm text-slate-600">Latest 50 signed-in client reports. Reporting is sampled and capped at 10 per account/device/day; no reports does not prove there were no errors.</p>
    {state==="loading"?<p role="status" className="mt-3">Loading error reports…</p>:state==="error"?<div role="alert" className="mt-3">Error reports temporarily unavailable. <button type="button" className="underline" onClick={()=>setRevision(v=>v+1)}>Retry error reports</button></div>:entries.length===0?<p className="mt-3 text-sm">No collected client errors.</p>:<ul className="mt-3 max-h-64 space-y-2 overflow-auto">{entries.map(entry=><li key={entry.id} className="break-words rounded-xl bg-slate-50 p-3 text-sm">{entry.route} · {entry.source} · {entry.code}<time className="ml-2 text-slate-500">{entry.createdAt}</time></li>)}</ul>}
  </section>;
};
