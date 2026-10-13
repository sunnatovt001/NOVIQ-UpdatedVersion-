import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAdminApi } from '../src/adminApi.mjs';
test('admin user listing is paginated, explicitly serialized and excludes credentials', async () => {
  let authorized = true, reads = 0;
  const db = { collection(name) {
    if (name === 'auth_roles') return { async findOne() { return { isAdmin: authorized }; } };
    assert.equal(name, 'auth_accounts');
    return { find(filter, options) {
      reads++; assert.equal(options.projection.passwordHash, undefined);
      return { sort() { return this; }, limit(n) { assert.equal(n, 51); return this; }, maxTimeMS() { return this; },
        async toArray() { return Array.from({ length: 51 }, (_, i) => ({ _id: `uid-${i}`, email: 'fixture@example.invalid', passwordHash: 'SECRET', salt: 'SECRET', providers: ['SECRET'] })); } };
    } };
  } };
  const server = http.createServer(createAdminApi(db, { resolve: async () => ({ uid: 'admin' }) }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/users`;
  try {
    const result = await fetch(base); const text = await result.text();
    assert.equal(result.status, 200); assert.ok(!text.includes('SECRET'));
    const data = JSON.parse(text); assert.equal(data.users.length, 50); assert.equal(data.nextCursor, 'uid-49');
    assert.equal((await fetch(base + '?after=%7B%22%24ne%22%3Anull%7D')).status, 400);
    authorized = false; const previous = reads;
    assert.equal((await fetch(base)).status, 403); assert.equal(reads, previous);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
