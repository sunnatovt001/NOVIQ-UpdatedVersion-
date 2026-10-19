const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:4184',uid='tutor-recovery-user',scope='tutor-recovery-'+Date.now();
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route(/fonts.googleapis.com|fonts.gstatic.com|api.dicebear.com/,r=>r.abort());
  await context.addInitScript(()=>{window.SpeechRecognition=class{constructor(){throw new Error('Voice blocked by browser policy');}};});
  await context.request.post(origin+'/__planner_fixture',{data:{action:'seed',uid,scope,records:{['users/'+uid]:{uid,displayName:'Tutor regression',onboarded:true,onboardingAnswers:{mainGoal:'Math',userType:'student',struggle:'focus'},settings:{},subscription:{plan:'free',status:'active'}}}}});
  await page.goto(origin+`/?testUser=1&testUid=${uid}&fixtureScope=${scope}#/tutor`);
  const input=page.locator('textarea').first();await input.waitFor();await input.fill('Keep this draft while checking membership');
  let releaseMembership,releaseAi,seenMembership,seenAi;
  const membershipSeen=new Promise(r=>seenMembership=r),aiSeen=new Promise(r=>seenAi=r);
  const membershipGate=new Promise(r=>releaseMembership=r),aiGate=new Promise(r=>releaseAi=r);
  await page.route('**/__planner_fixture',async route=>{const body=route.request().postDataJSON();if(body.action==='call'&&body.name==='getMembershipStatus'){seenMembership();await membershipGate;}if(body.action==='call'&&body.name==='generateAiResponse'){seenAi();await aiGate;}await route.continue();});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await membershipSeen;
  await page.waitForTimeout(300);
  assert.equal(await input.inputValue(),'Keep this draft while checking membership');
  releaseMembership();
  await input.fill('Explain the addition of two numbers');await input.press('Enter');await aiSeen;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);releaseAi();
  await page.getByText('A fixture coaching response grounded in the supplied learning evidence.',{exact:true}).waitFor({timeout:20000});
  assert.equal(await page.getByRole('button',{name:/Reload app|Qayta yuklash/i}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS blocked Chrome voice APIs preserve text Tutor; tab revalidation retains draft and pending AI reply');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
