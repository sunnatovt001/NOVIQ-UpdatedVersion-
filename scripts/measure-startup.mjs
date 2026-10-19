import { preview } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { summarizeResources } from './resource-summary.mjs';

// Production assets, local transport, fresh signed-out contexts. No external
// requests are allowed: these numbers do not measure Firebase or AI latency.
const server = await preview({ preview: { host:'127.0.0.1', port:4191, strictPort:true } });
let browser;
try {
  browser = await chromium.launch({channel:'chrome',headless:true});
  const runs = [];
  for (let index = 0; index < 3; index++) {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const blocked = new Set();
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:4191') return route.continue();
      blocked.add(url.origin);
      return route.abort();
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.addInitScript(() => {
      window.startupMetrics = {lcp:0,longTasks:[],cls:0};
      for (const type of ['largest-contentful-paint','longtask','layout-shift']) {
        try {
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (type === 'largest-contentful-paint') window.startupMetrics.lcp = entry.startTime;
              if (type === 'longtask') window.startupMetrics.longTasks.push(entry.duration);
              if (type === 'layout-shift' && !entry.hadRecentInput) window.startupMetrics.cls += entry.value;
            }
          }).observe({type,buffered:true});
        } catch {}
      }
    });
    await page.goto('http://127.0.0.1:4191/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Sign up free',exact:true}).waitFor();
    const readyMs = await page.evaluate(() => performance.now());
    await page.waitForTimeout(1000);
    const startup = await page.evaluate(() => ({
      ...window.startupMetrics,
      fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      resources:performance.getEntriesByType('resource').filter(entry => entry.name.startsWith(location.origin)).map(entry => ({name:new URL(entry.name).pathname,bytes:entry.encodedBodySize,duration:entry.duration})),
    }));
    const clickedAt = await page.evaluate(() => performance.now());
    await page.getByRole('button',{name:'Sign up free',exact:true}).click();
    await page.getByRole('dialog',{name:'Create your study account',exact:true}).waitFor();
    const dialogMs = await page.evaluate(start => performance.now()-start,clickedAt);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    runs.push({readyMs,dialogMs,...startup,resourceSummary:summarizeResources(startup.resources),blockedOrigins:[...blocked]});
    if (index === 0 && process.argv[3] === '--screenshot') {
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({state:'detached'});
      await page.evaluate(() => window.scrollTo(0,0));
      await mkdir('artifacts/performance',{recursive:true});
      await page.screenshot({path:'artifacts/performance/landing-latest-mobile.png'});
    }
    await context.close();
  }
  const report = {capturedAt:new Date().toISOString(),scope:'Local production build, signed out, 390x844, CPU 4x, local network; all external requests blocked. Not a concurrency, live backend, real-device or network latency test.',runs};
  await mkdir('artifacts/performance',{recursive:true});
  const outputName = process.argv[2] || 'startup';
  if (!/^[a-z0-9-]+$/.test(outputName)) throw new Error('Report name must contain only lowercase letters, numbers and hyphens');
  await writeFile(`artifacts/performance/${outputName}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(runs.map(({readyMs,dialogMs,fcp,lcp,cls,longTasks,resourceSummary}) => ({readyMs,dialogMs,fcp,lcp,cls,longTaskCount:longTasks.length,longTaskMs:longTasks.reduce((a,b)=>a+b,0),...resourceSummary})),null,2));
} finally {
  await browser?.close();
  await new Promise((resolve,reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
