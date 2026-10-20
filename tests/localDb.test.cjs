const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { getLocalDb } = require('../server/src/localDb.cjs');

test('localDb - CRUD operations and queries', async () => {
  const tempFile = path.join(os.tmpdir(), `noviq-localdb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  process.env.NOVIQ_LOCAL_DB_FILE = tempFile;
  try {
    const db = getLocalDb();
    const testUserId = `test-user-${Date.now()}`;

  // Insert
  await db.collection('test_col').insertOne({
    _id: testUserId,
    userId: testUserId,
    name: 'Test Student',
    score: 100,
    tags: ['math', 'physics'],
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    used: false,
  });

  // findOne exact
  const doc = await db.collection('test_col').findOne({ _id: testUserId });
  assert.ok(doc);
  assert.equal(doc.name, 'Test Student');

  // findOne with operators ($gt, used: false)
  const active = await db.collection('test_col').findOne({
    _id: testUserId,
    used: false,
    expiresAt: { $gt: new Date() },
  });
  assert.ok(active, 'should find unexpired and unused doc');

  // updateOne with $set and $inc
  await db.collection('test_col').updateOne(
    { _id: testUserId },
    { $set: { used: true }, $inc: { score: 20 } }
  );

  const updated = await db.collection('test_col').findOne({ _id: testUserId });
  assert.equal(updated.used, true);
  assert.equal(updated.score, 120);

  // deleteMany
  const del = await db.collection('test_col').deleteMany({ userId: testUserId });
  assert.equal(del.deletedCount, 1);

  const gone = await db.collection('test_col').findOne({ _id: testUserId });
  assert.equal(gone, null);
  } finally {
    delete process.env.NOVIQ_LOCAL_DB_FILE;
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}
  }
});
