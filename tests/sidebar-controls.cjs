const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  fs.mkdirSync('artifacts/sidebar-controls',{recursive:true});
  for(const width of [320,390,1024,1440])for(const dark of [false,true]){
   const page=await browser.newPage({viewport:{width,height:740}});
   await page.addInitScript(isDark=>{localStorage.setItem('noviq-locale','en');localStorage.setItem('noviq-theme',isDark?'dark':'light');},dark);
   await page.goto('http://127.0.0.1:4180/?testUser=1#/dashboard');
   await page.getByText('No mission yet',{exact:true}).first().waitFor();
   await page.locator('.app-language-trigger:visible').click();
   const popup=await page.locator('.app-language-popover:visible').boundingBox();
   assert.ok(popup.x>=0 && popup.x+popup.width<=width,'language popup fits viewport');
   if(!dark && (width===390||width===1440))await page.screenshot({path:'artifacts/sidebar-controls/language-top-'+width+'.png'});
   const aside=page.locator('aside.app-sidebar');
   for(const language of ['O‘zbekcha','Русский','English']){
    const radio=page.getByRole('radio',{name:language,exact:true});
    await radio.check();
    assert.equal(await radio.isChecked(),true);
    const box=await radio.locator('..').boundingBox();assert.ok(box.height>=44);
   }
   const first=page.getByRole('radio',{name:'English',exact:true});
   await first.focus();await page.keyboard.press('ArrowRight');
   assert.equal(await page.getByRole('radio',{name:'O‘zbekcha',exact:true}).isChecked(),true);
   await page.keyboard.press('ArrowLeft');
   assert.equal(await first.isChecked(),true);
   if(width>=1024){
    await page.keyboard.press('Escape');
    const momentum=await aside.locator('.sidebar-momentum').boundingBox();
    assert.ok((await aside.locator('.sidebar-momentum').innerText()).includes('Start today'));
    assert.ok(momentum.height<130,'compact momentum panel');
    const nav=await aside.locator('nav').boundingBox();assert.ok(nav.height>250,'space retained for navigation');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(width<1024){await page.keyboard.press('Escape');await page.getByRole('button',{name:'Open menu',exact:true}).click();}
   await aside.screenshot({path:'artifacts/sidebar-controls/'+width+'-'+(dark?'dark':'light')+'.png'});
   assert.equal(await page.evaluate(()=>window.__unexpectedWrites||0),0);
   await page.close();console.log('PASS sidebar controls '+width+' '+(dark?'dark':'light'));
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
