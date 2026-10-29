import fs from 'node:fs';
import { createRequire } from 'node:module';
import { prepareArchive } from '../src/migrationArchive.mjs';
const { decrypt } = createRequire(import.meta.url)('../../scripts/local-backup.cjs');
try {
  const file = process.argv[2];
  if (!file?.endsWith('.noviq-backup')) throw new Error();
  const snapshot = decrypt(fs.readFileSync(file, 'utf8'), Buffer.from(fs.readFileSync(`${file}.key`, 'utf8').trim(), 'hex'));
  const source = JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8'));
  if (snapshot.project !== source.projectId || snapshot.database !== source.firestoreDatabaseId) throw new Error();
  const archive = prepareArchive(snapshot), collections = {}, nativeTypes = {}, urls = new Set();
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [kind, data] of Object.entries(value)) {
      if (kind.endsWith('Value')) nativeTypes[kind] = (nativeTypes[kind] || 0) + 1;
      if (kind === 'stringValue' && typeof data === 'string' && /^(https:\/\/firebasestorage\.googleapis\.com\/|gs:\/\/)/.test(data)) urls.add(data);
      if (kind === 'mapValue') Object.values(data.fields || {}).forEach(inspect);
      if (kind === 'arrayValue') (data.values || []).forEach(inspect);
    }
  };
  for (const doc of snapshot.documents) {
    const pattern = doc.path.split('/').map((part, i) => i % 2 ? '{id}' : part).join('/');
    collections[pattern] = (collections[pattern] || 0) + 1;
    Object.values(doc.fields).forEach(inspect);
  }
  console.log(JSON.stringify({ snapshotId: archive.id, readTime: snapshot.readTime, documents: archive.manifest.count,
    collections, nativeTypes, uniqueStorageReferences: urls.size, sourceWrites: 0, applicationCutover: false }, null, 2));
} catch {
  console.error('Snapshot inspection failed. No private records or keys are printed.'); process.exitCode = 1;
}
