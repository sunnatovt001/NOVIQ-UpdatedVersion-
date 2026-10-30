const allowed=new Set(['firestore','mongodb']);
function backendConfiguration(env,{match=false}={}){
  const client=env.VITE_DATA_BACKEND||'firestore',server=env.NOVIQ_DATA_BACKEND||'firestore';
  if(!allowed.has(client)||!allowed.has(server))throw new Error('Data backend must be firestore or mongodb.');
  if(match&&client!==server)throw new Error('VITE_DATA_BACKEND and NOVIQ_DATA_BACKEND must select the same data authority.');
  return {client,server};
}
module.exports={backendConfiguration};
