// Isolated XP presentation journeys; no production accounts or AI requests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 fs.mkdirSync('artifacts/xp-verification',{recursive:true});
 try{for(const locale of ['en','uz','ru']){
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(locale=>localStorage.setItem('noviq-locale',locale),locale);
  const base='http://127.0.0.1:4180/?testUser=1&testXp=1';
  await page.goto(base+'#/profile');
  const panel=page.locator('#achievements');await panel.waitFor();
  const counter=page.locator('[data-xp-indicator]:visible');
  assert.equal(await counter.count(),1);assert.match(await counter.innerText(),/1,300\s*XP/);
  assert.ok(await page.locator('.pf-grid').evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('#achievements'))&Node.DOCUMENT_POSITION_FOLLOWING)),'profile details precede achievements');
  assert.equal(await panel.locator('article').count(),16);
  assert.equal(await panel.getByRole('button',{name:/Retry|Qayta urinish|Повторить/}).count(),0);
  await panel.getByRole('button',{name:locale==='uz'?'Ochilgan':locale==='ru'?'Открытые':'Unlocked',exact:true}).click();assert.equal(await panel.locator('article').count(),1);
  await panel.getByRole('button',{name:locale==='uz'?'Qulflangan':locale==='ru'?'Закрытые':'Locked',exact:true}).click();assert.equal(await panel.locator('article').count(),15);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.reload();await panel.waitFor();assert.match(await counter.innerText(),/1,300\s*XP/);
  await page.setViewportSize({width:1440,height:1000});
  await panel.scrollIntoViewIfNeeded();await panel.screenshot({path:`artifacts/xp-verification/achievements-${locale}-light.png`});
  await page.evaluate(()=>{document.documentElement.classList.add('dark');document.querySelector('.noviq-app')?.classList.add('dark');});
  await panel.screenshot({path:`artifacts/xp-verification/achievements-${locale}-dark.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.goto(base+'#/dashboard');await page.locator('[data-xp-indicator]:visible').waitFor();assert.equal(await page.locator('.noviq-progression').count(),0);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${locale}: one live header counter, profile-first layout, 16 badges, filters and responsive glass gallery`);
  if(locale==='en'){
   await page.goto(base+'&service=unavailable#/profile');await panel.waitFor();assert.match(await page.locator('[data-xp-indicator]:visible').innerText(),/1,300\s*XP/);
   assert.equal(await panel.getByRole('button',{name:'Retry',exact:true}).count(),0);
   assert.equal(await panel.getByText('History is temporarily unavailable. Your XP is preserved.',{exact:true}).count(),0);
   await panel.locator('summary').click();await panel.getByText('History is temporarily unavailable. Your XP is preserved.',{exact:true}).waitFor();
   console.log('PASS unavailable history preserves XP without repeated Retry banners');
  }
  await page.close();
 }}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
