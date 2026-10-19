const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route(/fonts.googleapis.com|fonts.gstatic.com|api.dicebear.com/, route => route.abort());
    for (const route of ['dashboard', 'planner', 'flashcards', 'notes', 'focus', 'tutor', 'analytics', 'pricing']) {
      await page.goto('http://127.0.0.1:4180/?testUser=1#/' + route);
      await page.locator('.noviq-app:not([data-app-loading])').waitFor({ timeout: 20000 });
      assert.equal(await page.locator('.pro-environment').count(), 0);
      // Upgrade may show a local retry notice; it must never replace the shell.
      if (route !== 'pricing') assert.equal(await page.getByText('This action could not be completed. Your saved content is safe. Retry when connected.', { exact: true }).count(), 0);
      assert.ok((await page.locator('main').innerText()).trim().length > 20);
      console.log('PASS membership unavailable: Free ' + route + ' remains usable; PRO locked');
    }
    await page.screenshot({ path: 'artifacts/membership-fallback.png', fullPage: true });
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
