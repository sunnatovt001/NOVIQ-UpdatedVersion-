const test = require('node:test');
const assert = require('node:assert/strict');
const env = { VERCEL_ENV: 'production', TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_WEBHOOK_SECRET: 'test-secret' };
const target = 'https://noviqupdated.vercel.app/api/telegram';
async function setup(options = {}) {
  const { registerTelegramWebhook } = await import('../scripts/register-telegram-webhook.mjs');
  const calls = [], logs = [];
  const fetch = async (url, init) => {
    const method = url.split('/').at(-1), body = JSON.parse(init.body);
    calls.push({ method, body });
    if (options.error) throw new Error('sensitive provider URL: test-token test-secret');
    return { ok: !options.unauthorized, status: options.unauthorized ? 401 : 200, json: async () => ({
      ok: !options.unauthorized, result: method === 'getMe' ? { username: options.username || 'noviqq_bot' } :
        method === 'getWebhookInfo' ? { url: calls.length < 3 ? '' : target, pending_update_count: 3 } : true,
    }) };
  };
  return { run: override => registerTelegramWebhook({ ...env, ...override }, fetch, line => logs.push(line)), calls, logs };
}
test('preview builds never contact Telegram', async () => {
  const s = await setup(); await s.run({ VERCEL_ENV: 'preview' }); assert.equal(s.calls.length, 0);
});
test('production refreshes webhook secret without dropping queued updates or logging credentials', async () => {
  const s = await setup(); assert.equal((await s.run()).url, target);
  assert.deepEqual(s.calls.map(c => c.method), ['getMe', 'getWebhookInfo', 'setWebhook', 'getWebhookInfo']);
  assert.deepEqual(s.calls[2].body, { url: target, secret_token: 'test-secret' });
  assert.doesNotMatch(s.logs.join('\n'), /test-token|test-secret/);
});
test('wrong bot identity prevents webhook changes', async () => {
  const s = await setup({ username: 'other_bot' }); await assert.rejects(s.run(), /different bot/);
  assert.equal(s.calls.length, 1);
});
test('missing production configuration fails before network access', async () => {
  const s = await setup(); await assert.rejects(s.run({ TELEGRAM_BOT_TOKEN: '' }), /missing/); assert.equal(s.calls.length, 0);
});
test('provider rejection and network errors never disclose credentials', async () => {
  for (const options of [{ unauthorized: true }, { error: true }]) {
    const s = await setup(options); await assert.rejects(s.run(), e => !/test-token|test-secret/.test(e.message));
  }
});
