import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';
const require = createRequire(import.meta.url);
const { decrypt } = require('../../scripts/local-backup.cjs');
const read = file => decrypt(fs.readFileSync(file, 'utf8'), Buffer.from(fs.readFileSync(`${file}.key`, 'utf8').trim(), 'hex'));
let connection;
try {
  const auth = read(process.argv[2]), snapshot = read(process.argv[3]);
  if (auth.kind !== 'firebase-auth' || auth.project !== snapshot.project) throw new Error('Source mismatch.');
  const adminEmail = process.env.MIGRATION_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) throw new Error('MIGRATION_ADMIN_EMAIL is required.');
  const account = auth.users.find(user => user.email?.toLowerCase() === adminEmail);
  const profile = account && snapshot.documents.find(doc => doc.path === `users/${account.localId}`);
  if (!account || account.disabled || profile?.fields?.isAdmin?.booleanValue !== true) throw new Error('Verified existing admin required.');
  const config = readDatabaseConfig();
  if (!config.database.endsWith('_staging')) throw new Error('Staging required.');
  connection = createDatabaseConnection(config);
  const collection = (await connection.getDatabase()).collection('auth_roles');
  const role = { _id: account.localId, isAdmin: true, source: 'verified-firebase-migration', sourceReadTime: snapshot.readTime };
  try { await collection.insertOne(role); }
  catch (error) { if (error.code !== 11000) throw error; }
  const saved = await collection.findOne({ _id: account.localId });
  if (saved?.isAdmin !== true || saved.source !== role.source || saved.sourceReadTime !== role.sourceReadTime) throw new Error('Role conflict.');
  console.log('Existing admin permission preserved and verified in staging. Source unchanged.');
} catch {
  console.error('Admin role migration failed; no source permissions changed.'); process.exitCode = 1;
} finally { if (connection) await connection.close(); }
