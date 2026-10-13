const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exportsCopy = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/auth/appCopy.ts','utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS},
}).outputText, {exports:exportsCopy});

(async () => {
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    for (const locale of ['en','uz','ru']) {
      for (const theme of ['light','dark']) {
        const context = await browser.newContext({viewport:{width:320,height:740}, reducedMotion:'reduce'});
        await context.addInitScript(({locale,theme}) => {
          localStorage.setItem('noviq-locale',locale);
          localStorage.setItem('noviq-theme',theme);
        },{locale,theme});
        const page = await context.newPage();
        for (const [query,key] of [['testAuthLoading=1','preparing'],['testUser=1&testMissingProfile=1','profileLoading']]) {
          await page.goto(`http://127.0.0.1:4180/?${query}`);
          const loading = page.locator('[data-app-loading]');
          await loading.waitFor();
          assert.equal(await loading.getByRole('status').textContent().then(value=>value.trim()), exportsCopy.getAppCopy(locale)[key]);
          assert.equal(await loading.evaluate(element=>getComputedStyle(element).backgroundColor),theme==='dark'?'rgb(11, 18, 32)':'rgb(247, 248, 246)');
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
          assert.equal(await loading.evaluate(element=>element.getAnimations({subtree:true}).length),0);
          assert.equal(await page.evaluate(()=>window.__unexpectedWrites||0),0);
        }
        if (locale==='en' && theme==='dark') {
          fs.mkdirSync('artifacts/production-audit',{recursive:true});
          await page.screenshot({path:'artifacts/production-audit/loading-dark-320.png'});
        }
        await page.goto('http://127.0.0.1:4180/?testUser=1#/dashboard');
        await page.getByRole('main').waitFor();
        assert.equal(await page.locator('[data-app-loading]').count(),0);
        await context.close();
        console.log(`PASS loading and missing-profile screens: ${locale}, ${theme}, 320px, no animation`);
      }
    }
    const context = await browser.newContext({viewport:{width:320,height:740}});
    await context.addInitScript(()=>{
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function(key) {
        if(key==='noviq-theme')throw new DOMException('Blocked','SecurityError');
        return original.call(this,key);
      };
    });
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:4180/?testAuthLoading=1');
    await page.getByRole('status').filter({hasText:'Preparing your workspace'}).waitFor();
    await page.locator('.noviq-loading-mark img').evaluate(img=>img.decode());
    const mark=page.locator('.noviq-loading-mark');
    assert.equal(await mark.evaluate(el=>el.getAnimations({subtree:true}).length),3);
    const ring=page.locator('.noviq-loading-ring');
    const transform=await ring.evaluate(el=>getComputedStyle(el).transform);
    await page.waitForTimeout(150);
    assert.notEqual(await ring.evaluate(el=>getComputedStyle(el).transform),transform);
    await page.setViewportSize({width:1440,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'artifacts/production-audit/loading-animated-desktop.png'});
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await mark.evaluate(el=>el.getAnimations({subtree:true}).length),0);
    assert.deepEqual(errors,[]);
    assert.equal(await page.locator('[data-app-loading]').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(247, 248, 246)');
    await context.close();
    console.log('PASS loading tolerates blocked theme storage');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
