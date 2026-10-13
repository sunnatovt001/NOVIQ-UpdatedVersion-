const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [320,375,390,768,1024,1440,1920]){
   const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
   await page.goto('http://127.0.0.1:4180/');
   await page.locator('.nl-students-art img').evaluate(img=>img.decode());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('.nl-students-art img').evaluate(img=>getComputedStyle(img).objectFit),'contain');
   assert.equal(await page.locator('video').count(),0);
   if(width===390||width===1440)await page.screenshot({path:'artifacts/landing-redesign/en-'+width+'.png',fullPage:true});
   await page.close();console.log('PASS student hero visual '+width+'px');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
