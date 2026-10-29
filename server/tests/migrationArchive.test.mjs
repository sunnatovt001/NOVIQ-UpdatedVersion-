import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArchive, importArchive, verifyStoredArchive } from '../src/migrationArchive.mjs';
const snapshot = () => ({ version: 1, project: 'source', database: 'named', readTime: '2026-10-12T00:00:00Z', documents: [
  { path: 'users/original-uid/notes/n1', fields: { large: { integerValue: '9223372036854775807' }, time: { timestampValue: '2026-10-12T00:00:00.123456789Z' }, bytes: { bytesValue: 'AQID' }, nested: { mapValue: { fields: { '$name': { stringValue: 'kept' } } } } } },
] });
function memoryDb() {
  const tables = new Map();
  return { tables, collection(name) {
    if (!tables.has(name)) tables.set(name, new Map());
    const rows = tables.get(name);
    return { async insertOne(row) { if (rows.has(row._id)) throw Object.assign(new Error(), { code: 11000 }); rows.set(row._id, structuredClone(row)); },
      async findOne(query) { return rows.get(query._id); },
      async countDocuments(query) { return [...rows.values()].filter(row => row.snapshotId === query.snapshotId).length; } };
  } };
}
test('archive retains exact native values, UID and nested path', () => {
  const source = snapshot();
  const archive = prepareArchive(source);
  assert.deepEqual(JSON.parse(archive.documents[0].fieldsJson), source.documents[0].fields);
  assert.equal(archive.documents[0].path, source.documents[0].path);
  assert.equal(prepareArchive(structuredClone(source)).id, archive.id);
});
test('invalid and duplicate paths rejected before any write', () => {
  for (const path of ['users', 'users/../notes/n1', 'users//notes/n1']) {
    const source = snapshot(); source.documents[0].path = path; assert.throws(() => prepareArchive(source));
  }
  const source = snapshot(); source.documents.push(source.documents[0]); assert.throws(() => prepareArchive(source));
});
test('insert-only retry verifies unchanged archive without duplication', async () => {
  const db = memoryDb(), archive = prepareArchive(snapshot());
  assert.equal((await importArchive(db, archive)).verified, true);
  assert.equal((await importArchive(db, archive)).documents, 1);
  assert.equal(db.tables.get('migration_documents').size, 1);
});
test('conflicting destination fails closed without overwrite', async () => {
  const db = memoryDb(), archive = prepareArchive(snapshot());
  await importArchive(db, archive);
  const row = [...db.tables.get('migration_documents').values()][0]; row.fieldsJson = '{}';
  await assert.rejects(importArchive(db, archive), /mismatch/);
  assert.equal(row.fieldsJson, '{}');
});

test('batched import is insert-only, verifies each row and rejects a conflicting retry', async () => {
  const base = memoryDb(); let batches = 0;
  const db = { collection(name) {
    const collection = base.collection(name);
    if (name !== 'migration_documents') return collection;
    return { ...collection,
      async bulkWrite(operations) {
        batches++;
        assert.ok(operations.length <= 100);
        for (const { updateOne: op } of operations) {
          assert.equal(op.upsert, true);
          assert.deepEqual(Object.keys(op.update), ['$setOnInsert']);
          if (!base.tables.get(name).has(op.filter._id)) await collection.insertOne(op.update.$setOnInsert);
        }
      },
      find(query) { return { limit() { return this; }, maxTimeMS() { return this; },
        async toArray() { return query._id.$in.map(id => base.tables.get(name).get(id)).filter(Boolean); } }; },
    };
  } };
  const source = snapshot();
  source.documents = Array.from({ length: 205 }, (_, i) => ({ ...source.documents[0], path: `users/u/notes/n${i}` }));
  const archive = prepareArchive(source);
  assert.equal((await importArchive(db, archive)).documents, 205);
  assert.equal(batches, 3);
  await importArchive(db, archive);
  assert.equal(base.tables.get('migration_documents').size, 205);
  const row = [...base.tables.get('migration_documents').values()][0]; row.fieldsJson = '{}';
  await assert.rejects(importArchive(db, archive), /mismatch/);
  assert.equal(row.fieldsJson, '{}');
});

function storedFixture(change = () => {}) {
  const archive = prepareArchive(snapshot());
  const manifest = { _id: archive.id, ...archive.manifest, verified: true };
  const rows = archive.documents.map(row => ({ _id: `${archive.id}:${row.path}`, snapshotId: archive.id, ...row }));
  change(rows, manifest);
  return { manifest, db: { collection(name) {
    assert.equal(name, 'migration_documents');
    return { find(query) {
      assert.deepEqual(query, { snapshotId: manifest._id });
      return { limit(n) { assert.equal(n, manifest.count + 1); return this; },
        maxTimeMS(n) { assert.equal(n, 10000); return this; }, async toArray() { return rows; } };
    } };
  } } };
}
const expectedSource = { project: 'source', database: 'named' };
test('stored archive verification recomputes integrity without claiming source freshness', async () => {
  const { db, manifest } = storedFixture();
  const result = await verifyStoredArchive(db, manifest, expectedSource);
  assert.equal(result.integrityVerified, true);
  assert.equal(result.currentSourceCompared, false);
  assert.equal(result.destinationWrites, 0);
  assert.equal(result.documents, 1);
  assert.equal(JSON.stringify(result).includes('fieldsJson'), false);
});
test('stored archive rejects missing, corrupted, relocated and duplicate records', async () => {
  for (const change of [
    rows => rows.pop(),
    rows => { rows[0].fieldsJson = '{}'; },
    rows => { rows[0]._id = 'another-archive:users/x'; },
    rows => rows.push(rows[0]),
    (_rows, manifest) => { manifest.contentHash = 'forged'; },
    (_rows, manifest) => { manifest.project = 'another-project'; },
  ]) {
    const { db, manifest } = storedFixture(change);
    await assert.rejects(verifyStoredArchive(db, manifest, expectedSource));
  }
});
