const fs = require('node:fs');
async function main() {
  const text = fs.readFileSync('functions/.env', 'utf8');
  const token = text.match(/^TELEGRAM_BOT_TOKEN\s*=\s*(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') || '';
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Bot not configured.');
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  if (!response.ok || !body.ok || !body.result?.is_bot) throw new Error('Bot verification failed.');
  console.log(JSON.stringify({ botUsername: body.result.username, tokenVerified: true, configurationChanged: false }));
}
main().catch(() => { console.error('Telegram bot check failed; token not printed.'); process.exitCode = 1; });
