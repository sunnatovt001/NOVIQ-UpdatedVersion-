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
