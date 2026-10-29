import fs from 'node:fs';
import {chromium} from 'playwright';
import {randomBytes} from 'node:crypto';
const origin=process.argv[2];
if(!/^https:\/\/noviqupdated-[a-z0-9]+-sunnatovt001s-projects\.vercel\.app$/.test(origin||''))throw new Error('Isolated deployment required.');
const credentials=JSON.parse(fs.readFileSync('C:/Users/user/AppData/Roaming/com.vercel.cli/Data/auth.json','utf8'));
const metadata=await fetch('https://api.vercel.com/v9/projects/prj_Q6DbtWFJDcyzg2P9c5VXnkbBTE3y?slug=sunnatovt001s-projects',{
  headers:{Authorization:`Bearer ${credentials.token}`},signal:AbortSignal.timeout(20000)}).then(r=>r.json());
if(metadata.id!=='prj_Q6DbtWFJDcyzg2P9c5VXnkbBTE3y')throw new Error('Project mismatch.');
const bypass=Object.keys(metadata.protectionBypass||{}).find(key=>metadata.protectionBypass[key].scope==='automation-bypass');
if(!bypass)throw new Error('Existing scoped protection token unavailable.');
let browser,identity;
const firebase=JSON.parse(fs.readFileSync('firebase-applet-config.json','utf8'));
const password=randomBytes(24).toString('base64url'),email=`noviq-browser-probe-${randomBytes(10).toString('hex')}@example.invalid`;
const auth=async(operation,body)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${firebase.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Synthetic auth failed (${response.status}).`);return response.json();
};
try{
  identity=await auth('signUp',{email,password,returnSecureToken:true});
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>{const request=route.request();return route.continue({headers:{...request.headers(),...(new URL(request.url()).origin===origin?{'x-vercel-protection-bypass':bypass}:{})}});});
  const page=await context.newPage(),errors=[],failedApi=[],firestoreRequests=[];
  page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
  page.on('response',async response=>{const url=new URL(response.url());if(url.origin===origin&&url.pathname.startsWith('/api/')&&response.status()>=400){const body=await response.json().catch(()=>null);failedApi.push({path:url.pathname,operation:url.searchParams.get('name'),status:response.status(),code:body?.error?.status});}});
  page.on('request',request=>{if(new URL(request.url()).hostname==='firestore.googleapis.com')firestoreRequests.push('firestore-data-request');});
  await page.goto(origin,{waitUntil:'networkidle',timeout:60000});
  await page.getByRole('button',{name:'Sign in',exact:true}).first().click();
  console.log((await page.locator('body').innerText()).slice(-1600));
  await page.getByPlaceholder('you@gmail.com').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/dashboard',{timeout:45000});
  await page.getByText('Dashboard',{exact:true}).first().waitFor({timeout:30000});
  await page.waitForTimeout(4000);
  const text=await page.locator('body').innerText();
  console.log(text.slice(0,3500).replaceAll(email,'[synthetic-email]'));
  for(const route of ['notes','flashcards','planner','focus','analytics','profile']){
    await page.goto(`${origin}/${route}`,{waitUntil:'networkidle',timeout:60000});
    await page.waitForTimeout(2000);
    console.log(JSON.stringify({route,renderedText:(await page.locator('body').innerText()).slice(0,180)}));
  }
  console.log(JSON.stringify({authenticatedDashboard:true,pageErrors:errors,failedApi,firestoreDataRequests:firestoreRequests.length}));
  if(errors.length||failedApi.length||firestoreRequests.length)throw new Error('Browser data-path verification failed.');
  fs.mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/mongo-candidate-landing.png'});
}finally{if(browser)await browser.close();if(identity?.idToken&&identity.email===email){await auth('delete',{idToken:identity.idToken});console.log('Disposable browser verification identity removed.');}}
