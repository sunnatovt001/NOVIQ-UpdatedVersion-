import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAuthApi } from '../src/authApi.mjs';
test('Google login maps verified UID, not submitted email/role, and rejects disabled or unknown accounts', async () => {
  let valid = true, disabled = false, creates = 0, found = true;
  const db = { collection(name) { assert.equal(name, 'auth_accounts'); return { async findOne(query) {
    assert.deepEqual(query, { _id: 'original-google-uid' });
    return found ? { _id: 'original-google-uid', sourceProject: 'fixture-project', disabled, providers: [{ providerId: 'google.com' }] } : null;
  } }; } };
  const sessions = { async create(uid) { assert.equal(uid, 'original-google-uid'); creates++; return { token: 'a'.repeat(64) }; }, async revoke() {}, async resolve() { return { uid: 'original-google-uid' }; } };
  const server = http.createServer(createAuthApi(db, sessions, { origin: 'https://app.invalid', googleVerify: async () => valid ? { uid: 'original-google-uid', project: 'fixture-project' } : null }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/auth/google`;
  const login = () => fetch(url, { method: 'POST', headers: { Origin: 'https://app.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 'fixture', email: 'admin@example.invalid', isAdmin: true, uid: 'forged-uid' }) });
  try {
    const response = await login(); assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    valid = false; assert.equal((await login()).status, 401);
    valid = true; disabled = true; assert.equal((await login()).status, 401);
    disabled = false; found = false; assert.equal((await login()).status, 401);
    assert.equal(creates, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
