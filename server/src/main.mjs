import http from 'node:http';
import { createDatabaseConnection, readDatabaseConfig } from './database.mjs';
import { createSessionService } from './sessions.mjs';
import { createAuthApi } from './authApi.mjs';
import { createAdminApi } from './adminApi.mjs';
import { createTelegramApi } from './telegramApi.mjs';
import { TelegramBotService, runAutomatedNotificationCycle } from './telegramBot.mjs';
import { createStaticFrontend } from './staticFrontend.mjs';
import { fileURLToPath } from 'node:url';
const origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
if (!origin || new URL(origin).origin !== origin) throw new Error('Explicit APP_ORIGIN required.');
const connection = createDatabaseConnection(readDatabaseConfig());
const db = await connection.getDatabase(), sessions = createSessionService(db);
await sessions.ensureIndexes();
await db.collection('auth_login_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
await db.collection('auth_telegram_proofs').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
await db.collection('telegram_link_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
await db.collection('telegram_processed_updates').createIndex({ processedAt: 1 }, { expireAfterSeconds: 604800 });
await db.collection('telegram_notifications').createIndex({ sentAt: 1 }, { expireAfterSeconds: 2592000 });
const auth = createAuthApi(db, sessions, { origin, telegramToken: process.env.TELEGRAM_BOT_TOKEN || '', telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || '' }), admin = createAdminApi(db, sessions);
const telegram = createTelegramApi(db, sessions, { origin, token: process.env.TELEGRAM_BOT_TOKEN || '', botUsername: process.env.TELEGRAM_BOT_USERNAME || 'noviqq_bot', webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '' });
const frontend = createStaticFrontend(fileURLToPath(new URL('../../dist/', import.meta.url)));

// Periodic automated notifications (runs every 15 minutes if bot token is configured)
let notificationInterval;
if (process.env.TELEGRAM_BOT_TOKEN) {
  const botService = new TelegramBotService({
    token: process.env.TELEGRAM_BOT_TOKEN,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'noviqq_bot',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  });
  notificationInterval = setInterval(() => {
    runAutomatedNotificationCycle(db, botService).catch((err) => {
      console.warn('[telegram-scheduler-error]', err.message);
    });
  }, 15 * 60 * 1000);
}

const server = http.createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/health' && request.method === 'GET') {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    void db.command({ ping: 1 }, { maxTimeMS: 3000 }).then(() => {
      response.end(JSON.stringify({ ok: true, telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN) }));
    }).catch(() => { response.statusCode = 503; response.end(JSON.stringify({ ok: false })); });
    return;
  }
  if (path.startsWith('/api/auth/')) return void auth(request, response);
  if (path.startsWith('/api/admin/')) return void admin(request, response);
  if (path.startsWith('/api/telegram/') || path === '/api/telegram') return void telegram(request, response);
  if (path.startsWith('/api/')) { response.statusCode = 404; response.end('Not found'); return; }
  return void frontend(request, response);
});
server.requestTimeout = 15000; server.headersTimeout = 10000;
const host = process.env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1';
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid server port.');
server.listen(port, host, () => console.log('NOVIQ API listening.'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  if (notificationInterval) clearInterval(notificationInterval);
  server.close(async () => { await connection.close(); process.exit(0); });
});
