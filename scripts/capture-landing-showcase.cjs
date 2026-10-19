// Genuine app components, empty isolated account, no production reads or writes.
const {chromium}=require('playwright');
const {mkdirSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  mkdirSync('public/landing',{recursive:true});
  mkdirSync('artifacts/landing-redesign',{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:4180/?testUser=1#/dashboard');
  await page.getByText('No mission yet',{exact:true}).first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  // Hide only the audit notice and assistant overlay; don't invent or replace any UI.
  await page.addStyleTag({content:'.audit-mode-notice{visibility:hidden} .noviq-app > div.fixed{visibility:hidden}'});
  await page.locator('.noviq-app').screenshot({path:'artifacts/landing-redesign/dashboard-source-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('.noviq-app').screenshot({path:'artifacts/landing-redesign/dashboard-source-mobile.png'});
  if (!process.env.NOVIQ_FFMPEG) throw new Error('Set NOVIQ_FFMPEG to a local ffmpeg executable to optimize screenshots.');
  for(const [name,width] of [['desktop',1440],['desktop-small',720],['mobile',390],['mobile-small',195]]){
   const source=name.startsWith('desktop')?'desktop':'mobile';
   execFileSync(process.env.NOVIQ_FFMPEG,['-hide_banner','-loglevel','error','-y','-i',`artifacts/landing-redesign/dashboard-source-${source}.png`,'-vf',`scale=${width}:-2`,'-frames:v','1','-quality','85',`public/landing/dashboard-empty-${name}.webp`],{stdio:'inherit'});
  }
  console.log('Captured authentic empty dashboard at desktop and mobile; writes:',await page.evaluate(()=>window.__unexpectedWrites||0));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
