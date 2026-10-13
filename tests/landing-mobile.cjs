const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    fs.mkdirSync('artifacts/production-audit',{recursive:true});
    for(const width of [320,390])for(const locale of ['en','uz','ru']) {
      const context=await browser.newContext({viewport:{width,height:740}});
      await context.addInitScript(value=>localStorage.setItem('noviq-locale',value),locale);
      const page=await context.newPage();
      await page.goto('http://127.0.0.1:4180/');
      const signup=page.locator('main button').first();
      await signup.waitFor();
      for(const label of ({en:['Smart exam planning','AI Tutor','Academic Notebook'],uz:['Aqlli imtihon rejasi','AI ustoz','O‘quv daftari'],ru:['Умный план подготовки','AI-наставник','Учебные заметки']})[locale]) {
        assert.ok(await page.getByText(label,{exact:true}).count() >= 1, `localized product copy: ${label}`);
      }
      assert.equal(await page.getByText('ACADEMY PRO',{exact:true}).count(),0);
      assert.equal(await page.getByText('Elite',{exact:true}).count(),0);
      assert.equal(await page.getByText('24/7 Active',{exact:true}).count(),0);
      const menu=page.locator('header button[aria-expanded]');
      await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');
      await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'false');
      const bounds=await signup.boundingBox();
      assert.ok(bounds && bounds.y>=0 && bounds.y+bounds.height<=740,`${locale} ${width}: signup fits initial viewport (${JSON.stringify(bounds)})`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(width===390&&locale==='en')await page.screenshot({path:'artifacts/production-audit/landing-compact-390.png'});
      await signup.click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.evaluate(()=>window.__unexpectedWrites||0),0);
      await context.close();
      console.log(`PASS initial mobile signup visible and opens dialog: ${locale}, ${width}px`);
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
