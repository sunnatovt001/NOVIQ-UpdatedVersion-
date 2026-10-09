import {withDeadline} from "./asyncRequest";

// One deadline includes authentication, HTTP transfer and response parsing.
export async function requestLocalAi(user:{getIdToken:(forceRefresh?:boolean)=>Promise<string>},payload:unknown,fetchImpl:typeof fetch=fetch,timeout=45000):Promise<{text?:string}>{
  const controller=new AbortController();
  const send=async(refresh:boolean)=>{
    const token=await user.getIdToken(refresh);
    if(controller.signal.aborted)throw new Error("AI_TIMEOUT");
    return fetchImpl("/__local-ai",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(payload),signal:controller.signal});
  };
  try{
    return await withDeadline((async()=>{
      let response=await send(false);
      // A rejected token cannot have invoked the provider on this endpoint.
      if(response.status===401)response=await send(true);
      let data:{text?:string;error?:string};
      try{data=await response.json();}catch{throw new Error("AI_BACKEND_UNAVAILABLE");}
      if(!response.ok)throw new Error(data.error || "AI_PROVIDER_UNAVAILABLE");
      return data;
    })(),timeout);
  }finally{controller.abort();}
}
