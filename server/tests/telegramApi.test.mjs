import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash, createHmac } from 'node:crypto';
import { createAuthApi } from '../src/authApi.mjs';
test('Telegram signup/login requires valid proof, creates a separate non-admin identity and rejects replay', async () => {
  const token = '123456:synthetic_fixture_token_not_real', now = new Date('2026-10-13T00:00:00Z');
  const accounts = new Map(), proofs = new Set(); let creates = 0;
  const db = { collection(name) {
    assert.ok(['auth_accounts', 'auth_telegram_proofs'].includes(name));
    return { async insertOne(row) {
      if (name === 'auth_telegram_proofs') {
        if (proofs.has(row._id)) throw Object.assign(new Error(), { code: 11000 });
        proofs.add(row._id);
      } else accounts.set(row._id, row);
    }, async findOne(query) { return accounts.get(query._id); } };
  } };
  const sessions = { async create(uid) { creates++; assert.equal(uid, 'tg_12345'); return { token: 'a'.repeat(64) }; }, async revoke() {}, async resolve() { return { uid: 'tg_12345', email: null }; } };
  const server = http.createServer(createAuthApi(db, sessions, { origin: 'https://app.invalid', telegramToken: token, telegramBotUsername: 'fixture_bot', now: () => now }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const data = { id: '12345', first_name: 'Fixture', username: 'admin_name', auth_date: String(now.getTime() / 1000) };
  const check = Object.keys(data).sort().map(key => `${key}=${data[key]}`).join('\n');
  const payload = { ...data, hash: createHmac('sha256', createHash('sha256').update(token).digest()).update(check).digest('hex') };
  const login = body => fetch(base + '/api/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.invalid' }, body: JSON.stringify(body) });
  try {
    const publicConfig = await (await fetch(base + '/api/auth/telegram-config')).text();
    assert.ok(!publicConfig.includes(token));
    assert.equal((await login({ username: 'admin_name' })).status, 401); assert.equal(creates, 0);
    const response = await login(payload); assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.equal(accounts.get('tg_12345').isAdmin, undefined);
    assert.equal((await login(payload)).status, 401); assert.equal(creates, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
