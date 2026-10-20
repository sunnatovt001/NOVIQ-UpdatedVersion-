import backend from '../functions/vercel.cjs';

export function createTelegramHandler(getHandlers = backend.loadHandlers, env = process.env) {
 return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const isCron = req.query?.cron === '1' || req.query?.cron === 'true';

  // 1. Cron / Scheduled Notification Sweep (Vercel Cron or external scheduler)
  if (isCron) {
    const cronSecret = env.CRON_SECRET || '';
    const authHeader = req.headers['authorization'] || '';
    const isBearerValid = cronSecret && authHeader === `Bearer ${cronSecret}`;
    if (!cronSecret) return res.status(503).json({ error: 'Cron service is not configured.' });
    if (!isBearerValid) {
      res.status(401).json({ error: 'Unauthorized cron invocation.' });
      return;
    }

    try {
      const handlers = getHandlers();
      if (typeof handlers.runTelegramNotificationSweep === 'function') {
        const result = await handlers.runTelegramNotificationSweep();
        res.status(200).json({ ok: true, cron: true, ...result });
        return;
      }
      res.status(503).json({ error: 'Notification sweep is unavailable.' });
      return;
    } catch (error) {
      backend.logBackendError(error, 'telegram-cron');
      res.status(500).json({ error: 'Cron execution failed.' });
      return;
    }
  }

  // 2. Telegram Webhook Updates (Requires POST)
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!webhookSecret || !env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ error: 'Telegram service is not configured.' });
  }
  if (webhookSecret) {
    const receivedSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (receivedSecret !== webhookSecret) {
      res.status(401).json({ error: 'Unauthorized webhook secret.' });
      return;
    }
  }

  // Parse body if raw string/buffer
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(String(req.body));
    } catch {
      res.status(400).json({ error: 'Invalid JSON payload.' });
      return;
    }
  }

  req.header = req.header || ((key) => req.headers[key.toLowerCase()]);
  req.get = req.get || ((key) => req.headers[key.toLowerCase()]);

  try {
    const handlers = getHandlers();
    return await handlers.telegramWebhook(req, res);
  } catch (error) {
    backend.logBackendError(error, 'telegram-webhook');
    res.status(503).json({ error: 'Telegram webhook service temporarily unavailable.' });
  }
 };
}

export default createTelegramHandler();

