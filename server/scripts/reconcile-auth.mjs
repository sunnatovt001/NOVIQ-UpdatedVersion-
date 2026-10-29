import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';
import { prepareAuthAccounts, reconcileAuthAccounts } from '../src/reconcileAuth.mjs';
const { decrypt } = createRequire(import.meta.url)('../../scripts/local-backup.cjs');
let connection;
try {
  const file = process.argv[2];
  if (!file?.endsWith('.noviq-auth')) throw new Error();
  const source = JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json',import.meta.url),'utf8'));
  const snapshot = decrypt(fs.readFileSync(file,'utf8'),Buffer.from(fs.readFileSync(`${file}.key`,'utf8').trim(),'hex'));
  const prepared = prepareAuthAccounts(snapshot,source.projectId);
  if (!process.argv.includes('--execute')) console.log(JSON.stringify({ mode:'preview',accounts:prepared.accounts.length,snapshotId:prepared.snapshotId }));
  else {
    const config = readDatabaseConfig();
    if (!config.database.endsWith('_staging')) throw new Error();
    connection = createDatabaseConnection(config);
    const db = await connection.getDatabase();
    await db.collection('auth_accounts').createIndex({ email:1 },{ unique:true,sparse:true });
    console.log(JSON.stringify(await reconcileAuthAccounts(db,prepared,work=>connection.transaction(work))));
  }
} catch {
  console.error('Auth reconciliation stopped. Check identity conflicts or transaction access. No Firebase accounts changed; private credentials are not printed.');
  process.exitCode=1;
} finally { if(connection)await connection.close(); }
