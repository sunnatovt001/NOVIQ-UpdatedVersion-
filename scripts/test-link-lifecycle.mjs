import { getLocalDb } from '../server/src/localDb.mjs';
import { processTelegramUpdate, findUserByTelegramId } from '../server/src/telegramBot.mjs';

const db = getLocalDb();

async function runLinkLifecycle() {
  console.log('====================================================');
  console.log('🔄 NOVIQ Local Telegram Account Linking Lifecycle Test');
  console.log('====================================================\n');

  // 1. Generate link token from local Vite API
  console.log('1️⃣ Requesting link token from http://localhost:3000/api/telegram/link-token...');
  const tokenResp = await fetch('http://localhost:3000/api/telegram/link-token', {
    method: 'POST',
    headers: { Authorization: 'Bearer local-dev-mock-token' },
  });
  const tokenData = await tokenResp.json();
  console.log('  Token response:', tokenData);
  if (!tokenData.token) throw new Error('Token generation failed');

  // 2. Simulate Telegram user sending /start link_<token>
  const testChatId = 7911059765;
  console.log(`\n2️⃣ Simulating Telegram /start link_${tokenData.token} from chat ${testChatId}...`);

  let lastSent = null;
  const mockBotService = {
    async sendMessage(chatId, text, options) {
      lastSent = { chatId, text, options };
      return { ok: true, message_id: 5555 };
    },
    async getMe() {
      return { id: 8836784306, username: 'noviqq_bot', first_name: 'noviq' };
    },
  };

  const update = {
    update_id: 888801,
    message: {
      message_id: 10,
      chat: { id: testChatId, type: 'private' },
      from: { id: testChatId, is_bot: false, first_name: 'Saidamin', username: 'Sunnatov_ts', language_code: 'uz' },
      text: `/start link_${tokenData.token}`,
    },
  };

  const linkResult = await processTelegramUpdate(db, mockBotService, update);
  console.log('  Bot Response to linking:', lastSent?.text?.split('\n')[0]);
  console.log('  Link result:', linkResult);
  if (!linkResult.linked) throw new Error('Bot failed to link account!');

  // 3. Verify status from Vite server
  console.log('\n3️⃣ Checking status via http://localhost:3000/api/telegram/status...');
  const statusResp = await fetch('http://localhost:3000/api/telegram/status', {
    headers: { Authorization: 'Bearer local-dev-mock-token' },
  });
  const statusData = await statusResp.json();
  console.log('  Status response:', statusData);
  if (!statusData.connected) throw new Error('Status does not show connected!');

  // 4. Test linked /start greeting
  console.log('\n4️⃣ Sending /start for linked user...');
  const startUpdate = {
    update_id: 888802,
    message: {
      message_id: 11,
      chat: { id: testChatId, type: 'private' },
      from: { id: testChatId, is_bot: false, first_name: 'Saidamin', username: 'Sunnatov_ts', language_code: 'uz' },
      text: '/start',
    },
  };
  await processTelegramUpdate(db, mockBotService, startUpdate);
  console.log('  Bot response:\n', lastSent?.text);

  // 5. Test disconnect via Vite server
  console.log('\n5️⃣ Disconnecting Telegram via http://localhost:3000/api/telegram/disconnect...');
  const dcResp = await fetch('http://localhost:3000/api/telegram/disconnect', {
    method: 'POST',
    headers: { Authorization: 'Bearer local-dev-mock-token' },
  });
  const dcData = await dcResp.json();
  console.log('  Disconnect response:', dcData);

  const finalStatusResp = await fetch('http://localhost:3000/api/telegram/status', {
    headers: { Authorization: 'Bearer local-dev-mock-token' },
  });
  const finalStatus = await finalStatusResp.json();
  console.log('  Post-disconnect status:', finalStatus);
  if (finalStatus.connected) throw new Error('Account still connected after disconnect!');

  console.log('\n✅ ALL LIFECYCLE TESTS PASSED PERFECTLY!');
}

runLinkLifecycle().catch(console.error);
