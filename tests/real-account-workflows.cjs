const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const origin = 'http://127.0.0.1:4184', uid = 'visual-reference-user', scope = 'visual-'+Date.now();
const model={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/planner/smartPlannerModel.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:model,require:()=>({}),Date,Intl,crypto:require('node:crypto').webcrypto});
(async()=>{
 const browser=await chromium.launch({...(process.env.NOVIQ_BROWSER_CHANNEL === 'chromium' ? {} : {channel:'chrome'}),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1100},timezoneId:'Asia/Tashkent'}),page=await context.newPage();
  const errors=[],production=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/firestore.googleapis.com|cloudfunctions.net|generativelanguage.googleapis.com/.test(r.url()))production.push(r.url());});
  await context.route(/fonts.googleapis.com|fonts.gstatic.com|api.dicebear.com|soundhelix.com/,r=>r.abort());
  const api=async(action,data={})=>(await context.request.post(origin+'/__planner_fixture',{data:{scope,uid,action,...data}})).json();
  const now=Date.now(),start=model.localInstant(model.dateKey(now,'Asia/Tashkent'),'10:00','Asia/Tashkent'),plan={...model.initialSmartPlan(uid),ready:true,completedOnboardingAt:now,revision:'visual-preserve',sequence:1,persistenceVersion:3,previousRevision:null,timezone:'Asia/Tashkent',subjects:[{...model.newSubject('Biology'),id:'biology',target:'Understand cell structure',deadline:'2026-12-01'}],tasks:[{id:'cells',subjectId:'biology',title:'Review cell structure',minutes:30,priority:2,description:'Review saved study notes',type:'Reading',resource:'',flexibility:'flexible',repeat:'none',repeatUntil:'',createdAt:now,completed:false}],sessions:[{id:'cell-session',taskId:'cells',start,end:start+1800000}]};
  const profile={uid,displayName:'Reference review',onboarded:true,onboardingAnswers:{mainGoal:'Biology',userType:'student',struggle:'focus'},goals:['Understand biology'],xp:0,settings:{},subscription:{plan:'pro',status:'active',currentPeriodEnd:new Date(now+86400000*30).toISOString()}};
  await api('seed',{records:{[`users/${uid}`]:profile,[`users/${uid}/planner/smart-v2`]:plan,[`users/${uid}/proExperience/onboarding`]:{completed:true},[`users/${uid}/notebookNotes/cells`]:{id:'cells',title:'Cell structure',content:'The cell is the basic unit of life.\n\nThe nucleus stores genetic information. Mitochondria release energy through cellular respiration.\n\nReview question: How does the membrane regulate transport?',tags:['Biology'],userId:uid,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()},[`users/${uid}/decks/cells`]:{title:'Cell structure',subject:'Biology',updatedAt:new Date(now).toISOString(),tags:[]},...Object.fromEntries([['Nucleus','Stores genetic information'],['Mitochondria','Release energy through cellular respiration'],['Cell membrane','Regulates transport into and out of the cell']].map(([front,back],i)=>[`users/${uid}/decks/cells/cards/card-${i}`,{id:'card-'+i,deckId:'cells',front,back,order:i,updatedAt:new Date(now).toISOString()}])),...Object.fromEntries(Array.from({length:7},(_,i)=>[`users/${uid}/studySessions/focus-${i}`,{duration:(i+1)*300,subject:'Biology',category:'focus',timestamp:new Date(now-i*86400000).toISOString(),verified:true}]))}});
 const base=origin+`/?testUser=1&testUid=${uid}&fixtureScope=${scope}`;
 await page.goto(base+'#/planner');const sp=page.locator('.smart-planner');await sp.waitFor();
 await sp.getByRole('button',{name:'Add task',exact:true}).first().click();
 await sp.getByLabel('What do you need to work on?',{exact:true}).fill('Recovery verification assignment');
 const form=sp.locator('form').filter({has:page.locator('input[maxlength="180"]')});
 await form.getByRole('button',{name:'Add task',exact:true}).click();
 await page.waitForTimeout(1000);
 assert.ok((await api('stats')).records[`users/${uid}/planner/smart-v2`].tasks.some(t=>t.title==='Recovery verification assignment'));
 await page.reload();await sp.locator('.sp-assignment-row').filter({hasText:'Recovery verification assignment'}).waitFor();
 console.log('PASS task creation persists through reload without replacing existing tasks');
 await page.goto(base+'#/notes');const notes=page.locator('.pro-notebook-workspace');await notes.waitFor();await notes.getByRole('button',{name:'Cell structure',exact:false}).first().click();
 const content=notes.locator('textarea').first();await content.fill('Saved recovery verification note.');await notes.getByRole('button',{name:'Save',exact:true}).click();await page.waitForTimeout(600);await page.reload();await notes.waitFor();await notes.getByRole('button',{name:'Cell structure',exact:false}).first().click();assert.equal(await notes.locator('textarea').first().inputValue(),'Saved recovery verification note.');
 console.log('PASS Notebook edit/save survives reload using the existing persistence path');
 await page.goto(base+'#/flashcards');await page.getByRole('button',{name:'Create deck',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Deck title',{exact:true}).fill('Recovery new deck');await dialog.getByRole('button',{name:'Create & add cards',exact:true}).click();await page.waitForTimeout(700);
 const records=(await api('stats')).records;assert.ok(Object.entries(records).some(([path,value])=>path.includes('/decks/')&&value.title==='Recovery new deck'));assert.equal(records[`users/${uid}/decks/cells/cards/card-0`].back,'Stores genetic information');
 console.log('PASS deck creation preserves existing cards');assert.deepEqual(errors,[]);assert.deepEqual(production,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
