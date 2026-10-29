import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAuthArchive, importAuthArchive } from '../src/authArchive.mjs';
const fixture = () => ({ version: 1, kind: 'firebase-auth', project: 'source', exportedAt: '2026-10-28T12:00:00Z',
  users: [{ localId: 'uid-1', providerUserInfo: [{ providerId: 'google.com' }], passwordHash: 'private-hash', customAttributes: '{"flag":true}' }],
  hashConfig: { signerKey: 'private-key', algorithm: 'SCRYPT' } });
test('Auth archive preserves all exported fields and rejects wrong sources and duplicate IDs', () => {
  const source = fixture(), archive = prepareAuthArchive(source, 'source');
  assert.deepEqual(JSON.parse(archive.snapshotJson), source);
  assert.throws(() => prepareAuthArchive(source, 'wrong-project'));
  source.users.push(source.users[0]);
  assert.throws(() => prepareAuthArchive(source, 'source'));
});
test('Auth archive retry is insert-only and integrity-checked without touching live accounts', async () => {
  let saved;
  const db = { collection(name) {
    assert.equal(name, 'migration_auth_snapshots');
    return { async insertOne(row) { if (saved) throw Object.assign(new Error(), { code: 11000 }); saved = structuredClone(row); },
      async findOne() { return saved; } };
  } };
  const archive = prepareAuthArchive(fixture(), 'source');
  const first = await importAuthArchive(db, archive);
  assert.deepEqual(await importAuthArchive(db, archive), first);
  assert.equal(first.applicationAccountsChanged, 0);
  assert.equal(JSON.stringify(first).includes('private-hash'), false);
  saved.snapshotJson = '{}';
  await assert.rejects(importAuthArchive(db, archive), /mismatch/);
});
