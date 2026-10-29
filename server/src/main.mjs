import http from 'node:http';
import { createDatabaseConnection, readDatabaseConfig } from './database.mjs';
import { createSessionService } from './sessions.mjs';
import { createAuthApi } from './authApi.mjs';
import { createAdminApi } from './adminApi.mjs';
import { createTelegramApi } from './telegramApi.mjs';
import { TelegramBotService, runAutomatedNotificationCycle } from './telegramBot.mjs';
import { createStaticFrontend } from './staticFrontend.mjs';
import { createNotebookApi } from './notebookApi.mjs';
import { createPlannerApi } from './plannerApi.mjs';
import { createProfileApi } from './profileApi.mjs';
import { createFlashcardsApi } from './flashcardsApi.mjs';
import { createMirroredDatabase, readMirrorKey } from './firebaseMirror.mjs';
import { fileURLToPath } from 'node:url';
const origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
if (!origin || new URL(origin).origin !== origin) throw new Error('Explicit APP_ORIGIN required.');
const connection = createDatabaseConnection(readDatabaseConfig());
const rawDb = await connection.getDatabase();
const db = process.env.NOVIQ_FIREBASE_MIRROR === 'true'
  ? createMirroredDatabase(rawDb, { transaction: work => connection.transaction(work),
    key: readMirrorKey(process.env.FIREBASE_MIRROR_ENCRYPTION_KEY) }) : rawDb;
const sessions = createSessionService(db);
await sessions.ensureIndexes();
await db.collection('auth_login_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
await db.collection('auth_telegram_proofs').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
await db.collection('telegram_link_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
await db.collection('telegram_processed_updates').createIndex({ processedAt: 1 }, { expireAfterSeconds: 604800 });
await db.collection('telegram_notifications').createIndex({ sentAt: 1 }, { expireAfterSeconds: 2592000 });
const auth = createAuthApi(db, sessions, { origin, firebaseIdentityEnabled: process.env.NOVIQ_FIREBASE_IDENTITY === 'true', telegramToken: process.env.TELEGRAM_BOT_TOKEN || '', telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || '' }), admin = createAdminApi(db, sessions);
const telegram = createTelegramApi(db, sessions, { origin, token: process.env.TELEGRAM_BOT_TOKEN || '', botUsername: process.env.TELEGRAM_BOT_USERNAME || 'noviqq_bot', webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '' });
const frontend = createStaticFrontend(fileURLToPath(new URL('../../dist/', import.meta.url)));
// Opt-in until the current source snapshot and frontend transport are verified.
const notebook = process.env.NOVIQ_MONGO_NOTEBOOK_API === 'true' ? createNotebookApi(db, sessions, { origin }) : null;
if (notebook) await db.collection('notebook_notes').createIndex({ userId: 1, deleted: 1, id: 1 });
const planner = process.env.NOVIQ_MONGO_PLANNER_API === 'true' ? createPlannerApi(db, sessions, { origin }) : null;
const profile = process.env.NOVIQ_MONGO_PROFILE_API === 'true' ? createProfileApi(db,sessions,{origin}) : null;
const flashcards = process.env.NOVIQ_MONGO_FLASHCARDS_API === 'true' ? createFlashcardsApi(db,sessions,{origin}) : null;
if(flashcards) await db.collection('flashcard_records').createIndex({userId:1,kind:1,parentId:1,deleted:1,id:1});

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
  if (notebook && path.startsWith('/api/notebook/')) return void notebook(request, response);
  if (planner && path.startsWith('/api/planner/')) return void planner(request, response);
  if (profile && (path === '/api/profile' || path.startsWith('/api/profile/'))) return void profile(request,response);
  if (flashcards && path.startsWith('/api/flashcards/')) return void flashcards(request,response);
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
