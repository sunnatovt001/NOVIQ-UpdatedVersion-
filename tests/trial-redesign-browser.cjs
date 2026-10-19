const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const origin='http://127.0.0.1:4184',scope='trial-redesign-'+Date.now(),uid='trial-review';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tashkent'}),page=await context.newPage();
const errors=[],production=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/firestore.googleapis.com|cloudfunctions.net/.test(r.url()))production.push(r.url());});
const api=async(action,data={})=>{const r=await context.request.post(origin+'/__planner_fixture',{data:{scope,uid,action,...data}});return r.json()};
const profile={uid,displayName:'Trial review',onboarded:true,onboardingAnswers:{mainGoal:'Science',userType:'student',struggle:'focus'},goals:[],xp:0,settings:{},subscription:{plan:'free',status:'active'}};
await api('seed',{records:{['users/'+uid]:profile}});const base=origin+`/?testUser=1&testUid=${uid}&fixtureScope=${scope}`;
fs.mkdirSync('artifacts/trial-redesign/screenshots',{recursive:true});
await context.route(/fonts.googleapis.com|fonts.gstatic.com|api.dicebear.com/,r=>r.abort());
for(const theme of ['light','dark'])for(const width of [1440,1024,768,390,320]){
await page.setViewportSize({width,height:1000});await page.goto(base+'#/pricing');await page.evaluate(t=>localStorage.setItem('noviq-theme',t),theme);await page.reload();await page.locator('.discovery-hero').waitFor();await page.getByRole('button',{name:'Try 7 days free',exact:true}).first().waitFor();
assert.equal(await page.locator('.noviq-app').evaluate(el=>el.classList.contains('dark')),theme==='dark');
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);
const heroButton=await page.getByRole('button',{name:'Try 7 days free',exact:true}).first().boundingBox();assert.ok(heroButton.y+heroButton.height<1000);
await page.screenshot({path:`artifacts/trial-redesign/screenshots/pricing-${theme}-${width}.png`,fullPage:true});
console.log('PASS layout '+theme+' '+width);
}
await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Try 7 days free',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();const activate=dialog.getByRole('button',{name:'Activate my 7-day trial',exact:true});assert.ok(await activate.isDisabled());await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal((await api('stats')).records['users/'+uid].subscription.plan,'free');console.log('PASS consent and dismissal preserve Free');
await page.getByRole('button',{name:'Try 7 days free',exact:true}).first().click();await dialog.getByRole('checkbox').check();await page.screenshot({path:'artifacts/trial-redesign/screenshots/trial-confirmation.png'});await activate.click();await page.waitForURL(/#\/dashboard/);await page.waitForFunction(()=>document.querySelector('.pro-environment'));const records=(await api('stats')).records;assert.equal(records['users/'+uid].subscription.status,'trialing');await page.reload();await page.waitForFunction(()=>document.querySelector('.pro-environment'));console.log('PASS server-authorized trial activation and refresh persistence');
await page.goto(base+'#/pricing');await page.locator('.ascend-status').waitFor();assert.equal(await page.getByRole('button',{name:'Try 7 days free',exact:true}).count(),0);console.log('PASS active trial uses membership view');
await api('seed',{records:{['users/'+uid]:{...profile,subscription:{...records['users/'+uid].subscription,status:'expired',currentPeriodEnd:new Date(Date.now()-1000).toISOString(),trialEndsAt:new Date(Date.now()-1000).toISOString()}}}});await page.reload();await page.locator('.pro-discovery').waitFor();await page.waitForFunction(()=>document.querySelector('.discovery-verification')?.textContent.includes('no longer available'));assert.equal(await page.getByRole('button',{name:'Try 7 days free',exact:true}).count(),0);console.log('PASS expiry returns to Free without offering second trial');
assert.deepEqual(errors,[]);assert.deepEqual(production,[]);console.log('PASS no page errors or production requests');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
