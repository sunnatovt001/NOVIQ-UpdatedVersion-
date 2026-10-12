import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';
let connection;
try {
  const config = readDatabaseConfig();
  if (!config.database.endsWith('_staging')) throw new Error('Staging required.');
  connection = createDatabaseConnection(config);
  const db = await connection.getDatabase();
  const manifests = await db.collection('migration_manifests').find({}, {
    projection: { _id: 1, count: 1, verified: 1, readTime: 1 },
  }).limit(10).toArray();
  console.log(JSON.stringify({ archives: manifests, applicationCutover: false, authMigrated: false, filesMigrated: false }));
} catch {
  console.error('Migration status unavailable. Credentials and private documents are not printed.');
  process.exitCode = 1;
} finally { if (connection) await connection.close(); }
