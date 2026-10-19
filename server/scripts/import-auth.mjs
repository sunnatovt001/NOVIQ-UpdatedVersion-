import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';
const { decrypt, hash } = createRequire(import.meta.url)('../../scripts/local-backup.cjs');
let connection;
try {
  const file = process.argv[2];
  if (!file?.endsWith('.noviq-auth')) throw new Error('Encrypted Auth export required.');
  const snapshot = decrypt(fs.readFileSync(file, 'utf8'), Buffer.from(fs.readFileSync(`${file}.key`, 'utf8').trim(), 'hex'));
  if (snapshot.kind !== 'firebase-auth' || !Array.isArray(snapshot.users) || snapshot.users.length > 20000 || !snapshot.hashConfig?.signerKey) throw new Error('Incomplete Auth export.');
  const ids = new Set(), emails = new Set();
  const rows = snapshot.users.map(user => {
    if (typeof user.localId !== 'string' || !user.localId || ids.has(user.localId)) throw new Error('Duplicate UID.');
    ids.add(user.localId);
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : undefined;
    if (email && emails.has(email)) throw new Error('Duplicate normalized email.');
    if (email) emails.add(email);
    return { _id: user.localId, ...(email ? { email } : {}), displayName: user.displayName || '',
      emailVerified: user.emailVerified === true, disabled: user.disabled === true,
      passwordHash: user.passwordHash || '', salt: user.salt || '',
      mfaRequired: !!user.mfaInfo?.length, providers: user.providerUserInfo || [], sourceProject: snapshot.project };
  });
  const config = readDatabaseConfig();
  if (!config.database.endsWith('_staging')) throw new Error('Staging required.');
  connection = createDatabaseConnection(config);
  const db = await connection.getDatabase(), accounts = db.collection('auth_accounts');
  await accounts.createIndex({ email: 1 }, { unique: true, sparse: true });
  for (const row of rows) {
    try { await accounts.insertOne(row); } catch (error) { if (error.code !== 11000) throw error; }
    if (hash(await accounts.findOne({ _id: row._id })) !== hash(row)) throw new Error('Account conflict.');
  }
  const settings = { _id: 'legacy-firebase', project: snapshot.project, hashConfig: snapshot.hashConfig };
  try { await db.collection('auth_settings').insertOne(settings); } catch (error) { if (error.code !== 11000) throw error; }
  if (hash(await db.collection('auth_settings').findOne({ _id: settings._id })) !== hash(settings)) throw new Error('Configuration conflict.');
  console.log(JSON.stringify({ accountsVerified: rows.length, sourceWrites: 0, frontendCutover: false }));
} catch {
  console.error('Auth staging import failed or conflicted. Source unchanged; credentials not printed.'); process.exitCode = 1;
} finally { if (connection) await connection.close(); }
