// Isolated browser verification: no production account, credentials or writes.
// Run: node tests/browser-server.mjs; open http://127.0.0.1:4180/?testUser=1
import { createServer } from 'vite';
import fs from 'node:fs';
const files = fs.readdirSync('src/lib').filter(n => n.endsWith('.ts')).map(n => fs.readFileSync(`src/lib/${n}`, 'utf8'));
const pages = fs.readdirSync('src/pages').filter(n => n.endsWith('.tsx')).map(n => fs.readFileSync(`src/pages/${n}`, 'utf8'));
const components = fs.readdirSync('src/components').filter(n => n.endsWith('.tsx')).map(n => fs.readFileSync(`src/components/${n}`, 'utf8'));
const names = new Set(['getFirestore']);
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
 const write = () => { window.__unexpectedWrites = (window.__unexpectedWrites||0)+1; throw new Error('Browser fixture prohibits writes'); };
 ${[...names].filter(n=>!['getFirestore','collection','doc','collectionGroup','query','where','orderBy','limit','startAfter','or','sum','onSnapshot','getCountFromServer','getAggregateFromServer','getDocsFromServer','getDocs','getDoc'].includes(n)).map(n=>`export const ${n} = write;`).join('\n')}
`;
const server = await createServer({
 mode:'audit', server:{host:'127.0.0.1',port:4180,strictPort:true},
 plugins:[{
   name:'isolated-browser-fixtures', enforce:'pre',
   resolveId(id) { if(id === 'firebase/firestore') return '\0fixture-firestore'; },
   load(id) { if(id === '\0fixture-firestore') return mockFirestore; },
   transform(code,id) {
     if(id.replaceAll('\\','/').endsWith('/src/lib/gemini.ts'))return code.replace(/export async function askTutor\(/,'export async function actualAskTutor(')+`\nexport async function askTutor(...args){
       const mode=new URLSearchParams(location.search).get('testAI');
       if(!mode)return actualAskTutor(...args);
       window.__tutorRequests=(window.__tutorRequests||0)+1;
       await new Promise(resolve=>setTimeout(resolve,80));
       if(mode==='unavailable')throw new Error('Injected AI unavailable');
       return 'Verified fixture answer: '+args[0];
     }`;
     if(id.replaceAll('\\','/').endsWith('/src/contexts/AuthContext.tsx')) return `
       import React from 'react';
       const signedIn = new URLSearchParams(location.search).has('testUser');
       const value = {user:signedIn?{uid:new URLSearchParams(location.search).get('testUid')||'isolated-browser-user'}:null,profile:signedIn?{displayName:'Browser Test',onboarded:true,onboardingAnswers:{mainGoal:'IELTS',userType:'student',struggle:'focus'},goals:[],xp:0,settings:{}}:null,loading:false,authError:'',isAdmin:signedIn&&new URLSearchParams(location.search).has('testAdmin'),signOut:async()=>{},completeOnboarding:async()=>{},updateLocalProfile:()=>{}};
       export const useAuth = () => value;
       export const AuthProvider = ({children}) => children;
     `;
     if(id.replaceAll('\\','/').endsWith('/src/lib/analytics.ts')) return `export const trackSiteVisit=async()=>{},trackUserEvent=async()=>{};`;
   }
 }]
});
await server.listen(); console.log('Isolated browser fixture ready: http://127.0.0.1:4180');
