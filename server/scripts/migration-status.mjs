import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';
import { readFileSync } from 'node:fs';
import { verifyStoredArchive } from '../src/migrationArchive.mjs';
let connection;
try {
  const config = readDatabaseConfig();
  if (!config.database.endsWith('_staging')) throw new Error('Staging required.');
  connection = createDatabaseConnection(config);
  const db = await connection.getDatabase();
  const manifests = await db.collection('migration_manifests').find({}, {
    projection: { _id: 1, version: 1, project: 1, database: 1, contentHash: 1, count: 1, verified: 1, readTime: 1 },
  }).sort({ readTime: -1 }).limit(10).maxTimeMS(10000).toArray();
  const source = JSON.parse(readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8'));
  const latest = manifests[0] ? await verifyStoredArchive(db, manifests[0], {
    project: source.projectId, database: source.firestoreDatabaseId,
  }) : null;
  const accounts = await db.collection('auth_accounts').countDocuments({}, { maxTimeMS: 10000 });
  const hashSettings = await db.collection('auth_settings').findOne({ _id: 'legacy-firebase' }, {
    projection: { 'hashConfig.signerKey': 1, project: 1 }, maxTimeMS: 5000,
  });
  console.log(JSON.stringify({ archives: manifests.map(({ _id, count, readTime }) => ({ snapshotId: _id, count, readTime })),
    latestArchive: latest, accountsPresent: accounts,
    legacyPasswordConfigurationPresent: hashSettings?.project === source.projectId && Boolean(hashSettings?.hashConfig?.signerKey),
    currentSourceCompared: false, applicationCutover: false, filesMigrationVerified: false,
    sourceWrites: 0, destinationWrites: 0 }));
} catch {
  console.error('Migration status unavailable. Credentials and private documents are not printed.');
  process.exitCode = 1;
} finally { if (connection) await connection.close(); }
