import http from 'node:http';
import { createDatabaseConnection, readDatabaseConfig } from './database.mjs';
import { createSessionService } from './sessions.mjs';
import { createAuthApi } from './authApi.mjs';
import { createAdminApi } from './adminApi.mjs';
const origin = process.env.APP_ORIGIN;
if (!origin || new URL(origin).origin !== origin) throw new Error('Explicit APP_ORIGIN required.');
const connection = createDatabaseConnection(readDatabaseConfig());
const db = await connection.getDatabase(), sessions = createSessionService(db);
await sessions.ensureIndexes();
await db.collection('auth_login_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const auth = createAuthApi(db, sessions, { origin }), admin = createAdminApi(db, sessions);
const server = http.createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/health' && request.method === 'GET') {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    void db.command({ ping: 1 }, { maxTimeMS: 3000 }).then(() => {
      response.end(JSON.stringify({ ok: true }));
    }).catch(() => { response.statusCode = 503; response.end(JSON.stringify({ ok: false })); });
    return;
  }
  if (path.startsWith('/api/auth/')) return void auth(request, response);
  if (path.startsWith('/api/admin/')) return void admin(request, response);
  response.statusCode = 404; response.end('Not found');
});
server.requestTimeout = 15000; server.headersTimeout = 10000;
const host = process.env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1';
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid server port.');
server.listen(port, host, () => console.log('NOVIQ API listening.'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(async () => { await connection.close(); process.exit(0); });
});
