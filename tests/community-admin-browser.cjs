const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.NOVIQ_BROWSER_CHANNEL==='chromium'?{}:{channel:'chrome'})});
 try {
  const origin='http://127.0.0.1:4184';
  for(const pro of [false,true])for(const admin of [false,true]) {
   const uid=`role-${pro}-${admin}`,scope=uid+Date.now(),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
   const api=async(action,data={})=>(await context.request.post(origin+'/__planner_fixture',{data:{scope,uid,action,...data}})).json();
   await api('seed',{records:{[`users/${uid}`]:{uid,isAdmin:admin,displayName:'Role fixture',email:'role@example.test',onboarded:true,onboardingAnswers:{mainGoal:'Science',userType:'student',struggle:'focus'},settings:{language:'en'},goals:[],subscription:pro?{plan:'pro',status:'active',currentPeriodEnd:new Date(Date.now()+86400000).toISOString()}:{plan:'free',status:'active'}}}});
   const base=`${origin}/?testUser=1&testUid=${uid}&fixtureScope=${scope}${admin?'&testAdmin=1':''}`;
   await page.goto(base+'#/community');
   await page.locator('.cg-hero h1').waitFor().catch(async e=>{console.error(await page.locator('body').innerText());throw e;});
   const create=page.getByRole('button',{name:'Create group',exact:true});
   if(admin){await create.first().click();await page.locator('#community-name').waitFor();}
   else {assert.equal(await create.count(),0);assert.equal(await page.locator('#community-name').count(),0);}
   const response=await api('call',{name:'createCommunity',data:{name:'Role fixture group',isAdmin:true}});
   if(admin)assert.ok(response.communityId);else assert.equal(response.code,'permission-denied');
   if(admin&&!pro){
    await api('seed',{records:Object.fromEntries(Array.from({length:12},(_,i)=>[`users/${uid}/notebookNotes/n${String(i).padStart(2,'0')}`,{title:`Stored note ${i}`,content:'Inspect complete saved content'}]))});
    await page.goto(base+'#/admin');
    await page.getByRole('button',{name:'Open Role fixture',exact:true}).click();
    const records=page.locator('section').filter({has:page.getByRole('heading',{name:'User records',exact:true})});
    await records.getByText('1 records loaded',{exact:true}).waitFor();
    await records.getByLabel('Data section',{exact:true}).selectOption('notebookNotes');
    await records.getByText('10 records loaded',{exact:true}).waitFor();
    await records.getByRole('button',{name:'Load more records',exact:true}).click();
    await records.getByText('12 records loaded',{exact:true}).waitFor();
    assert.equal(await records.getByRole('button',{name:'Load more records',exact:true}).count(),0);
    await records.locator('summary').first().click();await records.getByText(/Inspect complete saved content/).first().waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    fs.mkdirSync('artifacts/community-admin',{recursive:true});await records.screenshot({path:'artifacts/community-admin/user-records-mobile.png'});
   }
   console.log(`PASS ${pro?'Pro':'Free'} ${admin?'admin':'student'} community creation permissions${admin&&!pro?', admin records pagination and mobile fit':''}`);
   await context.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
