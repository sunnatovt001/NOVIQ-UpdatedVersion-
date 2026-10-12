import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';
import { prepareArchive, importArchive } from '../src/migrationArchive.mjs';
const require = createRequire(import.meta.url);
const { decrypt } = require('../../scripts/local-backup.cjs');
let connection;
try {
  const filename = process.argv[2];
  if (!filename || !filename.endsWith('.noviq-backup')) throw new Error('Encrypted backup required.');
  const key = Buffer.from(fs.readFileSync(`${filename}.key`, 'utf8').trim(), 'hex');
  if (key.length !== 32) throw new Error('Invalid backup key.');
  const archive = prepareArchive(decrypt(fs.readFileSync(filename, 'utf8'), key));
  console.log(JSON.stringify({ mode: process.argv.includes('--execute') ? 'execute' : 'preview', documents: archive.manifest.count, snapshotId: archive.id }));
  if (process.argv.includes('--execute')) {
    const config = readDatabaseConfig();
    if (!config.database.endsWith('_staging')) throw new Error('Import restricted to an explicit staging database.');
    connection = createDatabaseConnection(config);
    console.log(JSON.stringify(await importArchive(await connection.getDatabase(), archive)));
  }
} catch {
  console.error('Archive import failed. Check the encrypted backup, staging configuration and access. No source records modified.');
  process.exitCode = 1;
} finally { if (connection) await connection.close(); }
