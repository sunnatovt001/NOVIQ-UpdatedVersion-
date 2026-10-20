const test = require('node:test');
const assert = require('node:assert/strict');

const configured = { TELEGRAM_WEBHOOK_SECRET: 'isolated-secret', TELEGRAM_BOT_TOKEN: 'isolated-token', CRON_SECRET: 'isolated-cron' };
function response() { return { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
test('production Telegram route authenticates before loading handlers and parses JSON', async () => {
  const { createTelegramHandler } = await import('../api/telegram.js');
  let loads = 0, webhooks = 0, sweeps = 0;
  const handler = createTelegramHandler(() => { loads++; return {
    telegramWebhook(req, res) { webhooks++; assert.equal(req.body.update_id, 0); res.status(200).json({ ok: true }); },
    runTelegramNotificationSweep() { sweeps++; return { sent: 0 }; },
  }; }, configured);
  for (const [req, expected] of [
    [{ method: 'GET', headers: {}, query: {} }, 405],
    [{ method: 'POST', headers: {}, query: {}, body: {} }, 401],
    [{ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'wrong' }, query: {} }, 401],
    [{ method: 'GET', headers: { 'x-vercel-cron': '1' }, query: { cron: '1' } }, 401],
    [{ method: 'GET', headers: { 'x-telegram-bot-api-secret-token': 'isolated-cron' }, query: { cron: '1' } }, 401],
    [{ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'isolated-secret' }, query: {}, body: '{' }, 400],
  ]) { const res = response(); await handler(req, res); assert.equal(res.code, expected); }
  assert.equal(loads, 0);
  const webhook = response();
  await handler({ method: 'POST', query: {}, headers: { 'x-telegram-bot-api-secret-token': 'isolated-secret' }, body: '{"update_id":0}' }, webhook);
  assert.equal(webhook.code, 200); assert.equal(webhooks, 1);
  const cron = response();
  await handler({ method: 'GET', query: { cron: '1' }, headers: { authorization: 'Bearer isolated-cron' } }, cron);
  assert.equal(cron.code, 200); assert.equal(sweeps, 1);
});
test('unconfigured webhook and cron fail closed without backend initialization', async () => {
  const { createTelegramHandler } = await import('../api/telegram.js');
  const handler = createTelegramHandler(() => { throw new Error('must not initialize'); }, {});
  for (const query of [{}, { cron: '1' }]) {
    const res = response(); await handler({ method: 'POST', query, headers: {}, body: {} }, res); assert.equal(res.code, 503);
  }
});
test('production app URLs resolve to the verified NOVIQ production domain', () => {
  const { getAppUrl, getProfileUrl } = require('../functions/appUrl.js');
  assert.equal(getAppUrl({ NODE_ENV: 'production' }), 'https://noviqupdated.vercel.app');
  assert.equal(getProfileUrl({ NODE_ENV: 'production', PUBLIC_APP_URL: 'http://localhost:3000' }), 'https://noviqupdated.vercel.app/profile');
  assert.equal(getAppUrl({ NODE_ENV: 'production', PUBLIC_APP_URL: 'http://noviqupdated.vercel.app' }), 'https://noviqupdated.vercel.app');
});
