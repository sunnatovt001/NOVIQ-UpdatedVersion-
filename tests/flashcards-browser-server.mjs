// Isolated browser verification: no production account, credentials or writes.
// Run: node tests/browser-server.mjs; open http://127.0.0.1:4181/?testUser=1
import { createServer } from 'vite';
import fs from 'node:fs';
const files = fs.readdirSync('src/lib').filter(n => n.endsWith('.ts')).map(n => fs.readFileSync(`src/lib/${n}`, 'utf8'));
const pages = fs.readdirSync('src/pages').filter(n => n.endsWith('.tsx')).map(n => fs.readFileSync(`src/pages/${n}`, 'utf8'));
const components = fs.readdirSync('src/components').filter(n => n.endsWith('.tsx')).map(n => fs.readFileSync(`src/components/${n}`, 'utf8'));
const names = new Set(['getFirestore','runTransaction']);
for (const code of [...files, ...pages, ...components]) {
  for (const match of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']firebase\/firestore["']/gs)) {
    for (const token of match[1].split(',')) if (token.trim() && !token.trim().startsWith('type ')) names.add(token.trim().split(/\s+as\s+/)[0]);
  }
}
const mockFirestore = `
 const service = () => new URLSearchParams(location.search).get('service') || 'ready';
 const fail = () => Object.assign(new Error('Injected service unavailable'), {code:'unavailable'});
 const ref = (...args) => ({path:args.filter(v=>typeof v==='string').join('/')});
 export const getFirestore = () => ({}), collection = ref, doc = ref, collectionGroup = ref;
 export const query = (target,...constraints) => ({...target,constraints}), where = ref, orderBy = ref, limit = count=>({count}), startAfter=doc=>({after:doc.id}), or = ref, sum = ref;
 const historyDocs = target => {
   if(!new URLSearchParams(location.search).has('testHistory') || !target.path?.endsWith('/tutorMessages'))return [];
   const after=target.constraints?.find(item=>item?.after)?.after;
   const offset=after?Number(after.slice(1))+1:0;
   return Array.from({length:Math.max(0,Math.min(80,90-offset))},(_,i)=>{
     const index=offset+i;
     return {id:'h'+index,data:()=>({role:index%2?'assistant':'user',content:'Saved history '+index,createdAt:new Date(1700000000000-index*1000).toISOString()})};
   });
 };
 export const onSnapshot = (target, ...args) => {
   const callbacks = args.filter(v => typeof v === 'function'); let active = true;
   if(fixture() && service()!=='unavailable'){const items=listeners.get(target.path)||new Set();items.add(callbacks[0]);listeners.set(target.path,items);queueMicrotask(()=>{if(active)callbacks[0](snapshot(target))});return ()=>{active=false;items.delete(callbacks[0]);};}

   queueMicrotask(() => {
     if (!active || service() === 'pending') return;
     if (service() === 'unavailable') return callbacks[1]?.(fail());
     const docs=historyDocs(target);
     callbacks[0]({exists:()=>false, data:()=>undefined, docs, size:docs.length, metadata:{fromCache:false,hasPendingWrites:false}});
   });
   return () => { active = false; };
 };
 const read = async value => { if(service()==='pending') return new Promise(()=>{}); if(service()==='unavailable') throw fail(); return value; };
 export const getCountFromServer = () => read({data:()=>({count:0})});
 export const getAggregateFromServer = () => read({data:()=>({xp:0})});
 export const getDocsFromServer = target => read({docs:historyDocs(target||{})});
 export const getDocs = getDocsFromServer, getDoc = () => read({exists:()=>false,data:()=>undefined});

 const fixture=()=>new URLSearchParams(location.search).has('testFlashcards');
 const dbKey='noviq:test:flashcardCloud';
 const readDB=()=>JSON.parse(localStorage.getItem(dbKey)||'{}');
 const listeners=new Map();
 const snapshot=target=>{const records=readDB();const prefix=target.path+'/';const docs=Object.entries(records).filter(([key])=>key.startsWith(prefix) && !key.slice(prefix.length).includes('/')).map(([key,value])=>({id:key.slice(prefix.length),data:()=>value}));return {exists:()=>!!records[target.path],data:()=>records[target.path],docs,size:docs.length,metadata:{fromCache:false,hasPendingWrites:false}};};
 const fixtureWrite=async(target,data,options={})=>{if(!fixture())throw new Error('Fixture writes prohibited');if(window.__fixtureFailWrites)throw fail();const records=readDB();records[target.path]=options.merge?{...records[target.path],...data}:data;localStorage.setItem(dbKey,JSON.stringify(records));for(const [path,items]of listeners)if(target.path===path || target.path.startsWith(path+'/'))items.forEach(fn=>queueMicrotask(()=>fn(snapshot({path}))));};
 export const runTransaction=async(_db,callback)=>{if(!fixture())throw new Error('Fixture transactions prohibited');const writes=[];const result=await callback({get:async target=>snapshot(target),set:(target,value)=>writes.push([target,value])});if(window.__fixtureFailWrites)throw fail();for(const [target,value]of writes)await fixtureWrite(target,value);return result;};
 const write = () => { window.__unexpectedWrites = (window.__unexpectedWrites||0)+1; throw new Error('Browser fixture prohibits writes'); };

 ${[...names].filter(n=>!['getFirestore','collection','doc','collectionGroup','query','where','orderBy','limit','startAfter','or','sum','onSnapshot','getCountFromServer','getAggregateFromServer','getDocsFromServer','getDocs','getDoc','runTransaction'].includes(n)).map(n=>n==='setDoc' || n==='updateDoc'?`export const ${n} = fixtureWrite;`:n==='deleteDoc'?`export const ${n}=write;`:`export const ${n} = write;`).join('\n')}
`;
const server = await createServer({
 mode:'audit', server:{host:'127.0.0.1',port:4181,strictPort:true},
 plugins:[{
   name:'isolated-browser-fixtures', enforce:'pre',
   resolveId(id) { if(id === 'firebase/firestore') return '\0fixture-firestore'; if(id === 'firebase/functions') return '\0fixture-functions'; },
   load(id) { if(id === '\0fixture-firestore') return mockFirestore; if(id === '\0fixture-functions') return `export const getFunctions=()=>({});export const httpsCallableFromURL=()=>{throw new Error('Production backend forbidden in isolated fixture')}; export const httpsCallable=()=>async()=>{throw Object.assign(new Error('Isolated test service unavailable'),{code:'functions/unavailable'})};`; },
   transform(code,id) {
     if(id.replaceAll('\\','/').endsWith('/src/lib/auditMode.ts'))return code.replace('export const isReadOnlyAudit = ["audit", "local-ai"].includes(import.meta.env.MODE);','export const isReadOnlyAudit = !new URLSearchParams(location.search).has("testFlashcards");');
     if(id.replaceAll('\\','/').endsWith('/src/lib/gemini.ts'))return code.replace('export async function generateDefinitionSuggestions(', 'async function actualDefinitionSuggestions(')+`
       export async function generateDefinitionSuggestions(term,subject,source,target){
         if(!new URLSearchParams(location.search).has('testFlashcards')) return actualDefinitionSuggestions(term,subject,source,target);
         window.__definitionCalls=(window.__definitionCalls||0)+1;
         await new Promise(resolve=>setTimeout(resolve,350));
         if(window.__fixtureAiFail)throw new Error('Injected AI unavailable');
         if(window.__fixtureAiMalformed)return '{}';
         return JSON.stringify([{front:term,back:'Very determined',translation:'qat’iyatli',example:'She persisted.',hint:'Think persistence'}]);
       }
     `;

     if(id.replaceAll('\\','/').endsWith('/src/lib/progress.ts')) return code.replace('export const startStudySession = async (', 'const actualStartStudySession = async (').replace('export const persistStudySession = async (', 'const actualPersistStudySession = async (') + `
       export const startStudySession = async (...args) => {
         if(!new URLSearchParams(location.search).has('testTimer')) return actualStartStudySession(...args);
         window.__timerStarts=(window.__timerStarts||0)+1;
         if(window.__timerFail) throw new Error('Injected private provider diagnostic');
         return 'fixture-receipt';
       };
       export const persistStudySession = async (...args) => {
         if(!new URLSearchParams(location.search).has('testTimer')) return actualPersistStudySession(...args);
         window.__completionCalls=(window.__completionCalls||0)+1;
         window.__completionPayload=args;
         if(window.__completionFail) throw new Error('Injected completion failure');
         return args[3];
       };
     `;
     if(id.replaceAll('\\','/').endsWith('/src/lib/gemini.ts'))return code.replace(/export async function askTutor\(/,'export async function actualAskTutor(').replace(/export async function askNotebook\(/,'export async function actualAskNotebook(')+`\nexport async function askTutor(...args){
       const mode=new URLSearchParams(location.search).get('testAI');
       if(!mode)return actualAskTutor(...args);
       window.__tutorRequests=(window.__tutorRequests||0)+1;
       await new Promise(resolve=>setTimeout(resolve,80));
       if(mode==='unavailable')throw new Error('Injected AI unavailable');
       if(mode==='planner-valid') return JSON.stringify({
         title:'Generated fixture flashcards', instructions:'Review these fixture cards.',
         successCriteria:['Review every card'],
         flashcards:[{id:'generated-card',front:'Generated fixture front',back:'Generated fixture back',weaknessTag:'reading'}]
       });
       return 'Verified fixture answer: '+args[0];
     }
     export async function askNotebook(...args){
       if(!new URLSearchParams(location.search).get('testAI'))return actualAskNotebook(...args);
       return askTutor(...args);
     }`;
     if(id.replaceAll('\\','/').endsWith('/src/contexts/AuthContext.tsx')) return `
       import React from 'react';
       const signedIn = new URLSearchParams(location.search).has('testUser');
       const value = {user:signedIn?{uid:new URLSearchParams(location.search).get('testUid')||'isolated-browser-user'}:null,profile:signedIn&&!new URLSearchParams(location.search).has('testMissingProfile')?{displayName:'Browser Test',onboarded:true,onboardingAnswers:{mainGoal:'IELTS',userType:'student',struggle:'focus'},goals:[],xp:0,settings:{}}:null,loading:new URLSearchParams(location.search).has('testAuthLoading'),authError:new URLSearchParams(location.search).get('testAccountError')||'',isAdmin:signedIn&&new URLSearchParams(location.search).has('testAdmin'),signOut:async()=>{},completeOnboarding:async()=>{},updateLocalProfile:()=>{}};
       export const useAuth = () => value;
       export const AuthProvider = ({children}) => children;
     `;
     if(id.replaceAll('\\','/').endsWith('/src/lib/analytics.ts')) return `export const trackSiteVisit=async()=>{},trackUserEvent=async()=>{};`;
   }
 }]
});
await server.listen(); console.log('Isolated browser fixture ready: http://127.0.0.1:4181');
