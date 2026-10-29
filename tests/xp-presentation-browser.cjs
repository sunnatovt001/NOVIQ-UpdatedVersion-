const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const uid='xp-ui',scope='xp-ui-'+Date.now(),origin='http://127.0.0.1:4184';
const api=async records=>(await page.request.post(origin+'/__planner_fixture',{data:{scope,uid,action:'seed',records}})).json();
const progress={xp:1370,counters:{studyEvents:3,longFocusSessions:5,focusSeconds:18000,uniqueRecallCards:34},achievements:{A01:{unlockedAt:'2026-10-28T08:00:00Z',tier:'Bronze',xp:20},A02:{unlockedAt:'2026-10-28T08:00:00Z',tier:'Bronze',xp:20},A03:{unlockedAt:'2026-10-28T08:00:00Z',tier:'Silver',xp:50}}};
await api({[`users/${uid}`]:{uid,displayName:'Saidamin',email:'student@example.com',onboarded:true,xp:45,settings:{},onboardingAnswers:{mainGoal:'Science',userType:'student',struggle:'focus'},subscription:{plan:'pro',status:'active',currentPeriodEnd:new Date(Date.now()+864000000).toISOString()}},[`users/${uid}/trusted/progress`]:progress,[`users/${uid}/proExperience/onboarding`]:{completed:true}});
const base=origin+`/?testUser=1&testUid=${uid}&fixtureScope=${scope}`;
await page.goto(base+'#/profile');await page.locator('#achievements').waitFor();
await page.waitForFunction(()=>document.querySelector('[data-xp-indicator]')?.textContent.includes('1,370'));
assert.equal(await page.locator('.achievement-card[data-unlocked=true]').count(),3);
await page.screenshot({path:'artifacts/xp-verification/pro-profile-first.png'});
await api({[`users/${uid}/trusted/progress`]:{...progress,xp:1470}});
await page.waitForFunction(()=>document.querySelector('[data-xp-indicator]')?.textContent.includes('1,470'));assert.equal(await page.getByRole('dialog').count(),0);console.log('PASS live XP update reaches header quietly without level/reward popups');
await page.locator('#achievements').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:'artifacts/xp-verification/pro-badges-liquid.png'});
for(const width of [1440,1280,1024]){await page.setViewportSize({width,height:900});await page.goto(base+'#/dashboard');await page.locator('[data-pro-shell-header]').waitFor();const chip=page.locator('[data-xp-indicator]:visible');assert.equal(await chip.count(),1);const r=await chip.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width);const avatar=await page.getByRole('button',{name:'Open profile',exact:true}).boundingBox();assert.ok(r.x+r.width+8<=avatar.x,'dashboard header controls must not overlap');assert.equal(await page.locator('.noviq-progression').count(),0);await page.screenshot({path:`artifacts/xp-verification/pro-dashboard-${width}.png`});}
await page.setViewportSize({width:320,height:740});await page.goto(base+'#/profile');await page.locator('#achievements').waitFor();assert.equal(await page.locator('[data-xp-indicator]:visible').count(),1);assert.ok(await page.locator('.app-mobile-header').evaluate(el=>{const a=el.children[0].getBoundingClientRect(),b=el.children[1].getBoundingClientRect();return a.right+8<=b.left;}),'mobile header controls need separation');await page.screenshot({path:'artifacts/xp-verification/pro-profile-320.png'});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log('PASS Pro profile ordering, liquid badges, dashboard XP and 320px mobile layout');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
