const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:320,height:520}});
await page.goto('http://127.0.0.1:4180/?testUser=1&testAI=success#/tutor',{waitUntil:'domcontentloaded'});await page.getByRole('textbox',{name:'Message Noviq Tutor'}).waitFor();
await page.evaluate(()=>{
 const uid='isolated-browser-user', message={id:'tutor-message-delayed-fixture',role:'user',content:'Delayed cloud acknowledgment fixture',createdAt:Date.now(),conversationId:'delayed-fixture',pendingCloud:true};
 localStorage.setItem(`noviq:tutor-history:v1:${uid}`,JSON.stringify([message]));localStorage.setItem(`noviq:tutor-history:v1:${uid}:active`,JSON.stringify('delayed-fixture'));
 localStorage.setItem('noviq:offlineSyncQueue:v1',JSON.stringify([{id:`set:users/${uid}/tutorMessages/${message.id}`,userId:uid,path:['users',uid,'tutorMessages',message.id],kind:'set',data:{role:message.role,content:message.content,conversationId:message.conversationId,createdAt:new Date(message.createdAt).toISOString()},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),attempts:0,status:'pending'}]));
});
await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('textbox',{name:'Message Noviq Tutor'}).waitFor();await page.waitForTimeout(1500);
console.log(await page.evaluate(()=>({text:document.querySelector('.tutor-workspace')?.innerText,stored:localStorage.getItem('noviq:tutor-history:v1:isolated-browser-user'),queue:localStorage.getItem('noviq:offlineSyncQueue:v1')})));
await page.screenshot({path:'artifacts/production-audit/tutor-sync-debug.png'});await browser.close();})().catch(e=>{console.error(e);process.exitCode=1;});
