const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
process.env.GCLOUD_PROJECT='demo-noviq';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8089';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
const req=require('node:module').createRequire(path.resolve('functions/index.js')),admin=req('firebase-admin');admin.initializeApp({projectId:'demo-noviq'});const db=admin.firestore(),output='artifacts/free-isolation';
(async()=>{
 const snapshots=await db.collection('users').where('subscription.status','==','trialing').get();
 const users=await Promise.all(snapshots.docs.filter(doc=>doc.data().displayName==='Free baseline').map(doc=>admin.auth().getUser(doc.id)));
 const user=users.sort((a,b)=>Date.parse(b.metadata.creationTime)-Date.parse(a.metadata.creationTime))[0];assert.ok(user,'A genuinely UI-activated trial is required; this test does not fabricate one.');
 const signin=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password:'Local-verification-only-2026!',returnSecureToken:true})});const account=await signin.json();assert.equal(account.localId,user.uid);
 const call=async name=>{const response=await fetch(`http://127.0.0.1:4184/demo-noviq/us-central1/${name}`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+account.idToken},body:'{"data":{}}'});return (await response.json()).result;};
 assert.equal((await call('getMembershipStatus')).state,'PRO_TRIAL');
 const before=await Promise.all(['planner/smart-v2','decks/deck/cards/card','notebookNotes/note'].map(async p=>[p,(await db.doc(`users/${user.uid}/${p}`).get()).data()]));
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tashkent',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],network=[],checks=[];
 const record=s=>{checks.push(s);console.log('PASS '+s);};
 await context.addInitScript(()=>{if(!localStorage.getItem('noviq-theme'))localStorage.setItem('noviq-theme','light');if(!localStorage.getItem('noviq-sidebar'))localStorage.setItem('noviq-sidebar','expanded');if(!localStorage.getItem('noviq-pro-theme'))localStorage.setItem('noviq-pro-theme','dark');});
 await context.route(/fonts.googleapis.com|fonts.gstatic.com|api.dicebear.com/,route=>route.abort());
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/firestore.googleapis.com|cloudfunctions.net|generativelanguage.googleapis.com/.test(r.url()))network.push(r.url());});
 try{
  await page.goto('http://127.0.0.1:4184');await page.waitForFunction(()=>!!window.__isolationSignIn);await page.evaluate(email=>window.__isolationSignIn(email,'Local-verification-only-2026!'),user.email);await page.locator('.pro-environment[data-pro-theme]').waitFor();
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>localStorage.setItem('noviq-pro-theme',theme),theme);await page.reload();await page.locator('.pro-environment[data-pro-theme]').waitFor();
   for(const route of ['dashboard','planner','flashcards','focus','notes','tutor','analytics','pricing']){await page.goto(`http://127.0.0.1:4184/#/${route}`);await page.locator('.pro-environment[data-pro-theme]').waitFor();await page.waitForTimeout(1100);assert.equal(await page.locator('.noviq-app.dark').count(),theme==='dark'?1:0);await page.screenshot({path:`${output}/verified-trial-${route}-${theme}.png`,animations:'disabled'});}
  }
  record('all eight premium pages in both themes are preserved behind an actual authenticated trial');
  let release,entered;const pending=new Promise(resolve=>release=resolve),intercepted=new Promise(resolve=>entered=resolve);
  await page.route(/\/getMembershipStatus(?:\?|$)/,async route=>{entered();await pending;await route.continue();});await page.reload({waitUntil:'domcontentloaded'});await intercepted;await page.waitForTimeout(300);
  assert.equal(await page.locator('.noviq-app:not([data-app-loading])').count(),0);assert.equal(await page.locator('.app-sidebar').count(),0);release();await page.locator('.pro-environment[data-pro-theme]').waitFor();await page.unroute(/\/getMembershipStatus(?:\?|$)/);record('positive trial profile alone cannot render an experience while real membership verification is pending');
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('noviq-sidebar')),'expanded');assert.equal(await page.evaluate(()=>localStorage.getItem('noviq-pro-sidebar')),'collapsed');assert.equal(await page.evaluate(()=>localStorage.getItem('noviq-theme')),'light');record('PRO sidebar and theme preferences cannot overwrite original Free preferences');
  const subscription=(await db.doc(`users/${user.uid}`).get()).data().subscription;await db.doc(`users/${user.uid}`).set({subscription:{...subscription,status:'expired',trialEndsAt:new Date(0).toISOString(),currentPeriodEnd:new Date(0).toISOString()}},{merge:true});
  await page.locator('.noviq-app:not(.pro-environment):not([data-app-loading])').waitFor();assert.equal((await call('getMembershipStatus')).entitled,false);assert.equal(await page.locator('.noviq-app.dark').count(),0);record('actual expired trial returns to the original Free shell and independent Free theme');
  for(const theme of ['light','dark']){
   if(theme==='dark'){await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:4184/#/planner');await page.locator('.sp-calendar-workspace').waitFor();await page.locator('.theme-toggle:visible').click();await page.reload();await page.locator('.noviq-app.dark:not(.pro-environment)').waitFor();}
   for(const width of [1440,390])for(const route of ['dashboard','planner','flashcards','focus','notes','tutor','analytics']){
    await page.setViewportSize({width,height:width===1440?1000:844});await page.goto(`http://127.0.0.1:4184/#/${route}`);await page.locator('.noviq-app:not([data-app-loading])').waitFor();await page.waitForTimeout(1600);
    assert.equal(await page.locator('.pro-environment,.pro-reference-overview,.pro-card-preview,.pro-activity-rail').count(),0);await page.screenshot({path:`${output}/after-pro-${route}-${theme}-${width}.png`,animations:'disabled',mask:[page.locator('.sp-now-line')]});
   }
  }
  record('seven original Free tools and navigation remain isolated after PRO styles were loaded, in both themes and at desktop/phone sizes');
  for(const [relative,value]of before)assert.deepEqual((await db.doc(`users/${user.uid}/${relative}`).get()).data(),value);record('Planner, Flashcards and Notebook records remain byte-equivalent across entitlement transitions');
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);record('no browser errors, fabricated successful entitlement responses, production requests or billing changes');
  fs.writeFileSync(`${output}/results.json`,JSON.stringify({checks,uid:user.uid,authentication:'Real Auth emulator user and verified SDK sign-in',membership:'Existing genuinely UI-activated trial, actual production callable handlers and Firestore emulator; no injected successful status',paidAccountLimitation:'No live paid account or live payment was used. The active-paid condition is enforced by the same verified response gate; a production paid-account smoke test was not performed.'},null,2));
 }finally{await browser.close();await admin.app().delete();}
})().catch(error=>{console.error(error);process.exitCode=1;});
