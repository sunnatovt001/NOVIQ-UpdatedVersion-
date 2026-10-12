import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionService, sessionCookie, requireTrustedOrigin } from '../src/sessions.mjs';

function fixture() {
  const tables = { auth_accounts: new Map([['original-uid', { _id: 'original-uid', email: 'test@example.invalid', passwordHash: 'never-public', emailVerified: true }]]), auth_sessions: new Map() };
  let time = new Date('2026-10-12T00:00:00Z');
  const db = { collection(name) { const rows = tables[name]; return {
    async insertOne(row) { rows.set(row._id, row); }, async findOne(query) { return rows.get(query._id); },
    async deleteOne(query) { rows.delete(query._id); },
    async deleteMany(query) { for (const [key, row] of rows) if (row.userId === query.userId) rows.delete(key); },
    async createIndex() {},
  }; } };
  return { tables, service: createSessionService(db, { now: () => time }), advance() { time = new Date(time.getTime() + 31 * 86400000); } };
}
test('sessions store only token hashes and expose a safe account view preserving UID', async () => {
  const { service, tables } = fixture();
  const { token } = await service.create('original-uid');
  assert.ok(!JSON.stringify([...tables.auth_sessions.values()]).includes(token));
  const user = await service.resolve(token);
  assert.equal(user.uid, 'original-uid');
  assert.equal(user.passwordHash, undefined);
  assert.equal(await service.resolve({ $ne: null }), null);
});
test('expired or disabled sessions fail even before TTL cleanup', async () => {
  const f = fixture(); const { token } = await f.service.create('original-uid');
  f.tables.auth_accounts.get('original-uid').disabled = true;
  assert.equal(await f.service.resolve(token), null);
  await assert.rejects(f.service.create('original-uid'));
  f.tables.auth_accounts.get('original-uid').disabled = false;
  f.advance(); assert.equal(await f.service.resolve(token), null);
});
test('logout and revoke-all invalidate sessions', async () => {
  const { service } = fixture();
  const one = await service.create('original-uid'); const two = await service.create('original-uid', true);
  await service.revoke(one.token); assert.equal(await service.resolve(one.token), null);
  assert.ok(await service.resolve(two.token));
  await service.revokeAll('original-uid'); assert.equal(await service.resolve(two.token), null);
});
test('production cookie protects token; mutations reject missing/foreign origins', () => {
  const cookie = sessionCookie('a'.repeat(64), { maxAge: 86400 });
  assert.match(cookie, /^__Host-noviq_session=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
  assert.throws(() => sessionCookie('bad'));
  for (const origin of [undefined, 'https://evil.invalid', 'https://app.invalid.evil']) assert.throws(() => requireTrustedOrigin(origin, 'https://app.invalid'));
  requireTrustedOrigin('https://app.invalid', 'https://app.invalid');
});
