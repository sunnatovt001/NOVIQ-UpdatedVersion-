// Local encrypted snapshot and restore drill. No managed backup, billing,
// production writes, production deletes or PITR configuration are performed.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const canonical=value=>JSON.stringify(value,(_,v)=>v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=value=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
async function request(base,route,method='GET',body,token) {
  const response=await fetch(`${base}/${route}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${await token()}`}:{Authorization:'Bearer owner'})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.ok){const failure=await response.json();throw new Error(`Firestore snapshot/restore request failed (HTTP ${response.status}): ${failure.error?.message || 'request rejected'}; no production records changed`);}
  return response.json();
}
async function collect(project,database,readTime,token) {
  const prefix=`projects/${project}/databases/${database}/documents`;
  const documents=[];
  const parents=[prefix];
  const visit=async parent=>{
    let collectionToken;
    do {
      const result=await request('https://firestore.googleapis.com/v1',`${parent}:listCollectionIds`,'POST',{pageSize:1000,readTime,...(collectionToken?{pageToken:collectionToken}:{})},token);
      for(const collection of result.collectionIds||[]) {
        let pageToken;
        do {
          const params=new URLSearchParams({pageSize:'500',showMissing:'true',readTime,...(pageToken?{pageToken}:{})});
          const page=await request('https://firestore.googleapis.com/v1',`${parent}/${encodeURIComponent(collection)}?${params}`,'GET',undefined,token);
          for(const doc of page.documents||[]) {
            if(doc.fields) {
              if(documents.length>=20000)throw new Error('Local backup read budget exceeded; refusing to label a partial backup complete');
              documents.push({path:doc.name.slice(prefix.length+1),fields:doc.fields});
            }
            parents.push(doc.name);
          }
          pageToken=page.nextPageToken;
        }while(pageToken);
      }
      collectionToken=result.nextPageToken;
    }while(collectionToken);
  };
  let offset=0;
  while(offset<parents.length){
    const batch=parents.slice(offset,offset+8);
    await Promise.all(batch.map(visit));offset+=batch.length;
    if(offset%200<8)console.log(`Snapshot traversal: ${documents.length} documents collected`);
  }
  return {version:1,project,database,readTime,documents};
}
function encrypt(snapshot,key) {
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(snapshot),'utf8'),cipher.final()]);
  return JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')});
}
function decrypt(text,key) {
  const envelope=JSON.parse(text);
  if(envelope.version!==1)throw new Error('Unsupported encrypted backup version');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8'));
}
async function restoreLocal(snapshot) {
  // Fixed loopback endpoint and demo project: no user-supplied cloud destination.
  const base='http://127.0.0.1:8089/v1',database='projects/demo-noviq/databases/(default)';
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Restore requires the isolated local emulator at 127.0.0.1:8089');
  if(snapshot.version!==1 || !Array.isArray(snapshot.documents))throw new Error('Invalid backup manifest');
  const paths=new Set();
  for(const doc of snapshot.documents){
    const parts=typeof doc.path==='string'?doc.path.split('/'):[];
    if(parts.length<2 || parts.length%2 || parts.some(part=>!part || part==='.' || part==='..') || paths.has(doc.path) || !doc.fields || typeof doc.fields!=='object')throw new Error('Invalid or duplicate backup document');
    paths.add(doc.path);
  }
  for(let offset=0;offset<snapshot.documents.length;) {
    const docs=[];let bytes=0;
    while(offset<snapshot.documents.length && docs.length<400){
      const doc=snapshot.documents[offset],size=Buffer.byteLength(JSON.stringify(doc))+200;
      if(size>8*1024*1024)throw new Error('Backup document exceeds local restore request budget');
      if(docs.length && bytes+size>8*1024*1024)break;
      docs.push(doc);bytes+=size;offset++;
    }
    await request(base,`${database}/documents:commit`,'POST',{writes:docs.map(doc=>({update:{name:`${database}/documents/${doc.path}`,fields:doc.fields}}))});
    for(const doc of docs) {
      const restored=await request(base,`${database}/documents/${doc.path.split('/').map(encodeURIComponent).join('/')}`);
      if(hash(restored.fields)!==hash(doc.fields))throw new Error('Local restore verification mismatch');
    }
  }
  return {documents:snapshot.documents.length,manifestHash:hash(snapshot.documents),verified:true,productionWrites:0,destination:'demo-noviq local emulator'};
}
async function main() {
  const mode=process.argv[2];
  if(mode==='--restore-local') {
    const backup=path.resolve(process.argv[3]),key=Buffer.from(fs.readFileSync(`${backup}.key`,'utf8').trim(),'hex');
    const receipt=await restoreLocal(decrypt(fs.readFileSync(backup,'utf8'),key));
    fs.writeFileSync('artifacts/production-audit/local-restore.json',JSON.stringify({...receipt,checkedAt:new Date().toISOString()},null,2));
    console.log(JSON.stringify(receipt));return;
  }
  if(mode!=='--snapshot')throw new Error('Use --snapshot <firebase-cli-directory> or --restore-local <encrypted-backup>');
  const {config,cli,db}=await require('./cloud-client.cjs')(process.argv[3]);await db.terminate();
  const api=require(path.join(cli,'lib/apiv2.js'));
  // Use the cloud's clock: a workstation clock ahead of Google rejects readTime.
  const clock=await fetch(`https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}`,{headers:{Authorization:`Bearer ${await api.getAccessToken()}`},signal:AbortSignal.timeout(30000)});
  const serverTime=Date.parse(clock.headers.get('date'));
  if(!clock.ok || !Number.isFinite(serverTime))throw new Error('Cannot establish a consistent cloud snapshot timestamp');
  const readTime=new Date(serverTime-10000).toISOString();
  const snapshot=await collect(config.projectId,config.firestoreDatabaseId,readTime,()=>api.getAccessToken());
  const directory=path.resolve('backups/cloud');fs.mkdirSync(directory,{recursive:true});
  const output=path.join(directory,`snapshot-${Date.now()}.noviq-backup`),key=crypto.randomBytes(32);
  fs.writeFileSync(`${output}.key`,key.toString('hex'),{mode:0o600,flag:'wx'});
  fs.writeFileSync(output,encrypt(snapshot,key),{mode:0o600,flag:'wx'});
  fs.writeFileSync('artifacts/production-audit/local-backup.json',JSON.stringify({file:path.relative(process.cwd(),output),documents:snapshot.documents.length,manifestHash:hash(snapshot.documents),readTime,productionWrites:0,encrypted:true},null,2));
  console.log(JSON.stringify({file:path.relative(process.cwd(),output),documents:snapshot.documents.length,encrypted:true,productionWrites:0}));
}
module.exports={encrypt,decrypt,hash,restoreLocal};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
