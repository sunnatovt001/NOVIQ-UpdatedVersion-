// Owner-authorized migration export. Never print accounts or password hashes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { encrypt, decrypt, hash } = require('./local-backup.cjs');
async function main() {
  const { config, cli, db } = await require('./cloud-client.cjs')(process.argv[2]);
  await db.terminate();
  const users = [];
  const result = await require(path.join(cli, 'lib/accountExporter.js')).serialExportUsers(config.projectId, {
    batchSize: 1000,
    writeUsersToFile(batch) {
      if (users.length + batch.length > 20000) throw new Error('Auth export exceeds safety budget.');
      users.push(...batch);
    },
  });
  if (result instanceof Error) throw new Error('Incomplete Auth export.');
  if (users.some(user => !user.localId) || new Set(users.map(user => user.localId)).size !== users.length) {
    throw new Error('Invalid Auth export.');
  }
  const { Client } = require(path.join(cli, 'lib/apiv2.js'));
  const api = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true });
  let hashConfig;
  try {
    const response = await api.get(`/admin/v2/projects/${config.projectId}/config`, { skipLog: { resBody: true } });
    hashConfig = response.body?.signIn?.hashConfig;
  } catch { /* Keep accounts recoverable even if hash-config permission is absent. */ }
  const hashParametersExported = !!hashConfig?.signerKey && !!hashConfig?.algorithm;
  const snapshot = { version: 1, kind: 'firebase-auth', project: config.projectId, exportedAt: new Date().toISOString(), users, ...(hashParametersExported ? { hashConfig } : {}) };
  const key = crypto.randomBytes(32), envelope = encrypt(snapshot, key);
  if (hash(decrypt(envelope, key)) !== hash(snapshot)) throw new Error('Encrypted Auth verification failed.');
  const directory = path.resolve('backups/cloud');
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `auth-${Date.now()}.noviq-auth`);
  fs.writeFileSync(`${filename}.key`, key.toString('hex'), { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(filename, envelope, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ file: path.relative(process.cwd(), filename), accounts: users.length,
    passwordHashesPresent: users.filter(user => !!user.passwordHash).length,
    encrypted: true, encryptionRoundTripVerified: true, sourceWrites: 0,
    hashParametersExported, authenticationCutover: false }));
}
main().catch(() => { console.error('Encrypted Auth export failed. No account details printed or source accounts modified.'); process.exitCode = 1; });
