// User-interactive sign-in. No credentials or authentication state are exported.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'noviq-real-session-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:{width:1600,height:1100},args:['--remote-debugging-port=9225']});
 const page=context.pages()[0]||await context.newPage();await page.goto('http://127.0.0.1:3000/');
 console.log('Real application browser opened. Sign in directly in this window; credentials are not recorded by this script.');
 await new Promise(resolve=>context.on('close',resolve));
})().catch(error=>{console.error(error.message);process.exitCode=1});
