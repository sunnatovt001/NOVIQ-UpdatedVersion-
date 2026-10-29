import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {readDatabaseConfig} from '../server/src/database.mjs';
const cli='.runtime/npm-vercel/_npx/67eb4586ca667318/node_modules/vercel/dist/index.js';
const project='prj_Q6DbtWFJDcyzg2P9c5VXnkbBTE3y',scope='sunnatovt001s-projects';
try{
  const db=readDatabaseConfig();
  if(db.database!=='noviq_staging'||!db.uri.includes('@cluster0.cpw71p0.mongodb.net'))throw new Error();
  const envFile='server/.env';let text=fs.readFileSync(envFile,'utf8');
  const secret=name=>{
    let value=process.env[name];
    if(!value){value=randomBytes(32).toString('hex');text+=`${text.endsWith('\n')?'':'\n'}${name}=${value}\n`;process.env[name]=value;}
    if(!/^[a-f0-9]{64}$/.test(value))throw new Error();return value;
  };
  const encryption=secret('FIREBASE_MIRROR_ENCRYPTION_KEY'),signing=secret('MONGO_FILE_SIGNING_KEY');
  fs.writeFileSync(envFile,text);
  const activate=process.argv.includes('--activate');
  const values={MONGODB_URI:db.uri,MONGODB_DATABASE:db.database,FIREBASE_MIRROR_ENCRYPTION_KEY:encryption,
    MONGO_FILE_SIGNING_KEY:signing,APP_ORIGIN:'https://noviqupdated.vercel.app'};
  if(activate)Object.assign(values,{NOVIQ_DATA_BACKEND:'mongodb',NOVIQ_FIREBASE_MIRROR:'true',VITE_DATA_BACKEND:'mongodb'});
  const body=Object.entries(values).map(([key,value])=>({key,value,type:['MONGODB_URI','FIREBASE_MIRROR_ENCRYPTION_KEY','MONGO_FILE_SIGNING_KEY'].includes(key)?'sensitive':'plain',target:['production']}));
  const auth=JSON.parse(fs.readFileSync('C:/Users/user/AppData/Roaming/com.vercel.cli/Data/auth.json','utf8'));
  if(typeof auth.token!=='string')throw new Error();
  const headers={Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'};
  const check=await fetch(`https://api.vercel.com/v9/projects/${project}?slug=${scope}`,{headers,signal:AbortSignal.timeout(15000)});
  const metadata=await check.json();
  if(!check.ok||metadata.id!==project||metadata.name!=='noviqupdated')throw new Error();
  const response=await fetch(`https://api.vercel.com/v10/projects/${project}/env?upsert=true&slug=${scope}`,{
    method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(!response.ok){
    let diagnostic=JSON.stringify({httpStatus:response.status,code:result.error?.code,message:result.error?.message});
    for(const value of Object.values(values))diagnostic=diagnostic.split(value).join('[redacted]');
    diagnostic=diagnostic.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/g,'[redacted-uri]').replace(/\b[a-f0-9]{64}\b/gi,'[redacted-key]');
    console.error(diagnostic.slice(0,1800));throw new Error();
  }
  console.log(JSON.stringify({project:'noviqupdated',scope,serverVariablesConfigured:Object.keys(values),credentialValuesPrinted:false,
    sourceFirebaseChanged:false,primaryBackendFlagChanged:activate}));
}catch{console.error('Vercel MongoDB configuration stopped. Verify CLI account/project access and server environment. No secret values were printed.');process.exitCode=1;}
