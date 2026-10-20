import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  TelegramBotService,
  createLinkToken,
  verifyAndLinkTelegram,
  unlinkTelegramUser,
  findUserByTelegramId,
  processTelegramUpdate,
  runAutomatedNotificationCycle,
  formatTimeInZone,
  getTodayKey,
} from '../src/telegramBot.mjs';
import { createTelegramApi } from '../src/telegramApi.mjs';
import { sessionCookie } from '../src/sessions.mjs';

function createMockDb() {
  const collections = new Map();
  function getCollection(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  return {
    _collections: collections,
    collection(name) {
      const col = getCollection(name);
      return {
        async findOne(query) {
          for (const item of col.values()) {
            let match = true;
            for (const [k, v] of Object.entries(query)) {
              if (k === '_id' && item._id !== v) match = false;
              else if (k === 'userId' && item.userId !== v) match = false;
              else if (k === 'telegramId' && item.telegramId !== v) match = false;
              else if (k === 'active' && item.active !== v) match = false;
              else if (k === 'used' && item.used !== v) match = false;
              else if (k === 'expiresAt' && v?.$gt && !(item.expiresAt > v.$gt)) match = false;
              else if (k === '$or') {
                const anyMatch = v.some((cond) => {
                  return Object.entries(cond).every(([ck, cv]) => item[ck] === cv);
                });
                if (!anyMatch) match = false;
              }
            }
            if (match) return JSON.parse(JSON.stringify(item));
          }
          return null;
        },
        find(query = {}) {
          const results = [];
          for (const item of col.values()) {
            let match = true;
            for (const [k, v] of Object.entries(query)) {
              if (k === 'userId' && item.userId !== v) match = false;
              else if (k === 'telegramId' && v?.$exists && (item.telegramId === null || item.telegramId === undefined)) match = false;
              else if (k === 'active' && item.active !== v) match = false;
            }
            if (match) results.push(JSON.parse(JSON.stringify(item)));
          }
          return {
            async toArray() {
              return results;
            },
          };
        },
        async insertOne(doc) {
          const id = doc._id || doc.id || String(col.size + 1);
          if (col.has(id)) {
            const err = new Error('E11000 duplicate key');
            err.code = 11000;
            throw err;
          }
          const item = { ...doc, _id: id };
          col.set(id, item);
          return { insertedId: id };
        },
        async updateOne(filter, update) {
          for (const [id, item] of col.entries()) {
            let match = true;
            for (const [k, v] of Object.entries(filter)) {
              if (k === '_id' && item._id !== v) match = false;
              else if (k === 'userId' && item.userId !== v) match = false;
              else if (k === '$or') {
                const anyMatch = v.some((cond) => Object.entries(cond).every(([ck, cv]) => item[ck] === cv));
                if (!anyMatch) match = false;
              }
              else if (k === 'tasks.id') {
                if (!Array.isArray(item.tasks) || !item.tasks.some((t) => t.id === v)) match = false;
              }
            }
            if (match) {
              if (update.$set) {
                for (const [uk, uv] of Object.entries(update.$set)) {
                  if (uk.startsWith('tasks.$.')) {
                    const taskKey = uk.slice('tasks.$.'.length);
                    const taskId = filter['tasks.id'];
                    const task = item.tasks?.find((t) => t.id === taskId);
                    if (task) task[taskKey] = uv;
                  } else {
                    item[uk] = uv;
                  }
                }
              }
              if (update.$inc) {
                for (const [uk, uv] of Object.entries(update.$inc)) {
                  item[uk] = (item[uk] || 0) + uv;
                }
              }
              if (update.$unset) {
                for (const uk of Object.keys(update.$unset)) {
                  delete item[uk];
                }
              }
              col.set(id, item);
              return { modifiedCount: 1 };
            }
          }
          return { modifiedCount: 0 };
        },
        async updateMany(filter, update) {
          let modifiedCount = 0;
          for (const [id, item] of col.entries()) {
            let match = true;
            for (const [k, v] of Object.entries(filter)) {
              if (k === '_id' && v?.$ne && item._id === v.$ne) match = false;
              else if (k === '_id' && typeof v === 'string' && item._id !== v) match = false;
              else if (k === 'telegramId' && item.telegramId !== v) match = false;
            }
            if (match) {
              if (update.$set) {
                for (const [uk, uv] of Object.entries(update.$set)) item[uk] = uv;
              }
              if (update.$unset) {
                for (const uk of Object.keys(update.$unset)) delete item[uk];
              }
              col.set(id, item);
              modifiedCount++;
            }
          }
          return { modifiedCount };
        },
        async deleteMany(filter) {
          let count = 0;
          for (const [id, item] of col.entries()) {
            if (filter.userId && item.userId === filter.userId) {
              col.delete(id);
              count++;
            }
          }
          return { deletedCount: count };
        },
        async createIndex() {
          return 'ok';
        },
      };
    },
  };
}

test('Telegram linking token lifecycle: create, verify, single-use and expiration', async () => {
  const db = createMockDb();
  const userId = 'noviq-user-123';

  // Seed user
  await db.collection('auth_accounts').insertOne({
    _id: userId,
    email: 'student@noviqq.uz',
    displayName: 'Saidamin',
    streak: 5,
    xp: 450,
  });

  // 1. Create link token
  const { token, expiresAt } = await createLinkToken(db, userId);
  assert.ok(token && token.length === 48);
  assert.ok(expiresAt > new Date());

  // 2. Link via deep link
  const linked = await verifyAndLinkTelegram(db, token, { username: 'saidamin_tg' }, 987654321);
  assert.ok(linked);
  assert.equal(linked.uid, userId);
  assert.equal(linked.telegramId, '987654321');
  assert.equal(linked.telegramUsername, 'saidamin_tg');

  // Verify account updated in db
  const account = await db.collection('auth_accounts').findOne({ _id: userId });
  assert.equal(account.telegramId, '987654321');

  // 3. Single-use: Reusing the same token fails
  const reused = await verifyAndLinkTelegram(db, token, { username: 'attacker' }, 11111);
  assert.equal(reused, null);

  // 4. Expired token fails
  const { token: expiredToken } = await createLinkToken(db, userId);
  // Force token expired
  for (const item of db._collections.get('telegram_link_tokens').values()) {
    item.expiresAt = new Date(Date.now() - 1000);
  }
  const expiredResult = await verifyAndLinkTelegram(db, expiredToken, { username: 'tester' }, 22222);
  assert.equal(expiredResult, null);

  // 5. Unlink account
  await unlinkTelegramUser(db, userId);
  const unlinkedAccount = await db.collection('auth_accounts').findOne({ _id: userId });
  assert.equal(Boolean(unlinkedAccount.telegramId), false);
});

test('Telegram bot command processing: /start, /planner, /focus, /metrics, /reminders, /settings', async () => {
  const db = createMockDb();
  const userId = 'noviq-user-456';
  const chatId = 55443322;

  // Seed user and planner tasks
  await db.collection('auth_accounts').insertOne({
    _id: userId,
    email: 'student2@noviqq.uz',
    displayName: 'Bekzod',
    telegramId: String(chatId),
    telegramUsername: 'bekzod_uz',
    streak: 7,
    xp: 620,
    dailyTargetMinutes: 45,
  });

  await db.collection('planner_plans').insertOne({
    _id: userId,
    userId,
    version: 2,
    tasks: [
      { id: 'task-1', title: 'IELTS Reading Practice', minutes: 30, completed: false },
      { id: 'task-2', title: 'Math Problem Set 4', minutes: 20, completed: true },
    ],
    sessions: [
      { taskId: 'task-1', start: Date.now() + 1800000, end: Date.now() + 3600000 },
    ],
  });

  await db.collection('decks').insertOne({
    _id: 'deck-1',
    userId,
    title: 'IELTS Vocabulary Unit 1',
    subject: 'English',
  });

  const sentMessages = [];
  const mockService = {
    async sendMessage(cid, text, options) {
      sentMessages.push({ cid, text, options });
      return { message_id: sentMessages.length };
    },
    async editMessageText(cid, mid, text, options) {
      sentMessages.push({ cid, mid, text, options, edited: true });
      return { message_id: mid };
    },
    async answerCallbackQuery(id, opts) {
      return true;
    },
  };

  // Test /start
  await processTelegramUpdate(db, mockService, {
    update_id: 101,
    message: { chat: { id: chatId, type: 'private' }, text: '/start', from: { id: chatId, language_code: 'uz' } },
  });
  assert.ok(sentMessages.length >= 1);
  assert.match(sentMessages[0].text, /Bekzod/);
  assert.match(sentMessages[0].text, /7 kun/);

  // Test /planner
  sentMessages.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 102,
    message: { chat: { id: chatId, type: 'private' }, text: '/planner', from: { id: chatId, language_code: 'uz' } },
  });
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /IELTS Reading Practice/);
  assert.match(sentMessages[0].text, /Math Problem Set 4/);
  // Completed icon check
  assert.match(sentMessages[0].text, /✅/);
  assert.match(sentMessages[0].text, /⏳/);

  // Test completing a task via callback query: task_done:task-1
  sentMessages.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 103,
    callback_query: {
      id: 'cb-1',
      data: 'task_done:task-1',
      message: { chat: { id: chatId, type: 'private' }, message_id: 20 },
      from: { id: chatId },
    },
  });
  // Verify task marked completed in db
  const plan = await db.collection('planner_plans').findOne({ _id: userId });
  assert.equal(plan.tasks.find((t) => t.id === 'task-1').completed, true);

  // Test /focus
  sentMessages.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 104,
    message: { chat: { id: chatId, type: 'private' }, text: '/focus', from: { id: chatId, language_code: 'uz' } },
  });
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /Focus Timer/);

  // Test /metrics
  sentMessages.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 105,
    message: { chat: { id: chatId, type: 'private' }, text: '/metrics', from: { id: chatId, language_code: 'uz' } },
  });
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /Bekzod/);
  assert.match(sentMessages[0].text, /7 kun/);

  // Test /flashcards
  sentMessages.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 106,
    message: { chat: { id: chatId, type: 'private' }, text: '/flashcards', from: { id: chatId, language_code: 'uz' } },
  });
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /IELTS Vocabulary Unit 1/);

  // Test /reminders and toggle
  sentMessages.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 107,
    message: { chat: { id: chatId, type: 'private' }, text: '/reminders', from: { id: chatId, language_code: 'uz' } },
  });
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /eslatma/i);

  // Toggle reminder callback
  await processTelegramUpdate(db, mockService, {
    update_id: 108,
    callback_query: {
      id: 'cb-2',
      data: 'rem_toggle:studyReminders',
      message: { chat: { id: chatId, type: 'private' }, message_id: 25 },
      from: { id: chatId },
    },
  });
  const updatedAccount = await db.collection('auth_accounts').findOne({ _id: userId });
  assert.equal(updatedAccount.telegramReminders.studyReminders, false);

  // Test /settings
  sentMessages.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 109,
    message: { chat: { id: chatId, type: 'private' }, text: '/settings', from: { id: chatId, language_code: 'uz' } },
  });
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /student2@noviqq.uz/);
});

test('Automated notification cycle: daily study summary and deadline reminders', async () => {
  const db = createMockDb();
  const userId = 'notify-user-789';
  const chatId = 99887766;

  await db.collection('auth_accounts').insertOne({
    _id: userId,
    displayName: 'Malika',
    telegramId: String(chatId),
    streak: 12,
    dailyTargetMinutes: 30,
    telegramReminders: {
      dailyStreakSummary: true,
      taskDeadlines: true,
      studyReminders: true,
    },
  });

  await db.collection('planner_plans').insertOne({
    _id: userId,
    userId,
    tasks: [
      { id: 'task-incomplete', title: 'Essay Writing Drafting', minutes: 40, completed: false },
    ],
  });

  const sentNotifications = [];
  const mockService = {
    async sendMessage(cid, text, options) {
      sentNotifications.push({ cid, text, options });
      return { message_id: sentNotifications.length };
    },
  };

  // Run at 21:30 Tashkent time
  const eveningDate = new Date('2026-10-19T16:30:00Z'); // 21:30 in Asia/Tashkent (+5)
  const result = await runAutomatedNotificationCycle(db, mockService, eveningDate);

  assert.equal(result.checkedUsers, 1);
  assert.ok(result.sentCount >= 2); // 1 deadline reminder + 1 daily summary
  assert.ok(sentNotifications.some((n) => n.text.includes('Essay Writing Drafting')));
  assert.ok(sentNotifications.some((n) => n.text.includes('Kunlik NOVIQ hisoboti')));

  // Test Deduplication: running again on same day does NOT send duplicate summaries
  sentNotifications.length = 0;
  const secondRun = await runAutomatedNotificationCycle(db, mockService, eveningDate);
  assert.equal(secondRun.sentCount, 0);
  assert.equal(sentNotifications.length, 0);
});

test('HTTP Telegram API: webhook verification, link-token and disconnect', async () => {
  const db = createMockDb();
  const secret = 'super-secret-webhook-token';
  const botToken = '123456:synthetic_token_xyz';
  const origin = 'https://noviqq.uz';

  const testSessionToken = 'f'.repeat(64);
  const sessions = {
    async resolve(token) {
      if (token === testSessionToken) return { uid: 'http-user-1' };
      return null;
    },
  };

  await db.collection('auth_accounts').insertOne({
    _id: 'http-user-1',
    email: 'http@noviqq.uz',
    displayName: 'HTTP User',
    telegramId: '445566',
  });

  const mockFetch = async (url, opts) => {
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, result: { message_id: 123 } };
      },
    };
  };

  const apiHandler = createTelegramApi(db, sessions, {
    token: botToken,
    webhookSecret: secret,
    botUsername: 'noviqq_bot',
    origin,
    fetchImpl: mockFetch,
  });

  const server = http.createServer(apiHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Webhook rejects forged or missing secret token
    const forgedResp = await fetch(base + '/api/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      body: JSON.stringify({ update_id: 1 }),
    });
    assert.equal(forgedResp.status, 401);

    // 2. Webhook accepts valid secret token
    const validResp = await fetch(base + '/api/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
      body: JSON.stringify({ update_id: 201, message: { chat: { id: 445566, type: 'private' }, text: '/help' } }),
    });
    assert.equal(validResp.status, 200);

    // 3. Link-token generation requires valid session cookie & origin
    const unauthResp = await fetch(base + '/api/telegram/link-token', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
    });
    assert.equal(unauthResp.status, 401);

    const linkResp = await fetch(base + '/api/telegram/link-token', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: sessionCookie(testSessionToken),
      },
    });
    assert.equal(linkResp.status, 200);
    const linkData = await linkResp.json();
    assert.ok(linkData.token);
    assert.match(linkData.deepLink, /https:\/\/t\.me\/noviqq_bot\?start=link_/);

    // 4. Disconnect Telegram endpoint
    const disconnectResp = await fetch(base + '/api/telegram/disconnect', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: sessionCookie(testSessionToken),
      },
    });
    assert.equal(disconnectResp.status, 200);
    const userAcc = await db.collection('auth_accounts').findOne({ _id: 'http-user-1' });
    assert.equal(Boolean(userAcc.telegramId), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Security tests: update replay, unauthorized task completion, and cron authorization', async () => {
  const db = createMockDb();
  const victimUid = 'victim-1';
  const attackerUid = 'attacker-2';
  const victimChatId = 112233;
  const attackerChatId = 998877;

  await db.collection('auth_accounts').insertOne({
    _id: victimUid,
    displayName: 'Victim Student',
    telegramId: String(victimChatId),
  });

  await db.collection('auth_accounts').insertOne({
    _id: attackerUid,
    displayName: 'Attacker',
    telegramId: String(attackerChatId),
  });

  // Victim has task-secret
  await db.collection('planner_plans').insertOne({
    _id: victimUid,
    userId: victimUid,
    tasks: [{ id: 'victim-task-1', title: 'Private Math Prep', completed: false }],
  });

  // Attacker has task-own
  await db.collection('planner_plans').insertOne({
    _id: attackerUid,
    userId: attackerUid,
    tasks: [{ id: 'attacker-task-1', title: 'Attacker Homework', completed: false }],
  });

  const sent = [];
  const mockService = {
    async sendMessage(cid, text, opts) { sent.push({ cid, text, opts }); return { message_id: sent.length }; },
    async answerCallbackQuery() { return true; },
  };

  // 1. Update Replay Protection: update_id sent twice is deduplicated
  const first = await processTelegramUpdate(db, mockService, {
    update_id: 99991,
    message: { chat: { id: victimChatId, type: 'private' }, text: '/planner' },
  });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, undefined);

  const replay = await processTelegramUpdate(db, mockService, {
    update_id: 99991,
    message: { chat: { id: victimChatId, type: 'private' }, text: '/planner' },
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);

  // 2. Unauthorized task completion: Attacker cannot complete victim's task
  await processTelegramUpdate(db, mockService, {
    update_id: 99992,
    callback_query: {
      id: 'cb-attack',
      data: 'task_done:victim-task-1',
      from: { id: attackerChatId },
      message: { chat: { id: attackerChatId, type: 'private' }, message_id: 50 },
    },
  });

  // Victim's task remains untouched and uncompleted
  const victimPlan = await db.collection('planner_plans').findOne({ _id: victimUid });
  assert.equal(victimPlan.tasks.find((t) => t.id === 'victim-task-1').completed, false);
});

test('Phase 5 Security: Cross-account data isolation, safe switching, and task ownership', async () => {
  const db = createMockDb();
  const userAUid = 'test-user-A';
  const userBUid = 'test-user-B';
  const chatId = 888999;

  // Account A: UID test-user-A, XP 100, Streak 3, Task A
  await db.collection('auth_accounts').insertOne({
    _id: userAUid,
    email: 'userA@noviqq.uz',
    displayName: 'User A',
    xp: 100,
    streak: 3,
  });
  await db.collection('users').insertOne({
    _id: userAUid,
    email: 'userA@noviqq.uz',
    displayName: 'User A',
    xp: 100,
    streak: 3,
    dailyTargetMinutes: 30,
    subscription: { plan: 'free', status: 'active' },
  });
  await db.collection('planner_plans').insertOne({
    _id: userAUid,
    userId: userAUid,
    tasks: [{ id: 'task-A', title: 'Task A', completed: false }],
  });

  // Account B: UID test-user-B, XP 900, Streak 12, Task B
  await db.collection('auth_accounts').insertOne({
    _id: userBUid,
    email: 'userB@noviqq.uz',
    displayName: 'User B',
    xp: 900,
    streak: 12,
  });
  await db.collection('users').insertOne({
    _id: userBUid,
    email: 'userB@noviqq.uz',
    displayName: 'User B',
    xp: 900,
    streak: 12,
    dailyTargetMinutes: 45,
    subscription: { plan: 'pro', status: 'active' },
  });
  await db.collection('planner_plans').insertOne({
    _id: userBUid,
    userId: userBUid,
    tasks: [{ id: 'task-B', title: 'Task B', completed: false }],
  });

  const sent = [];
  const mockService = {
    async sendMessage(cid, text, opts) { sent.push({ cid, text, opts }); return { message_id: sent.length }; },
    async answerCallbackQuery() { return true; },
  };

  // 1. Link T to Account A
  const linkTokenA = await createLinkToken(db, userAUid, { displayName: 'User A', email: 'userA@noviqq.uz' });
  const startA = await processTelegramUpdate(db, mockService, {
    update_id: 1001,
    message: { chat: { id: chatId, type: 'private' }, from: { username: 'tg_user', language_code: 'uz' }, text: `/start link_${linkTokenA.token}` },
  });
  assert.equal(startA.ok, true);
  assert.equal(startA.linked, true);
  const checkA = await findUserByTelegramId(db, chatId);
  assert.equal(checkA.uid, userAUid);

  // 2. Verify /metrics and /planner display only A's data
  sent.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 1002,
    message: { chat: { id: chatId, type: 'private' }, from: { username: 'tg_user', language_code: 'uz' }, text: '/metrics' },
  });
  const metricsA = sent.at(-1)?.text || '';
  assert.ok(metricsA.includes('100 XP'), 'Must show A XP (100 XP)');
  assert.ok(metricsA.includes('3 kun'), 'Must show A Streak (3 kun)');
  assert.ok(!metricsA.includes('900 XP'), 'Must NOT show B XP');
  assert.ok(!metricsA.includes('12 kun'), 'Must NOT show B Streak');

  sent.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 1003,
    message: { chat: { id: chatId, type: 'private' }, from: { username: 'tg_user', language_code: 'uz' }, text: '/planner' },
  });
  const plannerA = sent.at(-1)?.text || '';
  assert.ok(plannerA.includes('Task A'), 'Must show Task A');
  assert.ok(!plannerA.includes('Task B'), 'Must NOT show Task B');

  // 3 & 4. Attempt to link T to Account B -> Requires switching confirmation!
  const linkTokenB = await createLinkToken(db, userBUid, { displayName: 'User B', email: 'userB@noviqq.uz' });
  const startB = await processTelegramUpdate(db, mockService, {
    update_id: 1004,
    message: { chat: { id: chatId, type: 'private' }, from: { username: 'tg_user', language_code: 'uz' }, text: `/start link_${linkTokenB.token}` },
  });
  assert.equal(startB.ok, true);
  assert.equal(startB.switchConfirmationRequired, true);
  assert.ok(startB.actionId, 'Must return actionId');

  // Verify that EVERY inline button callback_data is <= 64 bytes!
  const switchMsg = sent.at(-1);
  const switchButtons = switchMsg?.opts?.reply_markup?.inline_keyboard?.flat() || [];
  assert.ok(switchButtons.length >= 2, 'Must have at least confirm and cancel buttons');
  for (const btn of switchButtons) {
    if (btn.callback_data) {
      const byteLen = Buffer.byteLength(btn.callback_data, 'utf8');
      assert.ok(byteLen <= 64, `Button callback_data "${btn.callback_data}" exceeds 64 bytes (${byteLen} bytes)`);
    }
  }

  // At this point, Account A is STILL linked
  const stillA = await findUserByTelegramId(db, chatId);
  assert.equal(stillA.uid, userAUid);

  // 5. Complete switch to B via switch_confirm callback using actionId
  const switchRes = await processTelegramUpdate(db, mockService, {
    update_id: 1005,
    callback_query: {
      id: 'cb-switch',
      data: `switch_confirm:${startB.actionId}`,
      from: { id: chatId, username: 'tg_user' },
      message: { chat: { id: chatId, type: 'private' } },
    },
  });
  assert.equal(switchRes.ok, true);
  assert.equal(switchRes.switched, true);
  assert.equal(switchRes.uid, userBUid);

  // 6. Verify /metrics and /planner display ONLY B's data
  sent.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 1006,
    message: { chat: { id: chatId, type: 'private' }, from: { username: 'tg_user', language_code: 'uz' }, text: '/metrics' },
  });
  const metricsB = sent.at(-1)?.text || '';
  assert.ok(metricsB.includes('900 XP'), 'Must show B XP (900 XP)');
  assert.ok(metricsB.includes('12 kun'), 'Must show B Streak (12 kun)');
  assert.ok(!metricsB.includes('100 XP'), 'Must NOT show A XP');
  assert.ok(!metricsB.includes('3 kun'), 'Must NOT show A Streak');

  sent.length = 0;
  await processTelegramUpdate(db, mockService, {
    update_id: 1007,
    message: { chat: { id: chatId, type: 'private' }, from: { username: 'tg_user', language_code: 'uz' }, text: '/planner' },
  });
  const plannerB = sent.at(-1)?.text || '';
  assert.ok(plannerB.includes('Task B'), 'Must show Task B');
  assert.ok(!plannerB.includes('Task A'), 'Must NOT show Task A');

  // 7 & 8. Verify Account A is no longer linked, and Account A's study data is unchanged
  const accA = await db.collection('auth_accounts').findOne({ _id: userAUid });
  const userADoc = await db.collection('users').findOne({ _id: userAUid });
  assert.equal(accA.telegramId, undefined, 'Account A must be unlinked');
  assert.equal(userADoc.telegramId, undefined);
  assert.equal(userADoc.xp, 100, 'Account A XP must be unchanged');
  assert.equal(userADoc.streak, 3, 'Account A streak must be unchanged');

  // 9. Verify old inline callbacks (for Task A) cannot modify Account A or award XP to Account B
  const oldTaskDone = await processTelegramUpdate(db, mockService, {
    update_id: 1008,
    callback_query: {
      id: 'cb-old-task',
      data: 'task_done:task-A',
      from: { id: chatId },
      message: { chat: { id: chatId, type: 'private' } },
    },
  });
  assert.equal(oldTaskDone.taskCompleted, false, 'Old task must not complete');
  const planA = await db.collection('planner_plans').findOne({ _id: userAUid });
  assert.equal(planA.tasks[0].completed, false);
  const userBCheck = await db.collection('users').findOne({ _id: userBUid });
  assert.equal(userBCheck.xp, 900, 'Account B must not receive unearned XP');

  // 10. Verify unlinking B does not restore A
  const unlinkRes = await processTelegramUpdate(db, mockService, {
    update_id: 1009,
    callback_query: {
      id: 'cb-unlink',
      data: 'unlink_confirm',
      from: { id: chatId },
      message: { chat: { id: chatId, type: 'private' } },
    },
  });
  assert.equal(unlinkRes.unlinked, true);
  const noUser = await findUserByTelegramId(db, chatId);
  assert.equal(noUser, null);
  const accAAfter = await db.collection('auth_accounts').findOne({ _id: userAUid });
  assert.equal(accAAfter.telegramId, undefined, 'Account A is NOT restored');

  // 11. Test parallel linking requests and replayed tokens
  const replayB = await processTelegramUpdate(db, mockService, {
    update_id: 1010,
    message: { chat: { id: chatId, type: 'private' }, from: { username: 'tg_user', language_code: 'uz' }, text: `/start link_${linkTokenB.token}` },
  });
  assert.equal(replayB.linkFailed, true, 'Replayed token must fail');
});

