import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { verifyTelegramIdentity } from '../src/telegramIdentity.mjs';
const token = '123456:synthetic_fixture_token_not_real';
const now = 1700000000;
function signed() {
  const data = { id: '12345', first_name: 'Fixture', username: 'fixture_user', auth_date: String(now) };
  const text = Object.keys(data).sort().map(key => `${key}=${data[key]}`).join('\n');
  return { ...data, hash: createHmac('sha256', createHash('sha256').update(token).digest()).update(text).digest('hex') };
}
test('accepts signed fresh identity keyed by immutable Telegram ID', () => {
  assert.deepEqual(verifyTelegramIdentity(signed(), token, now), { telegramId: '12345', displayName: 'Fixture', username: 'fixture_user' });
});
test('rejects username-only, altered, stale, future, wrong-bot and role-injection proofs', () => {
  assert.equal(verifyTelegramIdentity({ username: 'admin' }, token, now), null);
  assert.equal(verifyTelegramIdentity({ ...signed(), username: 'admin' }, token, now), null);
  assert.equal(verifyTelegramIdentity(signed(), token, now + 301), null);
  assert.equal(verifyTelegramIdentity(signed(), token, now - 31), null);
  assert.equal(verifyTelegramIdentity(signed(), '654321:another_fixture_token_not_real', now), null);
  assert.equal(verifyTelegramIdentity({ ...signed(), isAdmin: true }, token, now), null);
});
