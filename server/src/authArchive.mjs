import { digest } from './migrationArchive.mjs';

export function prepareAuthArchive(snapshot, expectedProject) {
  if (snapshot?.version !== 1 || snapshot.kind !== 'firebase-auth' ||
      snapshot.project !== expectedProject || !Number.isFinite(Date.parse(snapshot.exportedAt)) ||
      !Array.isArray(snapshot.users) || snapshot.users.length > 20000 ||
      !snapshot.hashConfig?.signerKey || !snapshot.hashConfig?.algorithm) {
    throw new Error('Incomplete or unexpected Auth snapshot.');
  }
  const ids = new Set();
  for (const user of snapshot.users) {
    if (typeof user?.localId !== 'string' || !user.localId || ids.has(user.localId)) {
      throw new Error('Invalid or duplicate account ID.');
    }
    ids.add(user.localId);
  }
  const snapshotJson = JSON.stringify(snapshot);
  if (Buffer.byteLength(snapshotJson) > 8 * 1024 * 1024) throw new Error('Auth archive exceeds document budget.');
  return { _id: digest(snapshot), project: snapshot.project, exportedAt: snapshot.exportedAt,
    count: snapshot.users.length, snapshotJson };
}

export async function importAuthArchive(db, archive) {
  const collection = db.collection('migration_auth_snapshots');
  try { await collection.insertOne(archive); }
  catch (error) { if (error.code !== 11000) throw new Error('Auth archive insert failed.'); }
  const stored = await collection.findOne({ _id: archive._id });
  if (!stored || digest(stored) !== digest(archive)) throw new Error('Auth archive read-back mismatch.');
  return { snapshotId: archive._id, accountsArchived: archive.count, verified: true,
    sourceWrites: 0, applicationAccountsChanged: 0, authenticationCutover: false };
}
