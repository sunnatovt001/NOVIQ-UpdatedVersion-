// Optional diagnostic: NOVIQ_AXE_PATH points to an existing local axe-core bundle.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const axePath=process.env.NOVIQ_AXE_PATH;
 if(!axePath)throw new Error('Set NOVIQ_AXE_PATH to a locally installed axe.min.js.');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('.nl-hero h1').waitFor();
  await page.addScriptTag({path:axePath});
  const results=await page.evaluate(()=>axe.run('.noviq-landing',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']}}));
  const violations=results.violations.map(({id,impact,nodes})=>({id,impact,elements:nodes.map(node=>node.target)}));
  fs.writeFileSync('artifacts/landing-redesign/accessibility.json',JSON.stringify({violations,passed:results.passes.length,incomplete:results.incomplete.map(item=>item.id),scope:'public landing on production build'},null,2));
  assert.deepEqual(violations,[]);
  console.log('PASS production landing axe checks:',results.passes.length,'rules; 0 violations');
  await context.close();
  const reducedData=await browser.newContext({viewport:{width:390,height:844}});
  await reducedData.addInitScript(()=>{const connection=new EventTarget();connection.saveData=true;Object.defineProperty(navigator,'connection',{value:connection});});
  const dataPage=await reducedData.newPage();const requests=[];
  dataPage.on('request',request=>{if(request.url().includes('brain-loop.mp4'))requests.push(request.url());});
  await dataPage.goto('http://127.0.0.1:4180/');
  await dataPage.locator('.nl-hero h1').waitFor();
  assert.equal(await dataPage.locator('video').count(),0);
  assert.deepEqual(requests,[]);
  console.log('PASS Save-Data does not mount or download brain video');
  await reducedData.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
