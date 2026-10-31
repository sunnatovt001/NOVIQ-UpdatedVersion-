const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
(async()=>{
 const root=path.resolve('.runtime');fs.mkdirSync(root,{recursive:true});const profile=fs.mkdtempSync(path.join(root,'focus-extension-'));
 const unrelated=http.createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Other website</title><h1>Unrelated website</h1><input id="draft" value="unsaved work">');});
 await new Promise(resolve=>unrelated.listen(0,'127.0.0.1',resolve));const otherURL=`http://127.0.0.1:${unrelated.address().port}/`;
 let context;
 try{
  const extension=path.resolve('browser-extension/noviq-focus');context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  await context.routeWebSocket('**/*',socket=>socket.close());
  const origin='https://noviqupdated.vercel.app',fixture='http://127.0.0.1:4184';
  await context.route(origin+'/**',async route=>{const url=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:fixture+url.pathname+url.search})});});
  const uid='extension-browser',scope='extension-'+Date.now();
  await context.request.post(fixture+'/__planner_fixture',{data:{action:'seed',uid,scope,records:{[`users/${uid}`]:{uid,email:'synthetic@example.invalid',displayName:'Extension test',onboarded:true,goals:[],xp:0,currentLevel:'beginner',dailyTargetMinutes:30,settings:{},subscription:{plan:'free',status:'active'}}}}});
  const other=await context.newPage();await other.goto(otherURL);await other.locator('#draft').fill('preserved private draft');
  const focus=await context.newPage();await focus.goto(`${origin}/?testUser=1&testUid=${uid}&fixtureScope=${scope}#/focus`);
  await focus.getByRole('status').filter({hasText:'Blocking extension connected.'}).waitFor();
  await focus.getByRole('button',{name:'Start timer',exact:true}).last().click();
  await focus.waitForFunction(()=>document.fullscreenElement?.hasAttribute('data-focus-zone'));
  await focus.getByRole('status').filter({hasText:'Other websites are blocked.'}).waitFor();
  await other.locator('[data-noviq-focus-shield]').waitFor();assert.equal(await other.locator('#draft').inputValue(),'preserved private draft');
  const blocked=await context.newPage();await blocked.goto(otherURL+'new-site').catch(()=>{});
  await blocked.waitForURL(/chrome-extension:\/\/.*\/blocked.html/);await blocked.getByRole('heading',{name:'Focus davom etyapti'}).waitFor();
  await focus.bringToFront();await focus.getByRole('button',{name:/^Exit (fullscreen|lock-in)$/}).click();
  await focus.getByRole('status').filter({hasText:'Blocking extension connected.'}).waitFor();
  await other.locator('[data-noviq-focus-shield]').waitFor({state:'detached'});assert.equal(await other.locator('#draft').inputValue(),'preserved private draft');
  await blocked.goto(otherURL+'released');await blocked.getByRole('heading',{name:'Unrelated website'}).waitFor();
  console.log('PASS installed extension: native fullscreen, existing-tab shield without data loss, real navigation redirect, explicit exit releases all blocking');
 }finally{if(context)await context.close();await new Promise(resolve=>unrelated.close(resolve));const target=path.resolve(profile);if(target.startsWith(root+path.sep))try{fs.rmSync(target,{recursive:true,force:true,maxRetries:3});}catch{}}
})().catch(error=>{console.error(error);process.exitCode=1;});
