import { readSessionToken } from './authApi.mjs';
import { requireTrustedOrigin } from './sessions.mjs';
import {
  TelegramBotService,
  createLinkToken,
  unlinkTelegramUser,
  findUserByTelegramId,
  processTelegramUpdate,
  runAutomatedNotificationCycle,
} from './telegramBot.mjs';

async function readJson(request, maxBytes = 65536) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

export function createTelegramApi(db, sessions, options = {}) {
  const token = options.token || process.env.TELEGRAM_BOT_TOKEN || '';
  const botUsername = options.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'noviqq_bot';
  const webhookSecret = options.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const origin = options.origin;
  const fetchImpl = options.fetchImpl || fetch;

  const botService = new TelegramBotService({
    token,
    botUsername,
    webhookSecret,
    fetchImpl,
  });

  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    const send = (status, body) => {
      response.statusCode = status;
      response.end(JSON.stringify(body));
    };

    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;

    try {
      // 1. Telegram Webhook Endpoint
      // Verified via secret token header sent by Telegram servers
      if (path === '/api/telegram/webhook' || path === '/api/telegram') {
        if (request.method !== 'POST') return send(405, { error: 'Method not allowed. Use POST.' });

        if (webhookSecret) {
          const secretHeader = request.headers['x-telegram-bot-api-secret-token'];
          if (secretHeader !== webhookSecret) {
            return send(401, { error: 'Unauthorized webhook secret.' });
          }
        }

        const update = await readJson(request, 1024 * 1024);
        if (!update) return send(400, { error: 'Empty update payload.' });

        const result = await processTelegramUpdate(db, botService, update);
        return send(200, { ok: true, result });
      }

      // 2. Automated Notification Trigger (for Render / Vercel Cron or background worker)
      if (path === '/api/telegram/cron' && request.method === 'POST') {
        const cronSecret = process.env.CRON_SECRET || webhookSecret;
        if (cronSecret && request.headers['authorization'] !== `Bearer ${cronSecret}`) {
          return send(401, { error: 'Unauthorized cron invocation.' });
        }
        const outcome = await runAutomatedNotificationCycle(db, botService);
        return send(200, { ok: true, ...outcome });
      }

      // 3. User Authenticated Endpoints (requires session cookie & trusted origin)
      const sessionToken = readSessionToken(request.headers.cookie);
      const user = await sessions.resolve(sessionToken);

      if (path === '/api/telegram/status' && request.method === 'GET') {
        if (!user) return send(401, { error: 'Authentication required.' });
        const account = await db.collection('auth_accounts').findOne({ _id: user.uid });
        return send(200, {
          connected: Boolean(account?.telegramId),
          telegramId: account?.telegramId || null,
          telegramUsername: account?.telegramUsername || null,
          botUsername,
        });
      }

      // State mutations require POST & trusted origin
      if (request.method !== 'POST') return send(405, { error: 'Method not allowed.' });
      if (origin) {
        try {
          requireTrustedOrigin(request.headers.origin, origin);
        } catch {
          return send(403, { error: 'Untrusted request origin.' });
        }
      }

      if (!user) return send(401, { error: 'Authentication required.' });

      // Generate Link Token
      if (path === '/api/telegram/link-token') {
        const { token: linkToken, expiresAt } = await createLinkToken(db, user.uid);
        const deepLink = `https://t.me/${botUsername}?start=link_${linkToken}`;
        return send(200, {
          token: linkToken,
          botUsername,
          deepLink,
          expiresAt: expiresAt.toISOString(),
        });
      }

      // Disconnect Telegram
      if (path === '/api/telegram/disconnect') {
        await unlinkTelegramUser(db, user.uid);
        return send(200, { ok: true, disconnected: true });
      }

      return send(404, { error: 'Endpoint not found.' });
    } catch (error) {
      const status = error.status || 500;
      console.warn('[telegram-api-error]', error.message);
      return send(status, { error: error.message || 'Telegram service error.' });
    }
  };
}
