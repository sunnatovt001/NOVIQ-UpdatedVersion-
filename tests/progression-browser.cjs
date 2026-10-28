// Isolated UI journeys. Server policy/transactions are separately tested in
// progression.firestore.cjs; this fixture never uses a production account.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const output='artifacts/xp-verification';fs.mkdirSync(output,{recursive:true});
  try {
    for(const locale of ['en','uz','ru']) {
      const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
      await page.addInitScript(locale=>localStorage.setItem('noviq-locale',locale),locale);
      await page.goto('http://127.0.0.1:4180/?testUser=1&testXp=1#/profile');
      const name=locale==='uz'?'XP va yutuqlar':locale==='ru'?'XP и достижения':'XP and achievements';
      const panel=page.getByRole('region',{name});
      await panel.getByText('300/600 XP · 50%',{exact:true}).waitFor();
      const progress=panel.getByRole('progressbar').first();
      assert.equal(await progress.getAttribute('value'),'300');assert.equal(await progress.getAttribute('max'),'600');
      assert.equal(await panel.locator('article').count(),16);
      await panel.getByRole('button',{name:locale==='uz'?'Ochilgan':locale==='ru'?'Открытые':'Unlocked',exact:true}).click();
      assert.equal(await panel.locator('article').count(),1);
      await panel.getByRole('button',{name:locale==='uz'?'Qulflangan':locale==='ru'?'Закрытые':'Locked',exact:true}).click();
      assert.equal(await panel.locator('article').count(),15);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:`${output}/profile-${locale}-390.png`,fullPage:true});
      await page.reload();await panel.getByText('300/600 XP · 50%',{exact:true}).waitFor();
      await page.setViewportSize({width:1440,height:1000});
      await page.evaluate(()=>{document.documentElement.classList.add('dark');document.querySelector('.noviq-app')?.classList.add('dark');});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await panel.screenshot({path:`${output}/achievements-${locale}-dark.png`});
      assert.deepEqual(errors,[]);
      console.log(`PASS ${locale}: level progress, all 16 achievements, filters, reload, mobile and dark mode`);
      if(locale==='en') {
        await page.goto('http://127.0.0.1:4180/?testUser=1&testXp=1&service=unavailable#/profile');
        await panel.getByText('300/600 XP · 50%',{exact:true}).waitFor();
        await panel.getByText('History could not load. Your XP is shown above.',{exact:false}).waitFor();
        assert.equal(await panel.getByRole('button',{name:'Retry',exact:true}).count(),1);
        console.log('PASS unavailable statistics and history do not hide existing XP');
      }
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
