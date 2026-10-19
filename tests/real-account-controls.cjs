const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin='http://127.0.0.1:4184',uid='reference-controls',scope='controls-'+Date.now();
(async()=>{const browser=await chromium.launch({...(process.env.NOVIQ_BROWSER_CHANNEL === 'chromium' ? {} : {channel:'chrome'}),headless:true});try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tashkent'}),page=await context.newPage();
 const errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/firestore.googleapis.com|cloudfunctions.net|generativelanguage.googleapis.com/.test(r.url()))network.push(r.url());});
 const api=async(action,data={})=>(await context.request.post(origin+'/__planner_fixture',{data:{scope,uid,action,...data}})).json();
 const profile={uid,displayName:'Controls test',onboarded:true,onboardingAnswers:{mainGoal:'Science',userType:'student',struggle:'focus'},goals:[],xp:0,settings:{},subscription:{plan:'free',status:'active'}};
 await api('seed',{records:{[`users/${uid}`]:profile}});
 const base=origin+`/?testUser=1&testUid=${uid}&fixtureScope=${scope}`;
 fs.mkdirSync('artifacts/real-account/pro',{recursive:true});
 for(const theme of ['light','dark']){
  await page.goto(base+'#/pricing');await page.evaluate(theme=>localStorage.setItem('noviq-pro-theme',theme),theme);await page.reload();
  await page.getByRole('button',{name:'Try PRO free for 7 days',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Try PRO free for 7 days',exact:true});await dialog.waitFor();
  assert.ok(await dialog.getByRole('button',{name:'Activate my 7-day trial',exact:true}).isDisabled());
  const color=await dialog.evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(color,'rgb(9, 13, 26)');
  await page.screenshot({path:`artifacts/real-account/pro/trial-dialog-${theme}.png`});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal((await api('stats')).records[`users/${uid}`].subscription.plan,'free');
 }
 console.log('PASS original Free trial dialog preserved; consent required; dismissing never grants access');
 const now=Date.now();await api('seed',{records:{[`users/${uid}`]:{...profile,subscription:{plan:'pro',status:'active',currentPeriodEnd:new Date(now+30*86400000).toISOString()}},[`users/${uid}/proExperience/onboarding`]:{completed:true},[`users/${uid}/decks/deck`]:{title:'Controls deck',subject:'Science',tags:[],updatedAt:new Date(now).toISOString()},[`users/${uid}/decks/deck/cards/card`]:{front:'Question',back:'Answer',order:0,deckId:'deck',updatedAt:new Date(now).toISOString()}}});
 await page.goto(base+'#/dashboard');await page.reload();await page.locator('.pro-reference-overview').waitFor();
 const before=await page.locator('.noviq-app').getAttribute('data-pro-theme');await page.locator('.theme-toggle:visible').click();
 assert.notEqual(await page.locator('.noviq-app').getAttribute('data-pro-theme'),before);await page.reload();await page.locator('.pro-reference-overview').waitFor();assert.notEqual(await page.locator('.noviq-app').getAttribute('data-pro-theme'),before);
 console.log('PASS Dashboard theme control switches appearance and survives refresh');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>localStorage.setItem('noviq-pro-theme',theme),theme);await page.goto(base+'#/flashcards');await page.reload();await page.locator('.pro-card-preview').waitFor();
  await page.locator('.fc-launch-actions').getByRole('button',{name:'Start studying',exact:true}).click();
  const study=page.locator('.fc-study-backdrop.pro-study');await study.waitFor();assert.equal(await study.evaluate(el=>el.classList.contains('dark')),theme==='dark');
  const card=study.locator('.fc-flashcard');await card.click();await page.waitForTimeout(450);assert.ok((await card.innerText()).includes('Answer'));
  const color=await card.evaluate(el=>getComputedStyle(el).backgroundColor);assert.notEqual(color,'rgba(0, 0, 0, 0)');assert.equal(await card.evaluate(el=>getComputedStyle(el).color),theme==='light'?'rgb(20, 33, 61)':'rgb(248, 250, 252)');
  await page.screenshot({path:`artifacts/real-account/pro/study-dialog-${theme}.png`});
  await study.getByRole('button',{name:'Save & exit',exact:true}).click();await study.waitFor({state:'hidden'});
 }
 console.log('PASS real study dialog and answer flip retain correct themes and saved session behavior');
 await page.goto(base+'#/focus');await page.locator('.pro-focus-workspace').waitFor();
 await page.getByRole('button',{name:'Short break',exact:false}).click();assert.ok((await page.locator('.pro-focus-dial').innerText()).includes('05:00'));
 await page.getByRole('button',{name:'Reset timer',exact:true}).click();assert.ok((await page.locator('.pro-focus-dial').innerText()).includes('05:00'));
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);console.log('PASS Focus mode/reset and no page errors or production API requests');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
