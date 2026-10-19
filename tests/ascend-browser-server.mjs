import { createServer } from 'vite';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(path.resolve('functions/security.test.js'));
const testSource=fs.readFileSync('functions/security.test.js','utf8');
const support=testSource.slice(testSource.indexOf('function harness('),testSource.indexOf('const auth ='));
const makeHarness=new Function('require','fs','vm','crypto','__dirname','Buffer','Date','Intl','URL','AbortSignal',support+'return harness;')(require,fs,vm,crypto,path.resolve('functions'),Buffer,Date,Intl,URL,AbortSignal);
const services=new Map();
function fixtureService(scope){if(!services.has(scope)){const holder={mode:'coach'};const h=makeHarness({}, {fetch:async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:holder.mode==='deck'?JSON.stringify({cards:[{front:'A real draft question',back:'A reviewable draft answer'},{front:'Another question',back:'Another answer'}]}):'A fixture coaching response grounded in the supplied learning evidence.'}]}}]})})});services.set(scope,{h,holder});}return services.get(scope);}

const names=new Set(['getFirestore','doc','collection','query','where','orderBy','limit','onSnapshot','getDocs','runTransaction']);
function walk(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const p=directory+'/'+item.name;if(item.isDirectory())walk(p);else if(/\.tsx?$/.test(p))for(const match of fs.readFileSync(p,'utf8').matchAll(/import\s*\{([^}]+)\}\s*from\s*["']firebase\/firestore["']/gs))for(const n of match[1].split(',')){const name=n.trim().split(/\s+as\s+/)[0];if(name && !name.startsWith('type '))names.add(name);}}}walk('src');
const records=new Map(),counts=new Map();
const mock=`
 const uid=()=>new URLSearchParams(location.search).get('testUid') || 'isolated-browser-user';
 const scope=()=>new URLSearchParams(location.search).get('fixtureScope') || 'default';
 const ref=(...args)=>({path:args.filter(v=>typeof v==='string').join('/')});
 const request=async(action,body={})=>{if(window.__plannerOffline)throw new Error('Fixture connection unavailable');const r=await fetch('/__planner_fixture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,uid:uid(),scope:scope(),...body})});if(!r.ok)throw Object.assign(new Error('Fixture service unavailable'),{code:r.status===409?'aborted':'unavailable'});return r.json();};
 const snapshot=reply=>({exists:()=>reply.value!==null,data:()=>reply.value,docs:(reply.docs || []).map(d=>({id:d.id,data:()=>d.value})),metadata:{fromCache:false,hasPendingWrites:false}});
 export const getFirestore=()=>({}),doc=ref,collection=ref;
 export const query=(r,...constraints)=>({...r,constraints}),where=(field,op,value)=>({field,op,value}),orderBy=(field,direction)=>({sort:field,direction}),limit=count=>({count});
 export const onSnapshot=(target,...args)=>{const callbacks=args.filter(v=>typeof v==='function');let active=true,last='';
   if(new URLSearchParams(location.search).has('cacheMiss') && target.path.endsWith('/smart-v2'))callbacks[0]({exists:()=>false,data:()=>undefined,docs:[],metadata:{fromCache:true,hasPendingWrites:false}});
   const poll=async()=>{if(!active)return;try{if(new URLSearchParams(location.search).has('cacheMiss'))await new Promise(r=>setTimeout(r,120));const value=await request('read',{path:target.path,constraints:target.constraints});const key=JSON.stringify(value);if(active && key!==last){last=key;callbacks[0](snapshot(value));}}catch{if(active)callbacks[1]?.(new Error('Fixture unavailable'));}};
   queueMicrotask(poll);const timer=setInterval(poll,250);return()=>{active=false;clearInterval(timer);};
 };
 export const getDocs=async target=>snapshot(await request('read',{path:target.path,constraints:target.constraints}));
 export const runTransaction=async(_db,callback)=>{for(let attempt=0;attempt<3;attempt++){const reads={},writes=[];const transaction={get:async target=>{const reply=await request('read',{path:target.path});reads[target.path]=reply.revision;return snapshot(reply);},set:(target,value)=>writes.push({path:target.path,value})};const result=await callback(transaction);if(!writes.length)return result;if(window.__plannerFailSaves)throw new Error('Injected save failure');try{await request('commit',{reads,writes});return result;}catch(e){if(e.code!=='aborted' || attempt===2)throw e;}}};
 export const setDoc=async(target,value,options)=>request('set',{path:target.path,value,merge:options?.merge});
 export const updateDoc=(target,value)=>setDoc(target,value,{merge:true});
 export const deleteDoc=async target=>request('delete',{path:target.path});
 export const getDoc=async target=>snapshot(await request('read',{path:target.path}));
 export const sum=field=>({sum:field}),or=(...items)=>({or:items});
 export const getCountFromServer=async target=>{const docs=(await getDocs(target)).docs;return {data:()=>({count:docs.length})};};
 export const getAggregateFromServer=async(target,fields)=>{const docs=(await getDocs(target)).docs;return {data:()=>Object.fromEntries(Object.entries(fields).map(([key,descriptor])=>[key,docs.reduce((total,d)=>total+(Number(d.data()[descriptor.sum])||0),0)]))};};
 export const getDocsFromServer=getDocs;
 ${[...names].filter(n=>!['getFirestore','doc','collection','query','where','orderBy','limit','onSnapshot','getDocs','runTransaction','setDoc','updateDoc','deleteDoc','getDoc','getCountFromServer','getAggregateFromServer','getDocsFromServer','sum','or'].includes(n)).map(n=>`export const ${n}=()=>{throw new Error('Unsupported fixture operation: ${n}');};`).join('\n')}
`;
const server=await createServer({mode:'audit',server:{host:'127.0.0.1',port:4183,strictPort:true},plugins:[{
 name:'planner21-private-fixtures',enforce:'pre',
 resolveId(id){if(id==='firebase/firestore')return '\0planner-firestore';if(id==='firebase/functions')return '\0planner-functions';},
 load(id){if(id==='\0planner-firestore')return mock;if(id==='\0planner-functions')return `export const getFunctions=()=>({});export const httpsCallable=(_f,name)=>async data=>{const q=new URLSearchParams(location.search);const r=await fetch('/__planner_fixture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'call',name,data,scope:q.get('fixtureScope')||'default',uid:q.get('testUid')||'isolated-browser-user'})});const result=await r.json();if(!r.ok)throw Object.assign(new Error(result.error),{code:'functions/'+(result.code||'internal')});return {data:result};};`;},
 transform(code,id){const p=id.replaceAll('\\','/');
   if(p.endsWith('/src/lib/auditMode.ts'))return `export const isReadOnlyAudit=false,isLocalAi=false,useDevelopmentAi=false,useLocalMembership=false;`;
   if(p.endsWith('/src/contexts/AuthContext.tsx'))return `import React,{useEffect,useState} from 'react';import {onSnapshot,doc} from 'firebase/firestore';const params=new URLSearchParams(location.search),uid=params.get('testUid')||'isolated-browser-user';let current;const Context=React.createContext(null);export const AuthProvider=({children})=>{const [profile,setProfile]=useState(null);useEffect(()=>onSnapshot(doc({},'users',uid),s=>setProfile(s.exists()?s.data():null)),[]);const value={user:params.has('testUser')?{uid}:null,profile,loading:false,authError:'',isAdmin:false,signOut:async()=>{},completeOnboarding:async()=>{},updateLocalProfile:()=>{}};return React.createElement(Context.Provider,{value},children)};export const useAuth=()=>React.useContext(Context);`;
   if(p.endsWith('/src/lib/analytics.ts'))return `export const trackSiteVisit=async()=>{},trackUserEvent=async()=>{};`;
 },
 configureServer(server){server.middlewares.use('/__planner_fixture',(req,res)=>{let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{try{const body=JSON.parse(raw),scope=body.scope || 'default',uid=body.uid || 'isolated-browser-user';let db=records.get(scope);if(!db){db=fixtureService(scope).h.records;records.set(scope,db);}const allowed=path=>typeof path==='string' && (path==='users/'+uid || path.startsWith('users/'+uid+'/'));const reply=(code,data)=>{res.statusCode=code;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
   if(body.action==='call'){const {h,holder}=fixtureService(scope);const allowedCalls=['getMembershipStatus','startProTrial','cancelProRenewal','generateAiResponse','createSubscriptionCheckout'];if(!allowedCalls.includes(body.name))return reply(403,{error:'Fixture operation blocked'});holder.mode=body.data?.premiumMode;h.functions[body.name]({auth:{uid,token:{}},data:body.data||{}}).then(value=>reply(200,value)).catch(e=>reply(400,{error:e.message,code:e.code}));return;}
   if(body.action==='stats')return reply(200,{writes:counts.get(scope)||0,records:Object.fromEntries(db)});
   if(body.action==='seed'){for(const [path,value]of Object.entries(body.records || {})){if(!allowed(path))return reply(403,{});db.set(path,value);}return reply(200,{});}
   if(body.action==='read'){if(!allowed(body.path))return reply(403,{});const value=db.get(body.path) ?? null,prefix=body.path+'/';let docs=[...db].filter(([p])=>p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).map(([p,value])=>({id:p.slice(prefix.length),value}));for(const c of body.constraints || []){if(c.field)docs=docs.filter(d=>d.value[c.field]===c.value);if(c.sort)docs.sort((a,b)=>(a.value[c.sort]>b.value[c.sort]?1:-1)*(c.direction==='desc'?-1:1));if(c.count)docs=docs.slice(0,c.count);}return reply(200,{value,revision:value?.revision ?? null,docs});}
   if(body.action==='commit'){for(const [path,revision]of Object.entries(body.reads)){if(!allowed(path))return reply(403,{});if((db.get(path)?.revision ?? null)!==revision)return reply(409,{});}for(const w of body.writes){if(!allowed(w.path))return reply(403,{});}for(const w of body.writes)db.set(w.path,w.value);counts.set(scope,(counts.get(scope)||0)+1);return reply(200,{});}
   if(!allowed(body.path))return reply(403,{});if(body.action==='set')db.set(body.path,body.merge?{...db.get(body.path),...body.value}:body.value);else if(body.action==='delete')db.delete(body.path);counts.set(scope,(counts.get(scope)||0)+1);return reply(200,{});
 }catch(e){res.statusCode=500;res.end(JSON.stringify({error:'Fixture failure'}));}});});}
}]});await server.listen();console.log('Planner 2.1 isolated server ready: http://127.0.0.1:4183');
