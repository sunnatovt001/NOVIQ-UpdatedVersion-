import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAuthApi } from '../src/authApi.mjs';

test('login HTTP validates origin/body, limits attempts and issues private cookie only after verification', async () => {
  let count = 0, created = 0, disabled = false;
  const db = { collection(name) { return {
    async findOneAndUpdate() { return { attempts: ++count }; },
    async findOne() {
      if (name === 'auth_accounts') return { _id: 'preserved-uid', disabled, email: 'test@example.invalid' };
      if (name === 'auth_settings') return { hashConfig: {} };
      if (name === 'auth_roles') return { isAdmin: true };
    },
  }; } };
  const sessions = { async create(uid) { assert.equal(uid, 'preserved-uid'); created++; return { token: 'a'.repeat(64) }; },
    async resolve(token) { return token === 'a'.repeat(64) ? { uid: 'preserved-uid' } : null; }, async revoke() {} };
  const server = http.createServer(createAuthApi(db, sessions, { origin: 'https://app.invalid', verify: async password => password === 'correct' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (body, origin = 'https://app.invalid') => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await login({ email: 'test@example.invalid', password: 'correct' }, 'https://evil.invalid')).status, 403);
    assert.equal(count, 0);
    assert.equal((await login({ email: { $ne: null }, password: 'correct' })).status, 400);
    assert.equal((await login({ email: 'test@example.invalid', password: 'wrong' })).status, 401);
    assert.equal(created, 0);
    const response = await login({ email: 'test@example.invalid', password: 'correct', remember: true });
    assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /HttpOnly.*SameSite=Lax.*Secure/);
    assert.deepEqual(await response.json(), { user: { uid: 'preserved-uid' } });
    disabled = true; assert.equal((await login({ email: 'test@example.invalid', password: 'correct' })).status, 401);
    assert.equal(created, 1);
    count = 30; assert.equal((await login({ email: 'test@example.invalid', password: 'correct' })).status, 429);
    assert.equal((await fetch(`${base}/api/auth/session`)).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
