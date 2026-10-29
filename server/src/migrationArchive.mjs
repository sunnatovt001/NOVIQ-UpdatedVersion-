import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// Keep native Firestore REST values intact: do not round integers/timestamps.
export function prepareArchive(snapshot) {
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.documents) ||
      typeof snapshot.project !== 'string' || typeof snapshot.database !== 'string' ||
      !Number.isFinite(Date.parse(snapshot.readTime)) || snapshot.documents.length > 20000) {
    throw new Error('Invalid or oversized snapshot.');
  }
  const paths = new Set();
  const documents = snapshot.documents.map(doc => {
    const parts = typeof doc.path === 'string' ? doc.path.split('/') : [];
    if (parts.length < 2 || parts.length % 2 || parts.some(part => !part || part === '.' || part === '..') ||
        paths.has(doc.path) || !doc.fields || Array.isArray(doc.fields) || typeof doc.fields !== 'object') {
      throw new Error('Invalid or duplicate document path.');
    }
    paths.add(doc.path);
    return { path: doc.path, fieldsJson: JSON.stringify(doc.fields), hash: digest(doc.fields) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { version: 1, project: snapshot.project, database: snapshot.database,
    readTime: snapshot.readTime, count: documents.length,
    contentHash: digest(documents.map(({ path, hash }) => ({ path, hash }))) };
  return { manifest, documents, id: digest(manifest) };
}

export async function importArchive(db, archive) {
  // Archive is separate from application collections, insert-only and retryable.
  const collection = db.collection('migration_documents');
  if (typeof collection.bulkWrite === 'function') {
    // Batch network round trips, but keep records insert-only and verify every
    // stored byte before publishing the complete manifest. Bounded below Mongo's
    // request limit even for large native Firestore string/map values.
    for (let offset = 0; offset < archive.documents.length;) {
      const rows = []; let bytes = 0;
      while (offset < archive.documents.length && rows.length < 100) {
        const doc = archive.documents[offset], size = Buffer.byteLength(JSON.stringify(doc)) + 300;
        if (size > 8 * 1024 * 1024) throw new Error('Archive document exceeds import budget.');
        if (rows.length && bytes + size > 8 * 1024 * 1024) break;
        rows.push({ _id: `${archive.id}:${doc.path}`, snapshotId: archive.id, ...doc });
        bytes += size; offset++;
      }
      await collection.bulkWrite(rows.map(row => ({ updateOne: { filter: { _id: row._id },
        update: { $setOnInsert: row }, upsert: true } })), { ordered: false, writeConcern: { w: 'majority' } });
      const stored = await collection.find({ _id: { $in: rows.map(row => row._id) } })
        .limit(rows.length + 1).maxTimeMS(10000).toArray();
      const byId = new Map(stored.map(row => [row._id, row]));
      if (stored.length !== rows.length || rows.some(row => digest(byId.get(row._id)) !== digest(row))) {
        throw new Error('Archive mismatch; refusing to declare migration verified.');
      }
    }
  } else {
  for (let offset = 0; offset < archive.documents.length; offset += 8) {
    await Promise.all(archive.documents.slice(offset, offset + 8).map(async doc => {
    const row = { _id: `${archive.id}:${doc.path}`, snapshotId: archive.id, ...doc };
    try { await collection.insertOne(row); }
    catch (error) { if (error.code !== 11000) throw new Error('Archive write failed; source is unchanged.'); }
    const stored = await collection.findOne({ _id: row._id });
    if (!stored || stored.path !== row.path || stored.fieldsJson !== row.fieldsJson || stored.hash !== row.hash) {
      throw new Error('Archive mismatch; refusing to declare migration verified.');
    }
    }));
  }
  }
  if (await collection.countDocuments({ snapshotId: archive.id }) !== archive.manifest.count) {
    throw new Error('Archive count mismatch.');
  }
  const receipt = { _id: archive.id, ...archive.manifest, verified: true };
  try { await db.collection('migration_manifests').insertOne(receipt); }
  catch (error) { if (error.code !== 11000) throw new Error('Manifest write failed.'); }
  const existing = await db.collection('migration_manifests').findOne({ _id: archive.id });
  if (digest(existing) !== digest(receipt)) throw new Error('Manifest mismatch.');
  return { snapshotId: archive.id, documents: archive.manifest.count, verified: true, sourceWrites: 0 };
}

// Read-only verification: a stored 'verified' flag alone is not proof that the
// archive still matches its manifest. Never return private document contents.
export async function verifyStoredArchive(db, manifest, expectedSource) {
  if (!manifest || manifest.version !== 1 || manifest.verified !== true ||
      !Number.isInteger(manifest.count) || manifest.count < 0 || manifest.count > 20000 ||
      manifest.project !== expectedSource.project || manifest.database !== expectedSource.database) {
    throw new Error('Missing, invalid or unexpected source manifest.');
  }
  const rows = await db.collection('migration_documents').find({ snapshotId: manifest._id })
    .limit(manifest.count + 1).maxTimeMS(10000).toArray();
  if (rows.length !== manifest.count) throw new Error('Archive count mismatch.');
  const documents = rows.map(row => {
    let fields;
    try { fields = JSON.parse(row.fieldsJson); } catch { throw new Error('Invalid archived fields.'); }
    if (row._id !== `${manifest._id}:${row.path}` || digest(fields) !== row.hash) {
      throw new Error('Archive document integrity mismatch.');
    }
    return { path: row.path, fields };
  });
  const rebuilt = prepareArchive({ version: 1, project: manifest.project,
    database: manifest.database, readTime: manifest.readTime, documents });
  if (rebuilt.id !== manifest._id || rebuilt.manifest.contentHash !== manifest.contentHash) {
    throw new Error('Archive manifest integrity mismatch.');
  }
  return { snapshotId: rebuilt.id, documents: rows.length, readTime: manifest.readTime,
    integrityVerified: true, currentSourceCompared: false, sourceWrites: 0, destinationWrites: 0 };
}
