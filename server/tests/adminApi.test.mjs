import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAdminApi } from '../src/adminApi.mjs';

test('HTTP admin boundary rejects anonymous/ordinary callers and allows verified admin only', async () => {
  let admin = true, reads = 0;
  const db = { collection(name) {
    if (name === 'auth_roles') return { findOne: async () => ({ isAdmin: admin }) };
    assert.equal(name, 'migration_manifests');
    return { find() { reads++; return { sort() { return this; }, limit(n) { assert.equal(n, 10); return this; }, maxTimeMS() { return this; }, async toArray() { return [{ count: 2157, verified: true }]; } }; } };
  } };
  const server = http.createServer(createAdminApi(db, { resolve: async token => token === 'a'.repeat(64) ? { uid: 'original-uid' } : null }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/migration-status`;
  const headers = { Cookie: `__Host-noviq_session=${'a'.repeat(64)}` };
  try {
    assert.equal((await fetch(url)).status, 401); assert.equal(reads, 0);
    admin = false; assert.equal((await fetch(url, { headers })).status, 403); assert.equal(reads, 0);
    admin = true; const response = await fetch(url, { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).archives[0].count, 2157);
    assert.equal((await fetch(url, { method: 'POST', headers })).status, 405);
    assert.equal((await fetch(url, { headers: { Cookie: `${headers.Cookie}; ${headers.Cookie}` } })).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
