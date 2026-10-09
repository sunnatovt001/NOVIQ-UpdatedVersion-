// Build first; run a Vite preview on 127.0.0.1:4173 before this check.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    // Rollup can share entry exports with page chunks. Supply a mount point and
    // block all external requests before imports so no cloud writes can leave.
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.route('**/bundle-smoke', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
    await page.goto('http://127.0.0.1:4173/bundle-smoke');
    const results = [];
    for (const name of ['Planner', 'Tutor', 'Dashboard']) {
      const asset = fs.readdirSync('dist/assets').find(file => file.startsWith(`${name}-`) && file.endsWith('.js'));
      assert.ok(asset);
      const exports = await page.evaluate(async path => Object.keys(await import(path)), `/assets/${asset}`);
      assert.ok(exports.includes(name));
      results.push({ page: name, asset, exports });
      console.log(`PASS production ${name} module imports and exports ${name}`);
    }
    fs.mkdirSync('artifacts/production-audit', { recursive: true });
    fs.writeFileSync('artifacts/production-audit/bundle-results.json', JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
