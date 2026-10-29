const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage(),origin='http://127.0.0.1:4184',uid='paid-outage',scope='paid-outage-'+Date.now();
 const profile={uid,displayName:'Paid admin',email:'paid@example.test',isAdmin:true,onboarded:true,settings:{},onboardingAnswers:{mainGoal:'English',userType:'student',struggle:'focus'},subscription:{plan:'pro',status:'active',currentPeriodEnd:'2099-01-01'}};
 const seed=async value=>page.request.post(origin+'/__planner_fixture',{data:{scope,uid,action:'seed',records:{[`users/${uid}`]:value,[`users/${uid}/proExperience/onboarding`]:{completed:true}}}});
 await seed(profile);
 await page.goto(origin+`/?testUser=1&testAdmin=1&testMembershipUnavailable=1&testUid=${uid}&fixtureScope=${scope}#/dashboard`);
 await page.locator('.pro-environment').waitFor();
 await page.locator('.gd-stats').waitFor();
 await page.locator('details.quiet-sync').filter({hasText:/Membership verification/}).waitFor();
 // A current paid appearance must not grant an expired or Free account premium access.
 await seed({...profile,subscription:{plan:'free',status:'active'}});
 await page.waitForFunction(()=>!document.querySelector('.pro-environment'));
 console.log('PASS paid plan appearance survives membership outage; Free account is not upgraded');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
