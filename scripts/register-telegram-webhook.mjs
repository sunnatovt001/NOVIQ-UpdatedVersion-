import { pathToFileURL } from 'node:url';

// Runs only in the production Vercel build, using server-only environment values.
// Never logs provider responses, tokens or webhook secrets.
export async function registerTelegramWebhook(env = process.env, fetchImpl = fetch, log = console.log) {
  if (env.VERCEL_ENV !== 'production') {
    log('Telegram webhook: skipped outside Vercel production.');
    return { skipped: true };
  }
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !secret) throw new Error('Telegram webhook: required production settings are missing.');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) throw new Error('Telegram webhook: secret has an invalid format.');
  const username = (env.VITE_TELEGRAM_BOT_USERNAME || 'noviqq_bot').replace(/^@/, '');
  const url = 'https://noviqupdated.vercel.app/api/telegram';
  async function call(method, body = {}) {
    let response;
    try {
      response = await fetchImpl('https://api.telegram.org/bot' + token + '/' + method, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('Telegram webhook: ' + method + ' network request failed.');
    }
    let result;
    try { result = await response.json(); } catch {
      throw new Error('Telegram webhook: invalid ' + method + ' response.');
    }
    if (!response.ok || !result.ok) {
      throw new Error('Telegram webhook: ' + method + ' rejected (HTTP ' + response.status + ').');
    }
    return result.result;
  }
  const me = await call('getMe');
  if (me.username !== username) throw new Error('Telegram webhook: token belongs to a different bot.');
  const before = await call('getWebhookInfo');
  log('Telegram webhook before: ' + JSON.stringify({
    matchesTarget: before.url === url, pendingUpdates: before.pending_update_count || 0,
    hasDeliveryError: Boolean(before.last_error_message),
  }));
  // Refresh secret_token even when the URL already matches; never drop pending updates.
  await call('setWebhook', { url, secret_token: secret });
  const after = await call('getWebhookInfo');
  if (after.url !== url) throw new Error('Telegram webhook: registered URL did not match.');
  log('Telegram webhook registered: ' + JSON.stringify({
    username: me.username, url: after.url, pendingUpdates: after.pending_update_count || 0,
    hasDeliveryError: Boolean(after.last_error_message),
  }));
  return { url, username: me.username };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  registerTelegramWebhook().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
