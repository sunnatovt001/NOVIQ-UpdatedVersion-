// Isolated integration browser tests. Run tests/browser-server.mjs first.
// Usage: node tests/browser-check.cjs [path-to-playwright-package]
const {chromium}=require(process.argv[2] || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const output='artifacts/production-audit';fs.mkdirSync(output,{recursive:true});
(async()=>{
const browser=await chromium.launch({...(process.env.NOVIQ_BROWSER_CHANNEL === 'chromium' ? {} : {channel:'chrome'}),headless:true});
try {
const page=await browser.newPage();
page.setDefaultNavigationTimeout(60000);
const requests=[]; const runtimeErrors=[];
page.on('request',r=>requests.push({url:r.url()}));
page.on('pageerror',e=>runtimeErrors.push(e.message));
async function ab(...args) {
 if(args[0]==='set') return page.setViewportSize({width:Number(args[2]),height:Number(args[3])});
 if(args[0]==='open') return page.goto(args[1],{waitUntil:'domcontentloaded'});
 if(args[0]==='screenshot') { await page.waitForTimeout(600); return page.screenshot({path:args[1]}); }
 if(args[0]==='find') return page.getByRole(args[2],{name:args[5],exact:true}).click();
 if(args[0]==='fill') return page.locator(args[1]).fill(args[2]);
 if(args[0]==='press') return page.keyboard.press(args[1]);
 if(args[0]==='network') return {requests};
 throw new Error('Unknown browser command '+args[0]);
}
async function changeLanguage(name) {
 const opened=await page.evaluate(()=>innerWidth<1024 && document.querySelector('aside.app-sidebar').classList.contains('translate-x-0'));
 if(opened)await page.locator('aside.app-sidebar button[class~="lg:hidden"]').click();
 await page.locator('.app-language-trigger:visible').click();
 await page.getByRole('radio',{name,exact:true}).check();
 await page.keyboard.press('Escape');
 if(opened)await page.locator('.app-mobile-header button').last().click();
}
const evaluate=code=>page.evaluate(code);
async function until(code) {await page.waitForFunction(code,{},{timeout:22000}); return true;}
const navigate=(query='',route='')=>ab('open',`http://127.0.0.1:4180/${query}${route === '#/planner' ? '&examMissions=1' : ''}${route}`);
const currentCopy={
 'Give your learning a clear direction.':'A plan for your next chapter.',
 'O‘qishingizga aniq yo‘nalish bering.':'Keyingi bosqichingiz uchun reja.',
 'Study together, share ideas':'Find your people. Share ideas. Keep learning.',
 'Do‘stlaringiz bilan birga o‘qing':'Hamfikrlarni toping. Fikr almashing. O‘rganishda davom eting.',
 'Learning analytics':'See your progress.',
 'O‘qish tahlili':'Natijalaringizni kuzating.',
 'Turns sources into exam mastery':'Your study library',
 'Превращает источники в знания для экзамена.':'Ваша учебная библиотека',
 'Focus Zone':'Make room for focus.',
 'Fokus hududi':'Fokus uchun vaqt ajrating.',
 'Manage your account, study preferences':'Make it yours.',
 'Hisob, o‘qish sozlamalari':'O‘zingizga moslang.',
};
const textHas=value=>until(`document.body.innerText.toLowerCase().includes(${JSON.stringify((currentCopy[value]||value).toLowerCase())})`);
const clickText=value=>value==='Exam Planning'?page.locator('.nl-feature-card').first().click():value==='Create account'?page.locator('form button[type=submit]').click():page.getByRole('button',{name:new RegExp('^'+value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i')}).click();
async function fit(){assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);}
const shot=name=>ab('screenshot',`${output}/${name}.png`);
const passed=[];function record(name){passed.push(name);console.log('PASS',name);}
if (!process.env.NOVIQ_AUTH_ONLY) {
await ab('set','viewport','1440','900');
await ab('open','http://127.0.0.1:4180/?testUser=1#/planner');
await page.getByRole('heading',{name:'Smart Planner',exact:true}).waitFor();
await page.getByRole('button',{name:'Create my plan',exact:true}).waitFor();
await page.getByRole('button',{name:'Exam missions & history',exact:true}).click();
await textHas('Your mentor for today');await fit();await shot('planner-desktop');record('Smart Planner is the default and existing exam missions remain accessible');
await navigate('?testUser=1','#/tutor');await textHas('your Noviq Tutor');await page.getByText('Reply language: automatic',{exact:true}).waitFor();await fit();await shot('tutor-desktop');record('Tutor opens on desktop with automatic reply language');
await ab('set','viewport','390','844');
await navigate('?testUser=1','#/planner');await textHas('Your mentor for today');await fit();await shot('planner-mobile');
 await page.getByRole('button',{name:'Adjust plan',exact:true}).click();
 const plannerSettings=page.getByRole('dialog',{name:'Shape your study plan',exact:true});await plannerSettings.waitFor();await fit();
 assert.equal(await plannerSettings.locator('input[inputmode="numeric"]').count(),1);await shot('planner-settings-mobile');
 await plannerSettings.getByRole('button',{name:'Close plan settings',exact:true}).click();
const mobilePrimaryNav=page.getByRole('navigation',{name:'Primary navigation',exact:true});
assert.equal(await mobilePrimaryNav.getByRole('button').count(),5);
assert.equal(await mobilePrimaryNav.getByRole('button',{name:'Plan',exact:true}).getAttribute('aria-current'),'page');
await mobilePrimaryNav.getByRole('button',{name:'Today',exact:true}).click();await textHas('A clear day starts with a small plan.');
await mobilePrimaryNav.getByRole('button',{name:'Plan',exact:true}).click();await textHas('Your mentor for today');
record('Mobile primary navigation exposes five destinations and changes pages');
await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.waitForTimeout(550);assert.equal(await evaluate(`document.querySelector('aside.app-sidebar').getBoundingClientRect().left>=0`),true);await changeLanguage('O‘zbekcha');await page.getByRole('navigation',{name:'Ish maydoni navigatsiyasi',exact:true}).waitFor();assert.equal(await mobilePrimaryNav.getByRole('button',{name:'Reja',exact:true}).count(),1);await shot('sidebar-mobile-uz');await page.locator('aside.app-sidebar').getByRole('button',{name:'Menyuni yopish',exact:true}).click();await page.getByRole('button',{name:'Rejani sozlash',exact:true}).click();const plannerSettingsUz=page.getByRole('dialog',{name:'O‘quv rejangizni shakllantiring',exact:true});await plannerSettingsUz.waitFor();await fit();await shot('planner-settings-mobile-uz');await plannerSettingsUz.getByRole('button',{name:'Reja sozlamalarini yopish',exact:true}).click();await mobilePrimaryNav.getByRole('button',{name:'Bugun',exact:true}).click();await textHas('Aniq kun kichik rejadan boshlanadi.');await page.getByRole('button',{name:'Menyuni ochish',exact:true}).click();await changeLanguage('English');await page.getByRole('navigation',{name:'Workspace navigation',exact:true}).waitFor();await shot('sidebar-mobile');await page.locator('aside.app-sidebar').getByRole('button',{name:'Close menu',exact:true}).click();await mobilePrimaryNav.getByRole('button',{name:'Plan',exact:true}).click();await textHas('Your mentor for today');record('Planner settings and Today dashboard switch application language');
await navigate('?testUser=1','#/tutor');await textHas('your Noviq Tutor');await fit();await shot('tutor-mobile');
await changeLanguage('Русский');await textHas('Здравствуйте!');await page.getByText('Язык ответа: автоматически',{exact:true}).waitFor();await mobilePrimaryNav.getByRole('button',{name:'Библиотека',exact:true}).click();await textHas('Превращает источники в знания для экзамена.');await fit();await shot('notebook-mobile-ru');await mobilePrimaryNav.getByRole('button',{name:'Тьютор',exact:true}).click();await changeLanguage('English');await page.getByText('Reply language: automatic',{exact:true}).waitFor();record('Tutor and Notebook switch application language while reply language remains automatic');
await navigate('?testUser=1','#/notes');await textHas('Turns sources into exam mastery');await fit();await shot('notebook-mobile');
await page.getByRole('button',{name:'Create note',exact:true}).click();await page.getByRole('textbox',{name:'Note title',exact:true}).waitFor();await fit();await shot('notebook-editor-mobile');
await page.getByRole('button',{name:'AI',exact:true}).click();await textHas('Build mastery');await fit();assert.equal(await evaluate(`(()=>{const panel=document.querySelector('[aria-label="Notebook AI panel"]');const button=document.querySelector('[aria-label="Ask Notebook AI"]');const notice=document.querySelector('.audit-mode-notice');return !!panel&&!!button&&!!notice&&button.getBoundingClientRect().bottom<=Math.min(panel.getBoundingClientRect().bottom,notice.getBoundingClientRect().top)})()`),true);await shot('notebook-ai-mobile');await page.getByRole('button',{name:'Close AI panel',exact:true}).click();record('Notebook list, editor and AI workspace fit on mobile');
await navigate('?testUser=1','#/focus');await textHas('Focus Zone');await fit();assert.equal(requests.some(request=>request.url.includes('soundhelix.com')),false);await shot('focus-mobile');await ab('set','viewport','320','740');await fit();await shot('focus-320px');await evaluate(`localStorage.setItem('noviq-locale','uz')`);await navigate('?testUser=1&localeReload=uz','#/focus');await textHas('Fokus hududi');await fit();await shot('focus-mobile-uz');await evaluate(`localStorage.setItem('noviq-locale','en')`);await ab('set','viewport','390','844');record('Focus avoids autoplay, fits narrow mobile and supports Uzbek');
await navigate('?testUser=1','#/flashcards');await textHas('Create your first deck');await fit();assert.equal(await evaluate(`getComputedStyle(document.querySelector('h2')).color`),'rgb(17, 24, 39)');await shot('flashcards-light-mobile');await page.getByRole('button',{name:'Create deck',exact:true}).first().click();const deckDialog=page.getByRole('dialog',{name:'Create deck',exact:true});await deckDialog.waitFor();assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Close deck form');await fit();await shot('flashcards-create-deck-mobile');await ab('press','Escape');await deckDialog.waitFor({state:'detached'});await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();assert.ok(['rgb(248, 250, 252)','rgb(237, 243, 255)'].includes(await evaluate(`getComputedStyle(document.querySelector('h2')).color`)));await shot('flashcards-dark-mobile');await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();record('Flashcards has readable light and dark themes with an accessible mobile dialog');
await page.emulateMedia({reducedMotion:'reduce'});await ab('set','viewport','375','812');await navigate('?testUser=1','#/flashcards');await textHas('Create your first deck');await fit();assert.ok(parseFloat(await evaluate(`getComputedStyle(document.querySelector('button')).transitionDuration`))<=0.00001);await ab('set','viewport','844','390');await fit();await shot('flashcards-landscape');await page.emulateMedia({reducedMotion:'no-preference'});await ab('set','viewport','390','844');record('Responsive shell supports 375px, landscape, safe areas and reduced motion');
await navigate('?testUser=1','#/analytics');await textHas('Learning analytics');await fit();await shot('analytics-light-mobile');await ab('set','viewport','320','740');await fit();await shot('analytics-320px');await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();assert.ok(['rgb(248, 250, 252)','rgb(237, 243, 255)'].includes(await evaluate(`getComputedStyle(document.querySelector('h2')).color`)));await shot('analytics-dark-mobile');await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();await evaluate(`localStorage.setItem('noviq-locale','uz')`);await navigate('?testUser=1&localeReload=analytics-uz','#/analytics');await textHas('O‘qish tahlili');await fit();await evaluate(`localStorage.setItem('noviq-locale','en')`);await ab('set','viewport','390','844');record('Analytics supports light, dark, 320px and Uzbek copy');
await navigate('?testUser=1','#/profile');await textHas('Manage your account, study preferences');await fit();await shot('profile-light-mobile');const avatarPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');await page.locator('input[accept="image/*"]').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:avatarPng});const avatarDialog=page.getByRole('dialog',{name:'Change avatar',exact:true});await avatarDialog.waitFor();
// Dialog focus is intentionally scheduled on the next animation frame.
await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Close avatar editor', {}, {timeout:5000});
assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Close avatar editor');assert.equal(await evaluate(`!!document.elementFromPoint(10,10).closest('.noviq-modal-backdrop')`),true);await fit();await shot('profile-avatar-mobile');await ab('press','Escape');await avatarDialog.waitFor({state:'detached'});await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();assert.equal(await evaluate(`document.querySelector('.noviq-app').classList.contains('dark')`),true);await shot('profile-dark-mobile');await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();await evaluate(`localStorage.setItem('noviq-locale','uz')`);await navigate('?testUser=1&localeReload=profile-uz','#/profile');await textHas('Hisob, o‘qish sozlamalari');await fit();await evaluate(`localStorage.setItem('noviq-locale','en')`);record('Profile supports themes, localized copy and keyboard-safe avatar editing');
await navigate('?testUser=1','#/pricing');await textHas('Give your learning a clear direction.');await fit();assert.equal(await page.getByRole('button',{name:'Monthly',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Yearly',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Yearly',exact:true}).getAttribute('aria-pressed'),'true');await textHas('299,000');await page.getByRole('button',{name:'Monthly',exact:true}).click();await page.locator('.discovery-purchase summary').click();await textHas('Online purchase is currently unavailable. You will not be charged.');await shot('pricing-light-mobile');await ab('set','viewport','320','740');await fit();await shot('pricing-320px');await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();assert.ok(['rgb(248, 250, 252)','rgb(237, 243, 255)'].includes(await evaluate(`getComputedStyle(document.querySelector('.discovery-plans h2')).color`)));await shot('pricing-dark-mobile');await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();await evaluate(`localStorage.setItem('noviq-locale','uz')`);await navigate('?testUser=1&localeReload=pricing-uz','#/pricing');await textHas('O‘qishingizga aniq yo‘nalish bering.');await fit();await evaluate(`localStorage.setItem('noviq-locale','en')`);await ab('set','viewport','390','844');record('Pricing supports themes, 320px, explicit selection states and Uzbek copy');
await navigate('?testUser=1','#/community');await textHas('Study together, share ideas');await fit();await shot('community-light-mobile');await ab('set','viewport','320','740');await fit();await shot('community-320px');await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();assert.ok(['rgb(248, 250, 252)','rgb(237, 243, 255)'].includes(await evaluate(`getComputedStyle(document.querySelector('h1')).color`)));await shot('community-dark-mobile');await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();await evaluate(`localStorage.setItem('noviq-locale','uz')`);await navigate('?testUser=1&localeReload=community-uz','#/community');await textHas('Do‘stlaringiz bilan birga o‘qing');await fit();assert.equal(await page.getByRole('heading',{name:'Guruhlarim',exact:true}).count(),1);await evaluate(`localStorage.setItem('noviq-locale','en')`);await ab('set','viewport','390','844');record('Community supports themes, 320px, modular UI and Uzbek copy');
await navigate('?testUser=1','#/dashboard');await textHas('A clear day starts with a small plan.');
assert.equal(await page.getByRole('button',{name:'Open Saidamin Noviq Tutor',exact:true}).count(),0);
assert.equal(await page.getByRole('navigation',{name:'Primary navigation',exact:true}).getByRole('button',{name:'Tutor',exact:true}).count(),1);
record('Mobile dashboard uses the primary Tutor destination without a floating overlay');
await navigate('?testUser=1','#/dashboard');await textHas('A clear day starts with a small plan.');await fit();await shot('dashboard-mobile');
await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();assert.equal(await evaluate(`document.querySelector('.noviq-app').classList.contains('dark')`),true);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.noviq-app')).getPropertyValue('--noviq-bg').trim()`),'#0b1220');await shot('dashboard-dark-mobile');await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();
assert.equal(await evaluate(`[...document.querySelectorAll('p')].filter(e=>e.textContent==='Saved task completion').length`),1);await page.getByText('Focus time '+String.fromCharCode(183)+' selected day',{exact:true}).scrollIntoViewIfNeeded();await shot('dashboard-cards-mobile');await ab('set','viewport','320','740');await fit();await shot('dashboard-320px');await ab('set','viewport','390','844');record('Dashboard single task metric and mobile fits at 320px and 390px');
await ab('set','viewport','1440','900');await shot('dashboard-desktop');await fit();
await navigate('?testUser=1&service=unavailable','#/dashboard');await page.locator('.today-shell .quiet-sync summary').click();await textHas('Statistics temporarily unavailable');
assert.equal(await evaluate(`document.body.innerText.includes('Loading…')`),false);await shot('dashboard-error');
await evaluate(`history.replaceState(null,'','?testUser=1&service=ready#/dashboard')`);
await page.locator('.today-shell .quiet-sync').getByRole('button',{name:'Refresh',exact:true}).click();
await until(`!document.body.innerText.includes('temporarily unavailable') && !document.body.innerText.includes('Statistics could not')`);record('Dashboard unavailable and retry recover');
if (process.env.NOVIQ_CAPTURE_ONLY) return;
await navigate('?testUser=1&service=pending','#/planner');await textHas('Your saved plan could not be loaded');
assert.equal(await evaluate(`document.body.innerText.includes('Loading saved planner')`),false);
await evaluate(`history.replaceState(null,'','?testUser=1&service=ready#/planner')`);await clickText('Try again');await textHas('Your mentor for today');record('Planner silent listener deadline and retry');
await navigate('?testUser=1&service=pending','#/tutor');await page.locator('.tutor-workspace').waitFor();await textHas('Saved conversation temporarily unavailable');
await evaluate(`history.replaceState(null,'','?testUser=1&service=ready#/tutor')`);await clickText('Retry history');await until(`!document.body.innerText.includes('Saved conversation temporarily unavailable')`);record('Tutor history deadline and retry');
await navigate('planner?testUser=1');await page.getByRole('heading',{name:'Smart Planner',exact:true}).waitFor();record('Direct /planner pathname opens the current Smart Planner');
for(const scenario of ['import','runtime','hang']) {
  await navigate(`tests/route-recovery.html?case=${scenario}`);await textHas('This page could not be loaded');await clickText('Retry page');await textHas('Recovered page');record(`Route ${scenario} error and retry`);
}
}
await ab('set','viewport','390','844');await navigate();await textHas('Exam Planning');await clickText('Exam Planning');
await until(`!!document.querySelector('[role=dialog]')`);
assert.equal(await evaluate(`document.querySelector('[role=dialog]').getAttribute('aria-modal')`),'true');
assert.equal(await evaluate(`document.getElementById('root').inert`),true);
assert.equal(await evaluate(`location.pathname`),'/planner');
await fit();await shot('signup-mobile');await clickText('Create account');
assert.equal(await evaluate(`document.querySelectorAll('[aria-invalid=true]').length`),3);
assert.equal(await evaluate(`document.activeElement.autocomplete`),'name');
await ab('fill','input[autocomplete=name]','Test Student');await ab('fill','input[type=email]','invalid');await ab('fill','input[autocomplete=new-password]','123');await clickText('Create account');await textHas('Enter a valid email address.');await textHas('Use at least 6 characters.');
await evaluate(`(()=>{const all=[...document.querySelector('[role=dialog]').querySelectorAll('button,input')].filter(e=>!e.disabled);all.at(-1).focus()})()`);await ab('press','Tab');
assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Close auth form');
await ab('press','Shift+Tab');assert.equal(await evaluate(`document.activeElement.textContent.trim()`),'Sign in');
await ab('press','Escape');await until(`!document.querySelector('[role=dialog]')`);assert.equal(await evaluate(`document.getElementById('root').inert`),false);record('CTA signup, inline validation, focus trap, Escape and mobile modal');
await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.innerText.trim().toLowerCase()==='sign in');b.click()})()`);await until(`!!document.querySelector('[role=dialog]')`);await clickText('Forgot password?');await textHas('Enter your email to reset your password.');assert.equal(await evaluate(`document.activeElement.type`),'email');record('Forgot password blank email focuses input');
await ab('press','Escape');
await ab('set','viewport','1440','900');await navigate();await clickText('Exam Planning');await until(`!!document.querySelector('[role=dialog]')`);await fit();await shot('signup-desktop');record('Desktop modal fits');
assert.equal(await evaluate(`window.__unexpectedWrites||0`),0);

assert.equal(requests.some(r=>/accounts:(signUp|signInWithPassword|sendOobCode)/.test(r.url)),false);
record('Invalid auth forms never call Firebase accounts endpoints');
let release, intercepted=0;
const blocked = new Promise(resolve=>{release=resolve;});
await page.route('**/identitytoolkit.googleapis.com/**',async route=>{intercepted++;await blocked;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'EMAIL_EXISTS'}})});});
await page.locator('input[autocomplete=name]').fill('Test Student');await page.locator('input[type=email]').fill('student@example.test');await page.locator('input[autocomplete=new-password]').fill('valid-password');
await clickText('Create account');await textHas('Please wait');assert.equal(await page.getByRole('button',{name:'Please wait',exact:true}).isDisabled(),true);
release();await textHas('already');assert.equal(intercepted,1);record('Valid signup shows loading and backend failure without production writes');
assert.deepEqual(runtimeErrors.filter(value=>!value.includes('Injected component runtime error')),[]);

await ab('set','viewport','390','844'); await navigate('?testUser=1','#/profile');
await textHas('No pending cloud changes'); await fit();
await page.locator('details').filter({hasText:'No pending cloud changes'}).locator('summary').click();
assert.equal(await page.getByRole('button',{name:'Import pending changes',exact:true}).count(),1);
await evaluate(`localStorage.setItem('noviq:offlineSyncQueue:v1',JSON.stringify([{id:'set:users/isolated-browser-user/notes/offline',userId:'isolated-browser-user',path:['users','isolated-browser-user','notes','offline'],kind:'set',data:{title:'Retained offline note'},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),attempts:0,status:'pending'}]))`);
await navigate('?testUser=1','#/planner'); await textHas("1 changes saved on this device"); await fit();
await page.locator('[aria-label="Cloud sync recovery"] summary').click();
const downloadPromise=page.waitForEvent('download'); await clickText('Export pending changes');
const download=await downloadPromise; const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
assert.equal(backup.operations.length,1); assert.equal(backup.operations[0].data.title,'Retained offline note');
await clickText('Retry cloud sync'); await textHas('Changes remain on this device');
assert.equal(await evaluate(`window.__unexpectedWrites||0`),0);
await evaluate(`localStorage.removeItem('noviq:offlineSyncQueue:v1')`);
record('Mobile recovery controls export genuine pending changes without cloud writes');
await navigate('?testUser=1&testAdmin=1','#/admin');await page.getByRole('button',{name:'System health',exact:true}).click();await textHas('No collected client errors.');await fit();record('Admin client monitoring fits on mobile');
await navigate('?testUser=1&testAdmin=1&service=unavailable','#/admin');await page.getByRole('button',{name:'System health',exact:true}).click();await textHas('Error reports temporarily unavailable.');
await evaluate(`history.replaceState(null,'','?testUser=1&testAdmin=1&service=ready#/admin')`);await clickText('Retry error reports');await textHas('No collected client errors.');record('Admin monitoring outage and retry recover');

fs.writeFileSync(`${output}/browser-results.json`,JSON.stringify({passed,viewportSizes:['1440x900','390x844','320x740'],productionWrites:0},null,2));

} finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
