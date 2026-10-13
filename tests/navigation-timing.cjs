const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const runs = [];
    for (let run = 0; run < 3; run++) {
      const page = await browser.newPage({viewport:{width:390,height:844}});
      page.setDefaultTimeout(20000);
      console.log(`Navigation timing run ${run + 1}: loading dashboard`);
      await page.route('**/*',route => new URL(route.request().url()).origin === 'http://127.0.0.1:4180' ? route.continue() : route.abort());
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      await page.goto('http://127.0.0.1:4180/?testUser=1#/dashboard',{waitUntil:'domcontentloaded',timeout:20000});
      await page.getByRole('heading',{name:'No mission yet',exact:true}).waitFor();
      const nav = page.getByRole('navigation',{name:'Primary navigation',exact:true});
      const timings = [];
      for (const phase of ['firstVisit','repeatVisit']) {
        for (const [label,ready] of [
          ['Plan','Your mentor for today'], ['Tutor','Hello! I am your Noviq Tutor'],
          ['Library','Turns sources into exam mastery'], ['Focus','Focus Zone'], ['Today','No mission yet'],
        ]) {
          await page.evaluate(({label, ready}) => {
            window.navigationFrameMs = null;
            document.addEventListener('click', event => {
              const button = event.target.closest('.mobile-bottom-nav button');
              if (!button || button.textContent.trim() !== label) return;
              const started = performance.now();
              const check = () => {
                const active = document.querySelector('.mobile-bottom-nav [aria-current="page"]');
                const main = document.querySelector('main');
                const candidates = label === 'Tutor'
                  ? [...(main?.querySelectorAll('textarea') || [])]
                  : [...(main?.querySelectorAll('h1,h2,h3,p,span') || [])].filter(element => element.textContent.includes(ready));
                const visible = candidates.some(element => element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden');
                if (active?.textContent.trim() === label && visible) {
                  requestAnimationFrame(() => {window.navigationFrameMs = performance.now() - started;});
                } else if (performance.now() - started < 15000) requestAnimationFrame(check);
              };
              requestAnimationFrame(check);
            }, {capture:true,once:true});
          }, {label,ready});
          const startedAt = await page.evaluate(() => performance.now());
          await nav.getByRole('button',{name:label,exact:true}).click();
          if (label === 'Tutor') await page.locator('textarea').waitFor();
          else await page.getByText(ready,{exact:label === 'Today'}).first().waitFor();
          const observedMs = await page.evaluate(start => performance.now()-start,startedAt);
          await page.waitForFunction(() => window.navigationFrameMs !== null);
          const clickToReadyFrameMs = await page.evaluate(() => window.navigationFrameMs);
          assert.equal(await nav.getByRole('button',{name:label,exact:true}).getAttribute('aria-current'),'page');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
          timings.push({phase,destination:label,observedMs,clickToReadyFrameMs});
          console.log(`Run ${run + 1} ${phase} ${label}: ${Math.round(clickToReadyFrameMs)}ms from DOM click; ${Math.round(observedMs)}ms automation observation`);
        }
      }
      assert.equal(await page.evaluate(() => window.__unexpectedWrites || 0),0);
      runs.push(timings);
      await page.close();
    }
    const report = {capturedAt:new Date().toISOString(),scope:'Vite development fixture with mock authentication and empty Firestore, CPU 4x, mobile 390x844. External HTTP requests blocked. observedMs includes automation overhead. clickToReadyFrameMs starts at captured DOM click and ends one animation frame after visible readiness-marker DOM and active nav detection; it is not a paint/compositor or INP measurement. Not production navigation, real-device, live backend or capacity measurements.',runs};
    fs.mkdirSync('artifacts/performance',{recursive:true});
    const reportName = process.argv[2] || 'navigation-frames-fixture';
    if (!/^[a-z0-9-]+$/.test(reportName)) throw new Error('Invalid report name');
    fs.writeFileSync(`artifacts/performance/${reportName}.json`,JSON.stringify(report,null,2));
    console.log(JSON.stringify(runs,null,2));
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
