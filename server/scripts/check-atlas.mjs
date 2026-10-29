import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';

let connection;
try {
  connection = createDatabaseConnection(readDatabaseConfig());
  const db = await connection.getDatabase();
  await db.command({ ping: 1 }, { maxTimeMS: 5000 });
  console.log('Atlas connectivity verified. No records read or written.');
} catch (error) {
  const guidance = error?.code === 'ATLAS_AUTHENTICATION_FAILED'
    ? 'Atlas authentication failed. Verify that the database user was submitted and its password matches server/.env; URI-encode special password characters.'
    : error?.code === 'ATLAS_DNS_OR_NETWORK_FAILED'
      ? 'Atlas DNS/network connection failed. Check network access and DNS.'
      : 'Atlas check failed. Check server environment, database user and network access.';
  console.error(`${guidance} Credentials are not printed.`);
  process.exitCode = 1;
} finally {
  if (connection) await connection.close();
}
