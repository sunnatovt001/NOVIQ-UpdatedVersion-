import test from 'node:test';
import assert from 'node:assert/strict';
import { BSON } from 'mongodb';
import { createMirroredDatabase, sealMirrorRecord, openMirrorRecord, readMirrorKey,
  createFirestoreMirrorSink, deliverMirrorEvent, mirroredCollections, verifyMirrorBackup } from '../src/firebaseMirror.mjs';
const key = readMirrorKey('ab'.repeat(32));

test('encrypted mirror preserves BSON and authenticates the record identity and sequence', () => {
  const record = { collection: 'auth_accounts', record: { _id: 'owner', secret: 'private-hash',
    revision:1,nested:{amount:1.25},when: new Date('2026-10-29T00:00:00Z'), large: BSON.Long.fromString('9223372036854775807') } };
  const envelope = sealMirrorRecord(record, key, 'entity', 1);
  assert.equal(JSON.stringify(envelope).includes('private-hash'), false);
  assert.deepEqual(openMirrorRecord(envelope, key, 'entity', 1), record);
  assert.throws(() => openMirrorRecord(envelope, key, 'other', 1));
  assert.throws(() => openMirrorRecord(envelope, key, 'entity', 2));
  assert.throws(() => readMirrorKey('placeholder'));
});

function fixture() {
  let tables = new Map(), failQueue = false;
  const session = {};
  const table = name => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name); };
  const db = { collection(name) { return {
    async insertOne(row, options) {
      assert.equal(options.session, session);
      if (name === 'firebase_mirror_outbox' && failQueue) throw new Error('queue unavailable');
      if (table(name).has(row._id)) throw Object.assign(new Error(), { code: 11000 });
      table(name).set(row._id, structuredClone(row)); return { insertedId: row._id };
    },
    async findOne(query, options) { assert.equal(options.session, session); return table(name).get(query._id); },
    async updateOne(query, update, options) {
      assert.equal(options.session, session); const row = table(name).get(query._id);
      if (!row || row.revision !== query.revision) return { modifiedCount: 0 };
      Object.assign(row, update.$set); return { modifiedCount: 1 };
    },
    async findOneAndUpdate(query, update, options) {
      assert.equal(options.session, session); const previous = table(name).get(query._id)?.sequence || 0;
      const row = { _id: query._id, sequence: previous + update.$inc.sequence };
      table(name).set(row._id, row); return row;
    },
  }; } };
  const transaction = async work => {
    const backup = structuredClone(tables);
    try { return await work(session); } catch (error) { tables = backup; throw error; }
  };
  return { db, transaction, table, fail() { failQueue = true; } };
}

test('application write and backup event commit atomically; queue failure rolls both back', async () => {
  const f = fixture(), db = createMirroredDatabase(f.db, { transaction: f.transaction, key });
  await db.collection('notebook_notes').insertOne({ _id: 'owner:note', title: 'secret note', revision: 1 });
  let events = [...f.table('firebase_mirror_outbox').values()];
  assert.equal(events.length, 1);
  assert.equal(events[0].sequence, 1);
  assert.equal(openMirrorRecord(events[0].envelope, key, events[0].entityId, 1).record.title, 'secret note');
  const conflict = await db.collection('notebook_notes').updateOne({ _id: 'owner:note', revision: 0 }, { $set: { title: 'stale' } });
  assert.equal(conflict.modifiedCount, 0);
  assert.equal(f.table('firebase_mirror_outbox').size, 1);
  f.fail();
  await assert.rejects(db.collection('notebook_notes').updateOne({ _id: 'owner:note', revision: 1 },
    { $set: { title: 'should roll back', revision: 2 } }));
  assert.equal(f.table('notebook_notes').get('owner:note').title, 'secret note');
  assert.equal(f.table('firebase_mirror_outbox').size, 1);
  assert.equal([...f.table('firebase_mirror_counters').values()][0].sequence, 1);
});

test('unsupported deletes and implicit-ID writes fail before changing the mirrored record', async () => {
  const f = fixture(), db = createMirroredDatabase(f.db, { transaction: f.transaction, key });
  assert.throws(() => db.collection('user_profiles').deleteOne({ _id: 'owner' }));
  await assert.rejects(db.collection('user_profiles').insertOne({ name: 'missing ID' }));
  assert.equal(f.table('firebase_mirror_outbox').size, 0);
  assert.equal(mirroredCollections.has('auth_sessions'), false);
});

test('Firebase failure retains pending work; successful delivery acknowledges only after sink completes', async () => {
  const event = { _id: `${'a'.repeat(64)}:1`, entityId: 'a'.repeat(64), sequence: 1, state: 'pending', attempts: 0 };
  let update, sinkDone = false;
  const db = { collection() { return { async updateOne(q, patch) { update = patch.$set; if (update.state === 'delivered') assert.equal(sinkDone, true); } }; } };
  assert.deepEqual(await deliverMirrorEvent(db, event, async () => { throw new Error('quota'); }), { delivered: false });
  assert.equal(update.attempts, 1); assert.equal(update.state, undefined);
  assert.ok(update.nextAttemptAt instanceof Date);
  assert.deepEqual(await deliverMirrorEvent(db, event, async () => { sinkDone = true; }), { delivered: true });
  assert.equal(update.state, 'delivered');
});

test('Firestore backup transaction chunks ciphertext and never lets old/replayed events overwrite a newer version', async () => {
  const records = new Map(); let writes = 0;
  const ref = path => ({ path, collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`) });
  const firestore = { collection: name => ref(name), async runTransaction(work) {
    const staged = [];
    await work({ get: async r => ({ exists: records.has(r.path), data: () => records.get(r.path) }),
      set: (r, value) => staged.push([r.path, value]) });
    for (const [path, value] of staged) { records.set(path, value); writes++; }
  } };
  const sink = createFirestoreMirrorSink(firestore, 'noviq_staging');
  const entityId = 'b'.repeat(64), envelope = { ciphertext: 'x'.repeat(600000) };
  await sink({ _id: `${entityId}:2`, entityId, sequence: 2, envelope });
  const manifest = records.get(`mongoBackupNamespaces/noviq_staging/records/${entityId}`);
  assert.equal(manifest.sequence, 2); assert.equal(manifest.chunks, 3);
  assert.equal(writes, 4);
  await sink({ _id: `${entityId}:1`, entityId, sequence: 1, envelope });
  await sink({ _id: `${entityId}:2`, entityId, sequence: 2, envelope });
  assert.equal(writes, 4);
  assert.ok([...records.keys()].every(path => path.startsWith('mongoBackupNamespaces/')));
});

test('backup restore verification rejects lost, altered and duplicated chunks before returning private data', async () => {
  const f = fixture(), db = createMirroredDatabase(f.db, { transaction: f.transaction, key });
  await db.collection('notebook_notes').insertOne({ _id: 'owner:large', content: 'private'.repeat(80000), deleted: true });
  const event = [...f.table('firebase_mirror_outbox').values()][0], rows = new Map();
  const ref = path => ({ path, collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`) });
  await createFirestoreMirrorSink({ collection: name => ref(name), runTransaction: async work => work({
    get: async () => ({ exists: false }), set: (r, value) => rows.set(r.path, value),
  }) }, 'noviq_staging')(event);
  const manifest = rows.get(`mongoBackupNamespaces/noviq_staging/records/${event.entityId}`);
  const chunks = [...rows.entries()].filter(([path]) => path.includes('/chunks/')).map(([,row]) => row);
  const restored = verifyMirrorBackup(manifest, [...chunks].reverse(), key, event.entityId);
  assert.equal(restored.record.deleted, true);
  assert.equal(restored.record.content, 'private'.repeat(80000));
  assert.throws(() => verifyMirrorBackup(manifest, chunks.slice(1), key, event.entityId));
  assert.throws(() => verifyMirrorBackup(manifest, chunks.map((r,i) => i ? r : { ...r, ciphertextChunk: r.ciphertextChunk + 'x' }), key, event.entityId));
  assert.throws(() => verifyMirrorBackup(manifest, chunks.map((r,i) => i ? r : chunks[1]), key, event.entityId));
  assert.throws(() => verifyMirrorBackup(manifest, chunks, Buffer.alloc(32), event.entityId));
});

test('batched Firebase delivery reads all manifests before writes and retains the newest sequence',async()=>{
  const records=new Map();let writesStarted=false;
  const ref=path=>({path,collection:name=>ref(`${path}/${name}`),doc:id=>ref(`${path}/${id}`)});
  const sink=createFirestoreMirrorSink({collection:name=>ref(name),async runTransaction(work){
    writesStarted=false;const staged=[];
    await work({getAll:async(...refs)=>{assert.equal(writesStarted,false);return refs.map(r=>({exists:records.has(r.path),data:()=>records.get(r.path)}));},
      set:(r,value)=>{writesStarted=true;staged.push([r.path,value]);}});
    for(const [path,value]of staged)records.set(path,value);
  }},'noviq_staging');
  const events=['c','d'].map(id=>({entityId:id.repeat(64),_id:`${id.repeat(64)}:2`,sequence:2,envelope:{ciphertext:'encrypted'}}));
  await sink.batch(events);assert.equal(records.size,4);
  await sink.batch(events.map(e=>({...e,sequence:1,_id:`${e.entityId}:1`})));
  assert.equal(records.size,4);
  for(const event of events)assert.equal(records.get(`mongoBackupNamespaces/noviq_staging/records/${event.entityId}`).sequence,2);
  await assert.rejects(sink.batch([events[0],events[0]]));
});
