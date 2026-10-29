import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const config=JSON.parse(fs.readFileSync('firebase-applet-config.json','utf8'));
const origin=process.argv[2];
if(origin!=='https://noviqupdated.vercel.app'&&!/^https:\/\/noviqupdated-[a-z0-9]+-sunnatovt001s-projects\.vercel\.app$/.test(origin||''))throw new Error('Explicit NOVIQ deployment required.');
const cli='.runtime/npm-vercel/_npx/67eb4586ca667318/node_modules/vercel/dist/index.js';
const suffix=randomBytes(10).toString('hex'),file=`.runtime/probe-${suffix}.curl`;
let identity;
const auth=async(operation,body)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${config.apiKey}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const value=await response.json();if(!response.ok)throw new Error(`Synthetic identity operation failed (${response.status}).`);return value;
};
const call=(path,body,method='POST')=>{
  const payload=JSON.stringify(JSON.stringify(body));
  fs.writeFileSync(file,`silent\nshow-error\nrequest = "${method}"\nheader = "Origin: ${origin}"\nheader = "Content-Type: application/json"\nheader = "Authorization: Bearer ${identity.idToken}"\n${method==='POST'?`data = ${payload}\n`:''}write-out = "\\n%{http_code}"\n`);
  const result=spawnSync(process.execPath,[cli,'curl',origin+path,'--scope','sunnatovt001s-projects','--','--config',file],{encoding:'utf8',timeout:90000,windowsHide:true,maxBuffer:1024*1024});
  const text=result.stdout||'',index=text.lastIndexOf('\n'),status=Number(text.slice(index+1));
  if(result.status!==0||!status)throw new Error('Deployment request failed.');
  let data;try{data=JSON.parse(text.slice(0,index));}catch{throw new Error(`Deployment returned non-JSON (${status}).`);}
  return {status,data};
};
try{
  const email=`noviq-migration-probe-${suffix}@example.invalid`;
  identity=await auth('signUp',{email,password:randomBytes(24).toString('base64url'),returnSecureToken:true});
  assert.equal(identity.email,email);assert.ok(identity.localId);
  const path=`users/${identity.localId}`;
  assert.equal(call('/api/data',{operation:'commit',writes:[{path,kind:'create',data:{uid:identity.localId,email,xp:0,isAdmin:false,createdAt:new Date().toISOString()}}]}).status,200);
  assert.equal(call('/api/data',{operation:'get',path}).status,200);
  assert.equal(call('/api/data',{operation:'commit',writes:[{path,kind:'update',data:{xp:999}}]}).status,403);
  assert.equal(call('/api/data',{operation:'get',path:'users/migration-probe-other-owner'}).status,403);
  const note=`${path}/notebookNotes/probe`;
  assert.equal(call('/api/data',{operation:'commit',writes:[{path:note,kind:'set',data:{title:'Synthetic migration verification',content:'No customer data'}}]}).status,200);
  const saved=call('/api/data',{operation:'get',path:note});assert.equal(saved.status,200);assert.equal(saved.data.document.data.title,'Synthetic migration verification');
  assert.equal(call('/api/data',{operation:'query',query:{path:`${path}/notebookNotes`}}).status,200);
  const membership=call('/api/rpc?name=getMembershipStatus',{data:{}});assert.equal(membership.status,200);
  const bytes=Buffer.from('{"probe":true}');
  const upload=call('/api/files',{action:'begin',path:`${path}/notebookSources/probe.json`,contentType:'application/json',size:bytes.length});assert.equal(upload.status,200);
  const id=upload.data.id;
  assert.equal(call('/api/files',{action:'chunk',id,index:0,base64:bytes.toString('base64')}).status,200);
  const complete=call('/api/files',{action:'complete',id});assert.equal(complete.status,200);
  const download=call(complete.data.url,undefined,'GET');assert.equal(download.status,200);assert.equal(download.data.probe,true);
  assert.equal(call('/api/files',{action:'delete',id}).status,200);
  assert.equal(call('/api/data',{operation:'commit',writes:[{path:note,kind:'delete'}]}).status,200);
  console.log(JSON.stringify({deployment:origin,identityVerified:true,ownerIsolation:true,protectedXp:true,noteWriteReadQueryDelete:true,fileUploadDownloadDelete:true,membershipCallable:true,primaryDomain:origin==='https://noviqupdated.vercel.app'}));
}catch(error){console.error(`Isolated deployment verification failed: ${error instanceof assert.AssertionError?'unexpected API behavior':error.message}`);process.exitCode=1;}
finally{
  fs.rmSync(file,{force:true});
  if(identity?.idToken&&identity.email===`noviq-migration-probe-${suffix}@example.invalid`){
    try{await auth('delete',{idToken:identity.idToken});console.log('Disposable verification identity removed.');}
    catch{console.error('Disposable verification identity cleanup requires retry.');process.exitCode=1;}
  }
}
