const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
process.env.GCLOUD_PROJECT='demo-noviq';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8089';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
const req=require('node:module').createRequire(path.resolve('functions/index.js')),admin=req('firebase-admin');
admin.initializeApp({projectId:'demo-noviq'});const db=admin.firestore();
const model={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/planner/smartPlannerModel.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:model,require:()=>({}),Date,Intl,crypto:require('node:crypto').webcrypto});
const output='artifacts/free-isolation',password='Local-verification-only-2026!',email=`isolation-${Date.now()}@example.test`;
const routes=[['dashboard','.today-shell'],['planner','.sp-calendar-workspace'],['flashcards','.fc-layout'],['focus','[data-page-scroll] audio'],['notes','[data-page-scroll] textarea'],['tutor','.tutor-workspace'],['analytics','[data-page-scroll] header']];
(async()=>{fs.mkdirSync(output,{recursive:true});
 const signup=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 const account=await signup.json();assert.ok(account.localId,JSON.stringify(account));const uid=account.localId;
 const now=Date.now(),day=model.dateKey(now,'Asia/Tashkent'),start=model.localInstant(day,'10:00','Asia/Tashkent');
 const profile={uid,email,displayName:'Free baseline',onboarded:true,onboardingAnswers:{mainGoal:'Science',userType:'student',struggle:'focus'},goals:['Science'],xp:0,settings:{},subscription:{plan:'free',status:'active'}};
 const plan={...model.initialSmartPlan(uid),ready:true,completedOnboardingAt:now,revision:'preserve-free-records',sequence:1,persistenceVersion:3,previousRevision:null,timezone:'Asia/Tashkent',subjects:[{...model.newSubject('Science'),id:'science'}],tasks:[{id:'task',subjectId:'science',title:'Saved science task',minutes:30,priority:2,description:'Saved private work',type:'Reading',resource:'',flexibility:'flexible',repeat:'none',repeatUntil:'',createdAt:now,completed:false}],sessions:[{id:'session',taskId:'task',start,end:start+1800000}]};
 await db.doc(`users/${uid}`).set(profile);await db.doc(`users/${uid}/planner/smart-v2`).set(plan);
 await db.doc(`users/${uid}/decks/deck`).set({title:'Saved private deck',subject:'Science',tags:[],updatedAt:new Date(now).toISOString()});
 await db.doc(`users/${uid}/decks/deck/cards/card`).set({front:'Saved question',back:'Saved answer',deckId:'deck',order:0,updatedAt:new Date(now).toISOString()});
 await db.doc(`users/${uid}/notebookNotes/note`).set({title:'Saved private note',content:'Original saved notebook content.',tags:[],userId:uid,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
 const before={plan:(await db.doc(`users/${uid}/planner/smart-v2`).get()).data(),card:(await db.doc(`users/${uid}/decks/deck/cards/card`).get()).data(),note:(await db.doc(`users/${uid}/notebookNotes/note`).get()).data()};
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],production=[],checks=[];
 const record=s=>{checks.push(s);console.log('PASS '+s);};
 const open=async(port,theme)=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tashkent',reducedMotion:'reduce'});
  await context.addInitScript(theme=>{if(!localStorage.getItem('noviq-theme'))localStorage.setItem('noviq-theme',theme);if(!localStorage.getItem('noviq-pro-theme'))localStorage.setItem('noviq-pro-theme','dark');},theme);
  await context.route(/fonts.googleapis.com|fonts.gstatic.com|api.dicebear.com/,route=>route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/firestore.googleapis.com|cloudfunctions.net|generativelanguage.googleapis.com/.test(r.url()))production.push(r.url());});
  await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>!!window.__isolationSignIn);await page.evaluate(({email,password})=>window.__isolationSignIn(email,password),{email,password});
  await page.locator('.noviq-app').waitFor();return {context,page,port};
 };
 const capture=async(session,label,theme)=>{
  const {page,port}=session;
  for(const width of [1440,390])for(const [route,selector] of routes){
   await page.setViewportSize({width,height:width===1440?1000:844});await page.goto(`http://127.0.0.1:${port}/#/${route}`);await page.locator('.noviq-app').waitFor();
   if(route!=='notes')await page.locator(selector).first().waitFor({state:'attached'});
   else await page.getByRole('heading',{name:'Notebook',exact:true}).waitFor();
   await page.waitForTimeout(1600);
   assert.equal(await page.locator('.noviq-app').evaluate(root=>getComputedStyle(root).display),'flex','baseline and restored CSS must be fully compiled');
   assert.equal(await page.locator('.pro-environment').count(),0,route+' must remain Free');
   assert.equal(await page.locator('.pro-card-preview,.pro-reference-overview,.pro-activity-rail').count(),0,route+' contains premium UI');
   await page.screenshot({path:`${output}/${label}-${route}-${theme}-${width}.png`,animations:'disabled',mask:[page.locator('.sp-now-line')]});
  }
 };
 try{
  for(const theme of ['light','dark']){
   const baseline=await open(4185,theme),restored=await open(4184,theme);
   await capture(baseline,'baseline',theme);await capture(restored,'restored',theme);
   await baseline.context.close();await restored.context.close();record(`original and restored Free captured: seven pages, sidebar, ${theme}, desktop/phone`);
  }
  const session=await open(4184,'light'),{page}=session;
  await page.evaluate(uid=>{localStorage.setItem(`noviq:${uid}:proAppearance`,'cinematic');localStorage.setItem('noviq-pro-theme','dark');},uid);await page.reload();await page.locator('.noviq-app:not(.pro-environment)').waitFor();
  assert.equal(await page.locator('.noviq-app.dark').count(),0);record('local appearance flags and PRO theme cannot grant access or change the Free theme');
  const callable=async(name,data={})=>{
   const response=await fetch(`http://127.0.0.1:4184/demo-noviq/us-central1/${name}`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+account.idToken},body:JSON.stringify({data})});return {status:response.status,body:await response.json()};
  };
  const free=await callable('getMembershipStatus');assert.equal(free.body.result.entitled,false);
  const denied=await callable('generateAiResponse',{feature:'intelligence',premiumMode:'coach',contents:'Explain saved work'});assert.equal(denied.status,403,JSON.stringify(denied));record('actual authenticated backend denies Free premium AI access');
  await page.goto('http://127.0.0.1:4184/#/pricing');await page.getByRole('button',{name:'Try PRO free for 7 days',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Try PRO free for 7 days',exact:true});await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Activate my 7-day trial',exact:true}).click();
  await page.locator('.pro-environment').waitFor();await page.waitForTimeout(700);
  const verified=await callable('getMembershipStatus');assert.equal(verified.body.result.state,'PRO_TRIAL');assert.equal(verified.body.result.entitled,true);record('real authenticated trial activation and actual backend verification switch to PRO');
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>localStorage.setItem('noviq-pro-theme',theme),theme);await page.reload();await page.locator('.pro-environment').waitFor();
   for(const route of ['dashboard','planner','flashcards','focus','notes','tutor','analytics','pricing']){
    await page.goto(`http://127.0.0.1:4184/#/${route}`);await page.locator('.pro-environment').waitFor();await page.waitForTimeout(1000);
    assert.equal(await page.locator('.noviq-app.dark').count(),theme==='dark'?1:0);
    await page.screenshot({path:`${output}/verified-trial-${route}-${theme}.png`,animations:'disabled'});
   }
  }
  await page.reload();await page.locator('.pro-environment').waitFor();record('all eight PRO pages and both themes require a real verified trial and survive refresh');
  let release;const pending=new Promise(resolve=>release=resolve);
  await page.route('**/getMembershipStatus',async route=>{await pending;await route.continue();});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(500);assert.equal(await page.locator('.noviq-app:not([data-app-loading])').count(),0);assert.equal(await page.locator('.app-sidebar').count(),0);release();await page.locator('.pro-environment').waitFor();await page.unroute('**/getMembershipStatus');record('pending verification shows neither Free nor PRO; the real server response selects the experience');
  const trial=(await db.doc(`users/${uid}`).get()).data().subscription;
  await db.doc(`users/${uid}`).set({subscription:{...trial,status:'expired',trialEndsAt:new Date(0).toISOString(),currentPeriodEnd:new Date(0).toISOString()}},{merge:true});
  await page.locator('.noviq-app:not(.pro-environment)').waitFor();assert.equal(await page.locator('.noviq-app.dark').count(),0);assert.equal((await callable('getMembershipStatus')).body.result.entitled,false);
  await capture(session,'after-pro','light');record('actual expired trial returns to original Free, retaining its independent light theme after PRO CSS was loaded');
  assert.deepEqual((await db.doc(`users/${uid}/planner/smart-v2`).get()).data(),before.plan);assert.deepEqual((await db.doc(`users/${uid}/decks/deck/cards/card`).get()).data(),before.card);assert.deepEqual((await db.doc(`users/${uid}/notebookNotes/note`).get()).data(),before.note);record('exact Planner, Flashcards and Notebook records survive both experience transitions');
  assert.deepEqual(errors,[]);assert.deepEqual(production,[]);record('no browser exceptions, mocked successful membership responses, or production API requests');
  fs.writeFileSync(`${output}/results.json`,JSON.stringify({checks,uid,authentication:'Firebase Auth emulator; real SDK sign-in and verified tokens',membership:'Unmodified production callable handlers and Firestore emulator; trial created through explicit real trial activation',paidSubscription:'No live paid account or payment was fabricated; separate live paid-account smoke test remains unperformed.',productionRequests:production.length},null,2));
 }finally{await browser.close();await admin.app().delete();}
})().catch(error=>{console.error(error);process.exitCode=1;});
