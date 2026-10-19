import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAuthorization } from '../src/adminAuthorization.mjs';
test('rejects unauthenticated and ordinary accounts regardless of email/client flags', async () => {
  const db = { collection: () => ({ findOne: async () => null }) };
  await assert.rejects(createAdminAuthorization(db, { resolve: async () => null })('bad'), e => e.status === 401);
  await assert.rejects(createAdminAuthorization(db, { resolve: async () => ({ uid: 'normal', email: 'saidaxmadovsaidamin@gmail.com', isAdmin: true }) })('token'), e => e.status === 403);
});
test('reads authoritative role each time and immediately enforces revocation', async () => {
  let isAdmin = true;
  const db = { collection(name) { assert.equal(name, 'auth_roles'); return { async findOne(query) { assert.deepEqual(query, { _id: 'original-uid' }); return { isAdmin }; } }; } };
  const guard = createAdminAuthorization(db, { resolve: async () => ({ uid: 'original-uid' }) });
  assert.equal((await guard('token')).uid, 'original-uid');
  isAdmin = false; await assert.rejects(guard('token'), e => e.status === 403);
});
