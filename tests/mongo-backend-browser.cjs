const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
  const page = await context.newPage(); let signedIn = false, isAdmin = true, adminReads = 0, telegramCalls = 0;
  const account = { uid: 'fixture-admin', email: 'fixture@example.invalid', displayName: 'Fixture account', emailVerified: true };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'telegram.org' && url.pathname === '/js/telegram-widget.js') return route.fulfill({ contentType: 'text/javascript', body: `(() => {
      const script = document.currentScript;
      const name = script.getAttribute('data-onauth').match(/^window\\.([A-Za-z0-9]+)\\(user\\)$/)[1];
      const button = document.createElement('button'); button.textContent = 'Fixture Telegram login';
      button.onclick = () => window[name]({id:'12345',first_name:'Fixture',auth_date:1700000000,hash:'0'.repeat(64)});
      script.parentElement.appendChild(button);
    })();` });
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const reply = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/api/auth/telegram-config') return reply(200, { enabled: true, botUsername: 'fixture_bot' });
    if (url.pathname === '/api/auth/telegram') { telegramCalls++; signedIn = true; isAdmin = false; return reply(200, {user:account}); }
    if (url.pathname === '/api/auth/login') { signedIn = true; return reply(200, { user: account }); }
    if (url.pathname === '/api/auth/logout') { signedIn = false; return reply(200, { ok: true }); }
    if (url.pathname === '/api/auth/session') return signedIn ? reply(200, { user: account, isAdmin }) : reply(401, { error: 'Authentication required' });
    if (url.pathname === '/api/admin/users') { adminReads++; return reply(200, { users: [{ ...account, disabled: false }], nextCursor: null }); }
    return reply(404, {});
  });
  try {
    await page.goto('http://127.0.0.1:4180/backend-check');
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill('Fixture-only-not-a-real-password');
    assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('Admin access verified', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Accounts (1)', exact: true }).waitFor();
    assert.equal(adminReads, 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    isAdmin = false;
    await page.getByLabel('Password', { exact: true }).fill('Fixture-only-not-a-real-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('Signed in without admin access', { exact: true }).waitFor();
    assert.equal(adminReads, 1);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Fixture Telegram login', exact: true }).click();
    await page.getByText('Signed in without admin access', { exact: true }).waitFor();
    assert.equal(telegramCalls, 1); assert.equal(adminReads, 1);
    console.log('Mongo verification UI: admin login/list/logout, ordinary account isolation and 320px layout passed (API fixtures only).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
