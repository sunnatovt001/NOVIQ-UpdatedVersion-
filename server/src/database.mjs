import { MongoClient } from 'mongodb';

export function readDatabaseConfig(env = process.env) {
  const uri = env.MONGODB_URI;
  const database = env.MONGODB_DATABASE;
  if (typeof uri !== 'string' || !/^mongodb(?:\+srv)?:\/\//.test(uri) || /REPLACE_|placeholder/i.test(uri)) {
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
        connecting = client.connect().catch(() => {
          connecting = undefined;
          // Driver errors can contain connection details; keep them out of logs.
          throw new Error('MongoDB connection failed. Check server configuration and Atlas access.');
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
  };
}
