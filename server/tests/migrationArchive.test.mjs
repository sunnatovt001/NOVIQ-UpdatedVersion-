import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArchive, importArchive } from '../src/migrationArchive.mjs';
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
