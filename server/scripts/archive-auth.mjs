import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';
import { prepareAuthArchive, importAuthArchive } from '../src/authArchive.mjs';
const { decrypt } = createRequire(import.meta.url)('../../scripts/local-backup.cjs');
let connection;
try {
  const file = process.argv[2];
  if (!file?.endsWith('.noviq-auth')) throw new Error('Encrypted Auth export required.');
  const key = Buffer.from(fs.readFileSync(`${file}.key`, 'utf8').trim(), 'hex');
  if (key.length !== 32) throw new Error('Invalid key.');
  const source = JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8'));
  const archive = prepareAuthArchive(decrypt(fs.readFileSync(file, 'utf8'), key), source.projectId);
  if (!process.argv.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'preview', accounts: archive.count, snapshotId: archive._id }));
  } else {
    const config = readDatabaseConfig();
    if (!config.database.endsWith('_staging')) throw new Error('Staging required.');
    connection = createDatabaseConnection(config);
    console.log(JSON.stringify(await importAuthArchive(await connection.getDatabase(), archive)));
  }
} catch {
  console.error('Auth snapshot archival failed. Private account data and keys are not printed.');
  process.exitCode = 1;
} finally { if (connection) await connection.close(); }
