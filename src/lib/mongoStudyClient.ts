// Staging-only callers import this module explicitly. No database fallback or
// existing Firebase transport is changed by adding these clients.
export async function mongoStudyRequest<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),
    headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok)throw Object.assign(new Error(response.status===409?'Record changed. Reload before saving.':
    response.status===401?'Sign in required.':'Study service request failed.'),{status:response.status});
  return response.json() as Promise<T>;
}
