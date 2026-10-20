import backend from '../functions/vercel.cjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const isCron = req.query?.cron === '1' || req.query?.cron === 'true' || Boolean(req.headers['x-vercel-cron']);

  // 1. Cron / Scheduled Notification Sweep (Vercel Cron or external scheduler)
  if (isCron) {
    const cronSecret = process.env.CRON_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';
    const authHeader = req.headers['authorization'] || '';
    const isVercelCron = Boolean(req.headers['x-vercel-cron']);
    const isBearerValid = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isSecretTokenValid = cronSecret && req.headers['x-telegram-bot-api-secret-token'] === cronSecret;

    if (cronSecret && !isVercelCron && !isBearerValid && !isSecretTokenValid) {
      res.status(401).json({ error: 'Unauthorized cron invocation.' });
      return;
    }

    try {
      const handlers = backend.loadHandlers();
      if (typeof handlers.runTelegramNotificationSweep === 'function') {
        const result = await handlers.runTelegramNotificationSweep();
        res.status(200).json({ ok: true, cron: true, ...result });
        return;
      }
      res.status(200).json({ ok: true, cron: true, message: 'Notification sweep completed.' });
      return;
    } catch (error) {
      console.error('[telegram-cron-error]', error);
      res.status(500).json({ error: 'Cron execution failed.' });
      return;
    }
  }

  // 2. Telegram Webhook Updates (Requires POST)
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
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
    const handlers = backend.loadHandlers();
    return await handlers.telegramWebhook(req, res);
  } catch (error) {
    console.error('[telegram-vercel-webhook-error]', error);
    res.status(503).json({ error: 'Telegram webhook service temporarily unavailable.' });
  }
}

