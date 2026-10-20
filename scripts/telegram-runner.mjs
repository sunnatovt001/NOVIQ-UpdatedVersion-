// Standalone Telegram Bot Runner & Connectivity Diagnostic
// Reuses the official NOVIQ bot engine from server/src/telegramBot.mjs

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

// CRITICAL FIX: Force IPv4-first resolution to prevent IPv6 blackhole timeouts
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import {
  TelegramBotService,
  processTelegramUpdate,
  DEFAULT_TIMEZONE,
} from '../server/src/telegramBot.mjs';
import { getAppUrl } from '../server/src/appUrl.mjs';
import { getLocalDb } from '../server/src/localDb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Helper to load env files safely without overriding existing process.env
function loadEnvFile(relPath) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key] && val) {
        process.env[key] = val;
      }
    }
  }
}

loadEnvFile('.env');
loadEnvFile('server/.env');
loadEnvFile('functions/.env');

// Parse CLI arguments
const args = process.argv.slice(2);
let cliToken = '';
let deleteWebhookRequested = false;
let mode = 'diagnose'; // 'diagnose', 'poll', 'webhook-info'

for (const arg of args) {
  if (arg.startsWith('--token=')) cliToken = arg.slice('--token='.length).trim();
  else if (arg === '--poll' || arg === '--polling') mode = 'poll';
  else if (arg === '--diagnose') mode = 'diagnose';
  else if (arg === '--delete-webhook') deleteWebhookRequested = true;
}

const botToken = cliToken || process.env.TELEGRAM_BOT_TOKEN || '';
const botUsername = process.env.VITE_TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'noviqq_bot';
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

console.log('====================================================');
console.log('🤖 NOVIQ Telegram Bot Runner & Connectivity Tool');
console.log('====================================================\n');

if (!botToken) {
  console.error('❌ ERROR: TELEGRAM_BOT_TOKEN is not configured!\n');
  console.log('To run diagnostics or start the bot, provide your BotFather token in any of these ways:');
  console.log('  1. Add to .env or server/.env: TELEGRAM_BOT_TOKEN="your_token_here"');
  console.log('  2. Pass as CLI flag: node scripts/telegram-runner.mjs --token="your_token_here"');
  console.log('  3. In PowerShell: $env:TELEGRAM_BOT_TOKEN="your_token_here"; node scripts/telegram-runner.mjs\n');
  process.exit(1);
}

// Display safe redacted token info (NEVER print the secret)
const prefix = botToken.split(':')[0] || 'unknown';
console.log(`🔑 Token Status: Configured (Bot ID Prefix: ${prefix}, Length: ${botToken.length}) [TOKEN SECRET REDACTED]`);
console.log(`🌐 Website URL: ${getAppUrl()} (Mode: ${process.env.NODE_ENV === 'production' ? 'Production' : 'Local Development'})\n`);

// Check if token format is valid
if (!/^\d{8,11}:[A-Za-z0-9_-]{30,50}$/.test(botToken)) {
  console.warn('⚠️ WARNING: The provided token does not match standard Telegram Bot token format (e.g. 123456789:ABCdef...).');
}

const LOCK_FILE = path.join(rootDir, 'node_modules/.cache/noviq-telegram/bot-runner.pid');

function acquireLock() {
  try {
    const dir = path.dirname(LOCK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(LOCK_FILE)) {
      const oldPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (oldPid && oldPid !== process.pid) {
        let isAlive = false;
        try {
          process.kill(oldPid, 0);
          isAlive = true;
        } catch {
          isAlive = false;
        }

        if (isAlive) {
          console.log(`⚠️ Existing bot runner detected (PID ${oldPid}). Stopping old instance to prevent getUpdates conflict...`);
          try {
            process.kill(oldPid, 'SIGTERM');
          } catch {
            // ignore
          }
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  } catch (err) {
    console.warn('⚠️ Could not write lockfile:', err.message);
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch {
    // ignore
  }
}

const botService = new TelegramBotService({
  token: botToken,
  botUsername,
  webhookSecret,
});

async function checkNetworkConnectivity() {
  console.log('\n🌐 STEP 0: Testing Network Connectivity to api.telegram.org...');

  // 1. DNS Resolution
  let addresses = [];
  try {
    addresses = await dns.promises.resolve4('api.telegram.org');
    console.log(`  ✅ DNS IPv4: Resolved api.telegram.org -> ${addresses.join(', ')}`);
  } catch (err) {
    console.warn(`  ⚠️ DNS IPv4 lookup failed: ${err.message}`);
  }

  // 2. TCP Port 443 Check
  const testHost = addresses[0] || '149.154.167.220';
  const tcpPromise = new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(6000);
    socket.on('connect', () => {
      socket.destroy();
      resolve({ ok: true });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: 'Connection timed out (6000ms)' });
    });
    socket.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
    socket.connect(443, testHost);
  });

  const tcpResult = await tcpPromise;
  if (tcpResult.ok) {
    console.log(`  ✅ TCP 443: Connection established with ${testHost}:443`);
  } else {
    console.warn(`  ⚠️ TCP 443: Direct connection to ${testHost}:443 failed: ${tcpResult.error}`);
  }
}

async function diagnose() {
  await checkNetworkConnectivity();

  console.log('\n🔍 STEP 1: Verifying Bot Token with Telegram API (getMe)...');
  let me;
  try {
    me = await botService.getMe();
    console.log(`  ✅ Bot Validated: @${me.username} (${me.first_name}) [ID: ${me.id}]`);
  } catch (err) {
    console.error(`  ❌ getMe Failed: ${err.message}`);
    if (err.message.includes('401') || err.message.includes('Unauthorized')) {
      console.error('\n🚨 Security Notice: The token in your environment was rejected by Telegram (Unauthorized).');
      console.error('Please generate a fresh token from @BotFather using /token or /revoke, and update .env.');
    }
    process.exit(1);
  }

  console.log('\n🔍 STEP 2: Inspecting Webhook Status (getWebhookInfo)...');
  let info;
  try {
    info = await botService.getWebhookInfo();
    console.log(`  • Webhook URL:            ${info.url ? info.url : '(None — Bot is in Polling mode)'}`);
    console.log(`  • Pending Updates Count:  ${info.pending_update_count || 0}`);
    console.log(`  • Custom Certificate:     ${info.has_custom_certificate ? 'Yes' : 'No'}`);
    if (info.last_error_date) {
      const errTime = new Date(info.last_error_date * 1000).toLocaleString();
      console.log(`  ⚠️ Last Error Date:        ${errTime}`);
      console.log(`  ⚠️ Last Error Message:     ${info.last_error_message}`);
    } else {
      console.log(`  • Last Error:             None reported by Telegram`);
    }
  } catch (err) {
    console.error(`  ❌ getWebhookInfo Failed: ${err.message}`);
    process.exit(1);
  }

  if (info.url) {
    console.log('\n⚠️ ATTENTION: Telegram Webhook is currently ACTIVE on:');
    console.log(`   ${info.url}`);
    console.log('\nBecause an active webhook delivers all updates to that HTTPS endpoint, Telegram will reject `getUpdates` long-polling with a conflict error.');
    console.log('\nOptions:');
    console.log('  1. To test via Webhook: Run your local server with a tunnel (ngrok / localtunnel) pointing to the webhook.');
    console.log('  2. To test via Long Polling: Run this script with `--delete-webhook` (will safely delete webhook and start polling).');
    console.log('     Command: node scripts/telegram-runner.mjs --poll --delete-webhook\n');
  } else {
    console.log('\n✅ Bot is ready for Long Polling mode!');
    console.log('   Run: node scripts/telegram-runner.mjs --poll\n');
  }

  return { me, info };
}

async function startPolling() {
  const { info } = await diagnose();

  if (info.url) {
    if (deleteWebhookRequested) {
      console.log('🔄 Deleting webhook to enable local Long Polling mode...');
      try {
        await botService.deleteWebhook();
        console.log('  ✅ Webhook deleted successfully. Long Polling is now enabled.');
      } catch (err) {
        console.error(`  ❌ Failed to delete webhook: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.error('❌ Cannot start Long Polling while Webhook is active without your confirmation.');
      console.log('Run with `--delete-webhook` to approve switching to polling mode:');
      console.log('  node scripts/telegram-runner.mjs --poll --delete-webhook\n');
      process.exit(1);
    }
  }

  acquireLock();
  process.on('exit', releaseLock);
  process.on('SIGINT', () => {
    releaseLock();
    console.log('\n🛑 Stopping bot runner gracefully...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    releaseLock();
    process.exit(0);
  });

  const db = getLocalDb();

  console.log('🚀 Starting Telegram Long Polling (getUpdates)...');
  console.log('📡 Listening for real Telegram messages. Press Ctrl+C to stop.\n');

  let offset = 0;
  let running = true;

  while (running) {
    try {
      const updates = await botService.getUpdates({ offset, timeout: 20, limit: 100 });
      for (const update of updates) {
        offset = update.update_id + 1;
        const msg = update.message;
        const cb = update.callback_query;

        if (msg) {
          const from = msg.from?.username ? `@${msg.from.username}` : `User ${msg.from?.id}`;
          console.log(`📥 [Incoming Message] ${from}: "${msg.text}" (Chat ID: ${msg.chat?.id})`);
        } else if (cb) {
          console.log(`📥 [Callback Query] User ${cb.from?.id}: Data "${cb.data}"`);
        }

        try {
          await processTelegramUpdate(db, botService, update);
          console.log('  📤 Response sent successfully.\n');
        } catch (procErr) {
          console.warn(`  ⚠️ Update processing error: ${procErr.message}`);
        }
      }
    } catch (err) {
      if (err.message?.includes('timeout') || err.message?.includes('AbortError')) {
        // Normal long poll timeout, continue loop
        continue;
      }
      if (err.message?.includes('Conflict')) {
        console.warn('⚠️ Telegram getUpdates conflict: another instance accessed the bot. Backing off 5s...');
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      console.error('❌ Polling error:', err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

if (mode === 'poll') {
  startPolling().catch((err) => {
    console.error('Fatal error in bot runner:', err);
    process.exit(1);
  });
} else {
  diagnose().catch((err) => {
    console.error('Fatal diagnostic error:', err);
    process.exit(1);
  });
}
