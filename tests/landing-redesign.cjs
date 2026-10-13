const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base='http://127.0.0.1:4180';
const formNames={
 en:{signup:'Create your study account',login:'Sign in to your workspace'},
 uz:{signup:'O‘quv hisobingizni yarating',login:'O‘quv muhitingizga kirish'},
 ru:{signup:'Создайте учебный аккаунт',login:'Войдите в учебное пространство'}
};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const reports=[];
 try{
  fs.mkdirSync('artifacts/landing-redesign',{recursive:true});
  for(const width of [320,375,390,768,1024,1440,1920])for(const locale of ['en','uz','ru']){
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.addInitScript(value=>localStorage.setItem('noviq-locale',value),locale);
   const page=await context.newPage();
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base);
   const signup=page.locator('.nl-hero .nl-primary');
   await signup.waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('h1').count(),1);
   assert.equal(await page.locator('.nl-feature-card').count(),6);
   assert.equal(await page.locator('.nl-benefits article').count(),3);
   assert.equal(await page.locator('.nl-track-chips span').count(),6);
   await page.locator('.nl-students-art img').evaluate(img=>img.decode());
   assert.equal(await page.locator('video').count(),0);
   await page.waitForFunction(()=>document.querySelector('.nl-students-stage').dataset.running==='true');
   assert.equal(await page.locator('.nl-motion').count(),0);
   const badge=page.locator('.nl-student-badge-tutor');
   const before=await badge.evaluate(el=>getComputedStyle(el).transform);
   await page.waitForTimeout(150);
   assert.notEqual(await badge.evaluate(el=>getComputedStyle(el).transform),before);
   await page.locator('#study-tools').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelector('.nl-students-stage').dataset.running==='false');
   assert.equal(await badge.evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
   await signup.scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelector('.nl-students-stage').dataset.running==='true');
   if(width<900){
    const toggle=page.locator('.nl-menu-button');
    await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#landing-menu a').first().evaluate(a=>a===document.activeElement),true);
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await toggle.evaluate(button=>button===document.activeElement),true);
    await toggle.click();
    await page.locator('#landing-menu a[href="#study-tools"]').click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
   }else await page.locator('.nl-desktop-nav a[href="#study-tools"]').click();
   assert.equal(await page.evaluate(()=>location.hash),'#study-tools');
   await page.locator('a[href="#landing-home"]').first().click();
   await signup.click();
   const dialog=page.getByRole('dialog');
   await dialog.locator('input[autocomplete="name"]').waitFor();
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
   if(width<900){
    await page.locator('.nl-menu-button').click();
    await page.locator('#landing-menu button').first().click();
   }else await page.locator('.nl-signin').click();
   await dialog.locator('input[autocomplete="current-password"]').waitFor();
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
   if(width===390){
    const routes=['planner','flashcards','focus','analytics','tutor','notes'];
    for(let index=0;index<routes.length;index++){
     await page.locator('.nl-feature-card').nth(index).click();
     await dialog.locator('input[autocomplete="name"]').waitFor();
     assert.equal(await page.evaluate(()=>location.hash),'#/'+routes[index]);
     await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    }
   }
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>document.querySelector('.nl-students-stage').dataset.running==='false');
   assert.equal(await page.locator('.nl-motion').count(),0);
   assert.equal(await badge.evaluate(el=>getComputedStyle(el).animationName),'none');
   await page.locator('.nl-laptop img').scrollIntoViewIfNeeded();
   await page.locator('.nl-laptop img').evaluate(img=>img.decode());
   await page.locator('.nl-phone img').evaluate(img=>img.decode());
   await page.evaluate(()=>{scrollTo(0,0);document.activeElement?.blur();});
   if(width===390||width===1440)await page.screenshot({path:'artifacts/landing-redesign/'+locale+'-'+width+'.png',fullPage:true});
   assert.equal(await page.evaluate(()=>window.__unexpectedWrites||0),0);
   assert.deepEqual(errors,[]);
   reports.push({width,locale,overflow:false,runtimeErrors:errors,productionWrites:0});
   console.log('PASS landing '+locale+' '+width+'px: media, navigation, auth entry, accessibility and layout');
   await context.close();
  }
  const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await reduced.newPage();const videoRequests=[];
  page.on('request',request=>{if(request.url().includes('brain-loop.mp4'))videoRequests.push(request.url());});
  await page.goto(base);await page.locator('h1').waitFor();
  assert.equal(await page.locator('video').count(),0);assert.deepEqual(videoRequests,[]);
  await reduced.close();
  fs.writeFileSync('artifacts/landing-redesign/verification.json',JSON.stringify({reports,reducedMotionDownloadsVideo:false,source:'isolated browser fixtures, not live auth'},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
