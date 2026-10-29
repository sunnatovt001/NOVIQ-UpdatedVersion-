const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const origin='http://127.0.0.1:4184',uid='focus-quota',scope='focus-quota-'+Date.now(),now=Date.now();
 const page=await browser.newPage();
 const plan={version:2,userId:uid,revision:'known-plan',updatedAt:now,startedAt:now,completedOnboardingAt:now,step:5,ready:true,statuses:[],timezone:'Asia/Tashkent',subjects:[{id:'english',name:'English',mode:'self',paused:false,target:'Learn',estimate:'',deadline:'',priorities:'',materials:'',roadmap:''}],windows:[],commitments:[],sessionMinutes:25,breakMinutes:5,dailyLimit:100,split:true,mode:'hybrid',preference:'evening',tasks:[{id:'reading',subjectId:'english',title:'Saved reading',minutes:25,priority:2,repeat:'none',repeatUntil:'',createdAt:now,completed:false}],sessions:[],history:[]};
 await page.request.post(origin+'/__planner_fixture',{data:{scope,uid,action:'seed',records:{[`users/${uid}`]:{uid,displayName:'Focus owner',onboarded:true,settings:{},onboardingAnswers:{mainGoal:'English',userType:'student',struggle:'focus'},subscription:{plan:'pro',status:'active',currentPeriodEnd:'2099-01-01'}},[`users/${uid}/planner/smart-v2`]:plan,[`users/${uid}/proExperience/onboarding`]:{completed:true}}}});
 await page.goto(origin+`/?testUser=1&testMembershipUnavailable=1&testUid=${uid}&fixtureScope=${scope}#/dashboard`);
 const start=page.getByRole('button',{name:'Start focus session',exact:true});await start.waitFor();
 await page.evaluate(()=>sessionStorage.setItem('fixtureDataQuota','1'));
 await page.locator('.gd-status').waitFor({state:'hidden'});
 await page.waitForTimeout(1000);
 assert.equal(await start.isEnabled(),true);
 await start.click();
 await page.waitForURL(/\/focus/);
 const task=await page.evaluate(uid=>JSON.parse(localStorage.getItem(`noviq:${uid}:plannerFocusContext:v2`)),uid);
 assert.equal(task.title,'Saved reading');assert.equal(task.taskId,'reading');
 console.log('PASS saved Focus task opens while membership and other dashboard data are unavailable');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
