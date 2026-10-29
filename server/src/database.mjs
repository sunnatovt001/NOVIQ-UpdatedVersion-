import { MongoClient } from 'mongodb';

export function readDatabaseConfig(env = process.env) {
  const uri = env.MONGODB_URI;
  const database = env.MONGODB_DATABASE;
  if (typeof uri !== 'string' || !/^mongodb(?:\+srv)?:\/\//.test(uri) || /REPLACE_|placeholder|<db_password>/i.test(uri)) {
    throw new Error('Configure a server-only MONGODB_URI.');
  }
  if (typeof database !== 'string' || !/^[a-zA-Z0-9_-]{1,63}$/.test(database)) {
    throw new Error('Configure an explicit MONGODB_DATABASE.');
  }
  return { uri, database };
}

// One pool per backend instance, not one connection per HTTP request.
export function createDatabaseConnection(config, Client = MongoClient) {
  const client = new Client(config.uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 10000,
    waitQueueTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  let connecting;
  return {
    async getDatabase() {
      if (!connecting) {
        connecting = client.connect().catch(error => {
          connecting = undefined;
          // Driver errors can contain connection details; keep them out of logs.
          const code = error?.code === 18 || (error?.code === 8000 && /auth/i.test(String(error?.message || '')))
            ? 'ATLAS_AUTHENTICATION_FAILED'
            : ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(error?.code)
              ? 'ATLAS_DNS_OR_NETWORK_FAILED' : 'ATLAS_CONNECTION_FAILED';
          throw Object.assign(new Error('MongoDB connection failed. Check server configuration and Atlas access.'), { code });
        });
      }
      await connecting;
      return client.db(config.database);
    },
    async close() {
      if (connecting) await connecting.catch(() => {});
      await client.close();
      connecting = undefined;
    },
    async transaction(work) {
      if (!connecting) throw new Error('Connect before starting a transaction.');
      await connecting;
      const session = client.startSession();
      try {
        return await session.withTransaction(() => work(session), {
          readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
          maxCommitTimeMS: 10000,
        });
      } finally { await session.endSession(); }
    },
  };
}
