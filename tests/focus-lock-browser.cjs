const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({...(process.env.NOVIQ_BROWSER_CHANNEL==='chromium'?{}:{channel:'chrome'}),headless:true});try{
 for(const pro of [false,true])for(const seconds of [120,1260]){
  const uid=`focus-${pro}-${seconds}`,scope=uid+'-'+Date.now(),origin='http://127.0.0.1:4184';
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Tashkent'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const api=async(action,data={})=>(await context.request.post(origin+'/__planner_fixture',{data:{uid,scope,action,...data}})).json();
  const id='a'.repeat(32),now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent'}).format(now);
  await api('seed',{records:{[`users/${uid}`]:{uid,email:'synthetic@example.invalid',displayName:'Focus test',onboarded:true,goals:[],xp:0,currentLevel:'beginner',dailyTargetMinutes:30,settings:{},subscription:pro?{plan:'pro',status:'active',currentPeriodEnd:new Date(now+86400000).toISOString()}:{plan:'free',status:'active'}},[`users/${uid}/proExperience/onboarding`]:{completed:true},[`users/${uid}/trusted/start-${id}`]:{id,category:'focus',context:'focus',version:2,startedAt:new Date(now-seconds*1000).toISOString(),seenAt:now,running:false,completed:false,verifiedSeconds:seconds,daySeconds:{[day]:seconds}},[`users/${uid}/trusted/focusLease`]:{id,category:'focus',context:'focus',seenAt:now}}});
  await page.goto(`${origin}/?testUser=1&testUid=${uid}&fixtureScope=${scope}#/focus`);
  await page.evaluate(({uid,id,seconds})=>{localStorage.setItem('noviq-locale','en');localStorage.setItem(`noviq-focus-${uid}`,JSON.stringify({time:1500-seconds,mode:'focus',sessionId:id,startedAt:Date.now(),localOnly:false}));},{uid,id,seconds});
  await page.reload();await page.getByRole('button',{name:'Start timer',exact:true}).last().click();
  const dialog=page.getByRole('dialog',{name:'Focus Lock-in'});await dialog.waitFor();
  await dialog.getByRole('button',{name:'Pause',exact:true}).click();
  const paused=await dialog.getByLabel('Time remaining').innerText();await page.waitForTimeout(1100);assert.equal(await dialog.getByLabel('Time remaining').innerText(),paused);
  page.once('dialog',d=>d.accept());await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.ok(await page.getByRole('button',{name:'Start timer',exact:true}).last().isVisible());
  await page.getByRole('checkbox',{name:'Lock-in during focus sessions'}).check();
  await page.getByRole('button',{name:'Start timer',exact:true}).last().click();await dialog.waitFor();
  fs.mkdirSync('artifacts/focus-lock',{recursive:true});await page.screenshot({path:`artifacts/focus-lock/${pro?'pro':'free'}-${seconds}.png`});
  await dialog.getByRole('button',{name:seconds<1200?'End incomplete session':'Finish session',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:12000}).catch(async e=>{console.log(await dialog.innerText());console.log(JSON.stringify(await api('stats')));throw e;});
  const stats=await api('stats'),record=stats.records[`users/${uid}/studySessions/${id}`];
  assert.ok(record,'Server session saved');assert.ok(record.duration>=seconds&&record.duration<seconds+15);assert.ok(record.duration<1500);
  if(seconds<1200){assert.equal(record.status,'partial');assert.equal(record.xpEarned,0);await page.getByRole('status').filter({hasText:'Session incomplete'}).waitFor();}
  else {assert.notEqual(record.status,'partial');assert.ok(record.xpEarned>0);}
  await page.reload();await page.getByRole('checkbox',{name:'Lock-in during focus sessions'}).waitFor();
  assert.deepEqual(errors,[]);console.log(`PASS ${pro?'Pro':'Free'} lock-in: pause, Escape exit, ${seconds}s actual duration, ${seconds<1200?'partial/no XP':'verified completion'}, reload`);
  await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
