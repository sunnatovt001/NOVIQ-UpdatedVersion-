import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';

test('requires explicit server configuration and rejects placeholders', () => {
  for (const env of [{}, { MONGODB_URI: 'https://example.com', MONGODB_DATABASE: 'noviq' },
    { MONGODB_URI: 'mongodb+srv://REPLACE_USER@cluster/', MONGODB_DATABASE: 'noviq' },
    { MONGODB_URI: 'mongodb+srv://user:<db_password>@cluster/', MONGODB_DATABASE: 'noviq' },
    { MONGODB_URI: 'mongodb://localhost', MONGODB_DATABASE: '../noviq' }]) {
    assert.throws(() => readDatabaseConfig(env));
  }
  assert.equal(readDatabaseConfig({ MONGODB_URI: 'mongodb://localhost:27017', MONGODB_DATABASE: 'noviq_staging' }).database, 'noviq_staging');
});

test('authentication errors retain only a safe category, never the credential-bearing cause', async () => {
  class Client {
    async connect() { throw Object.assign(new Error('bad auth secret-password mongodb+srv://private'), { code: 8000 }); }
    async close() {}
  }
  const connection = createDatabaseConnection({ uri: 'mongodb://localhost', database: 'test_db' }, Client);
  await assert.rejects(connection.getDatabase(), error => {
    assert.equal(error.code, 'ATLAS_AUTHENTICATION_FAILED');
    assert.equal(error.cause, undefined);
    assert.equal(error.message.includes('secret-password'), false);
    return true;
  });
  await connection.close();
});

test('concurrent callers reuse one connection and explicit database', async () => {
  let connects = 0;
  let closes = 0;
  class Client {
    constructor(uri, options) { assert.equal(options.maxPoolSize, 10); }
    async connect() { connects++; await new Promise(resolve => setTimeout(resolve, 5)); }
    db(name) { return name; }
    async close() { closes++; }
  }
  const connection = createDatabaseConnection({ uri: 'mongodb://localhost', database: 'test_db' }, Client);
  assert.deepEqual(await Promise.all([connection.getDatabase(), connection.getDatabase()]), ['test_db', 'test_db']);
  assert.equal(connects, 1);
  await connection.close();
  assert.equal(closes, 1);
});

test('failed connection is retryable and does not disclose driver credentials', async () => {
  let attempts = 0;
  class Client {
    async connect() { if (++attempts === 1) throw new Error('secret-password'); }
    db() { return 'connected'; }
    async close() {}
  }
  const connection = createDatabaseConnection({ uri: 'mongodb://localhost', database: 'test_db' }, Client);
  await assert.rejects(connection.getDatabase(), error => !error.message.includes('secret-password'));
  assert.equal(await connection.getDatabase(), 'connected');
  await connection.close();
});
