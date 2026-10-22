import { getLocalDb } from '../server/src/localDb.mjs';
import { processTelegramUpdate } from '../server/src/telegramBot.mjs';

const db = getLocalDb();

// Mock bot service that captures outgoing messages
let lastSent = null;
const mockBotService = {
  async sendMessage(chatId, text, options) {
    lastSent = { chatId, text, options };
    return { ok: true, message_id: 1234 };
  },
  async getMe() {
    return { id: 8836784306, username: 'noviqq_bot', first_name: 'noviq' };
  },
};

async function testStart() {
  console.log('--- Testing /start for guest user ---');
  const update = {
    update_id: 999901,
    message: {
      message_id: 1,
      chat: { id: 7911059765, type: 'private' },
      from: { id: 7911059765, is_bot: false, first_name: 'Saidamin', language_code: 'uz' },
      text: '/start',
    },
  };

  await processTelegramUpdate(db, mockBotService, update);
  console.log('Outgoing Text Preview:\n', lastSent.text.split('\n')[0]);
  console.log('Full Outgoing Text:\n', lastSent.text);
  console.log('Buttons:', JSON.stringify(lastSent.options?.reply_markup?.inline_keyboard, null, 2));

  // Check URL in text
  const hasLocalhostUrl = lastSent.text.includes('http://localhost:3000/profile');
  const buttons = lastSent.options?.reply_markup?.inline_keyboard || [];
  const profileBtn = buttons.flat().find((b) => b.text.includes('Profil') || b.text.includes('Connect'));

  console.log('URL present in text:', hasLocalhostUrl);
  console.log('Button config:', profileBtn);

  if (hasLocalhostUrl && profileBtn?.callback_data === 'menu:url:profile') {
    console.log('✅ PASS: /start safely provides http://localhost:3000/profile without violating Telegram button URL constraints!');
  } else {
    console.error('❌ FAIL: Expected safe button and URL in text');
    process.exit(1);
  }
}

testStart().catch(console.error);
