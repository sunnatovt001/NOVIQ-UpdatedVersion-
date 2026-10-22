import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramApi } from '../src/telegramApi.mjs';

test('unconfigured staging Telegram webhook and cron fail before database/provider work', async () => {
  const db = { collection() { throw new Error('Database must not be touched'); } };
  for (const path of ['/api/telegram', '/api/telegram/webhook', '/api/telegram/cron']) {
    const handler = createTelegramApi(db, {}, { token: 'test-token', webhookSecret: '' });
    const response = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await handler({ url: path, method: 'POST', headers: {} }, response);
    // A configured process-level CRON_SECRET still rejects a missing bearer.
    assert.equal(response.statusCode, path.endsWith('/cron') && process.env.CRON_SECRET ? 401 : 503);
  }
});
