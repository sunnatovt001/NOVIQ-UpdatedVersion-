import {createServer} from 'vite';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),baseline=process.argv.includes('--baseline'),port=baseline?4185:4184;
process.env.GCLOUD_PROJECT='demo-noviq';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8089';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.FIRESTORE_DATABASE='(default)';
// Exercise authorization before the provider configuration check; no provider call is allowed.
process.env.GEMINI_API_KEY='local-negative-authorization-test-only';
const localFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{const host=new URL(typeof input==='string'?input:input.url||String(input)).hostname;if(!['127.0.0.1','localhost','[::1]'].includes(host))throw new Error('External provider calls are disabled in local verification');return localFetch(input,options);};
const require=createRequire(path.resolve('functions/index.js'));
const handlers=require('./index.js'),admin=require('firebase-admin');
const meta=JSON.parse(fs.readFileSync(path.resolve('tests/free-isolation-baseline.json'),'utf8'));
const baselinePaths=new Set([...meta.originalFiles.map(item=>item.path).filter(item=>/\.tsx?$/.test(item)),'src/App.tsx','src/features/pro/MembershipContext.tsx','src/pages/Dashboard.tsx','src/pages/Pricing.tsx','src/features/flashcards/Study.tsx']);
const cache=new Map();
const oldSource=relative=>{if(!cache.has(relative))cache.set(relative,execFileSync('git',['show',`${meta.recoveredBaselineCommit}:${relative}`],{cwd:root,encoding:'utf8',maxBuffer:4e6}));return cache.get(relative);};
const server=await createServer({mode:'development',server:{host:'127.0.0.1',port,strictPort:true},plugins:[{
 name:'real-local-entitlement-verification',enforce:'pre',
 configureServer(vite){
  vite.middlewares.use(async(req,res,next)=>{
   const match=req.url?.match(/^\/demo-noviq\/us-central1\/(\w+)/);
   if(!match)return next();
   res.setHeader('Access-Control-Allow-Origin',`http://127.0.0.1:${port}`);
   res.setHeader('Access-Control-Allow-Headers','authorization,content-type,x-firebase-appcheck');
   if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
   try{
    if(!['getMembershipStatus','startProTrial','cancelProRenewal','generateAiResponse'].includes(match[1]))throw Object.assign(new Error('Not available in local verification'),{code:'not-found'});
    const token=req.headers.authorization?.replace(/^Bearer /,'');
    if(!token)throw Object.assign(new Error('Authentication required'),{code:'unauthenticated'});
    const decoded=await admin.auth().verifyIdToken(token);
    let raw='';for await(const chunk of req)raw+=chunk;
    const data=JSON.parse(raw||'{}').data||{};
    const value=await handlers[match[1]].run({auth:{uid:decoded.uid,token:decoded},data,rawRequest:req});
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result:value}));
   }catch(error){
    res.statusCode=error.code==='unauthenticated'?401:error.code==='permission-denied'?403:400;
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:{status:String(error.code||'internal').toUpperCase().replaceAll('-','_'),message:error.message}}));
   }
  });
 },
 transform(input,id){
  const clean=id.split('?')[0].replaceAll('\\','/'),relative=clean.startsWith(root.replaceAll('\\','/')+'/')?clean.slice(root.length+1):'';
  let code=baseline&&baselinePaths.has(relative)?oldSource(relative):input;
  if(relative==='src/lib/firebaseApp.ts')return `import {initializeApp} from 'firebase/app';export const firebaseConfig={apiKey:'demo-key',authDomain:'demo-noviq.firebaseapp.com',projectId:'demo-noviq',appId:'demo-app',storageBucket:'demo-noviq.appspot.com',firestoreDatabaseId:'(default)'};export const app=initializeApp(firebaseConfig);`;
  if(relative==='src/lib/firebaseAuth.ts')return "import {connectAuthEmulator} from 'firebase/auth';\n"+code.replace('export const auth = getAuth(app);',`export const auth = getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});window.__isolationSignIn=(email,password)=>signInWithEmailAndPassword(auth,email,password);`);
  if(relative==='src/lib/firebase.ts')return `import {connectFirestoreEmulator} from 'firebase/firestore';import {connectFunctionsEmulator} from 'firebase/functions';import {connectStorageEmulator} from 'firebase/storage';\n`+code+`\nconnectFirestoreEmulator(db,'127.0.0.1',8089);connectFunctionsEmulator(functions,'127.0.0.1',${port});connectStorageEmulator(storage,'127.0.0.1',9199);`;
  return code!==input?code:undefined;
 }
}]});
await server.listen();console.log(`${baseline?'Recovered baseline':'Restored Free / verified PRO'} ready on ${port}; real Auth/Firestore emulators and production callable handlers, no mocked membership responses.`);
