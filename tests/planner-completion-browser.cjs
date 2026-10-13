const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    fs.mkdirSync('artifacts/production-audit',{recursive:true});
    for(const locale of ['en','uz','ru'])for(const theme of ['light','dark']){
      const context=await browser.newContext({viewport:{width:320,height:740},reducedMotion:'reduce'});
      await context.addInitScript(value=>localStorage.setItem('noviq-locale',value),locale);
      const page=await context.newPage();
      await page.goto(`http://127.0.0.1:4180/tests/planner-completion.html?theme=${theme}&type=mission&bonus=1`);
      const opener=page.locator('#opener');
      await opener.click();
      const dialog=page.getByRole('dialog',{name:'Verified completion'});
      await dialog.waitFor();
      await page.waitForFunction(()=>document.activeElement?.closest('[role="dialog"]')!==null);
      assert.equal(await dialog.evaluate(element=>getComputedStyle(element).backgroundColor),theme==='dark'?'rgb(19, 29, 46)':'rgb(255, 255, 255)');
      assert.equal(await dialog.evaluate(element=>getComputedStyle(element).color),theme==='dark'?'rgb(248, 250, 252)':'rgb(20, 33, 61)');
      assert.ok((await dialog.innerText()).includes('+30'));
      assert.equal(await dialog.locator('button').innerText(),{en:'Continue',uz:'Davom etish',ru:'Продолжить'}[locale]);
      for(const key of ['Tab','Shift+Tab']){
        await page.keyboard.press(key);
        assert.equal(await dialog.evaluate(element=>element.contains(document.activeElement)),true);
      }
      const bounds=await dialog.boundingBox();
      assert.ok(bounds.x>=0&&bounds.x+bounds.width<=320&&bounds.y>=0&&bounds.y+bounds.height<=740);
      assert.equal(await dialog.evaluate(element=>element.getAnimations({subtree:true}).length),0);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
      if(locale==='en'&&theme==='dark')await page.screenshot({path:'artifacts/production-audit/planner-completion-dark-320.png'});
      await page.keyboard.press('Escape');
      await dialog.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.activeElement.id),'opener');
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
      await opener.click();await dialog.waitFor();await dialog.locator('button').click();await dialog.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.activeElement.id),'opener');
      await context.close();
      console.log(`PASS completion dialog palette, locale, fit, focus, Escape, close, scroll restore: ${locale} ${theme}`);
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
