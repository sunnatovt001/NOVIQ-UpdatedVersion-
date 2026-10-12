import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';

let connection;
try {
  connection = createDatabaseConnection(readDatabaseConfig());
  const db = await connection.getDatabase();
  await db.command({ ping: 1 }, { maxTimeMS: 5000 });
  console.log('Atlas connectivity verified. No records read or written.');
} catch {
  console.error('Atlas check failed. Check server environment, database user and network access. Credentials are not printed.');
  process.exitCode = 1;
} finally {
  if (connection) await connection.close();
}
