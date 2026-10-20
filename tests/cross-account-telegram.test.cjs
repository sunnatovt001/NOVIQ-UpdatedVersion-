const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createHash, randomBytes } = require('node:crypto');
const localTelegram = require('../server/local-telegram.cjs');
const { getLocalDb } = require('../server/src/localDb.cjs');

test('Cross-Account Data Isolation and Safe Account Switching (Phase 5)', async () => {
  const tempFile = path.join(os.tmpdir(), `noviq-cross-account-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  process.env.NOVIQ_LOCAL_DB_FILE = tempFile;
  try {
    const db = getLocalDb();
    const userAUid = 'test-user-A';
    const userBUid = 'test-user-B';
    const chatId = 654321;

  // Setup Account A (XP: 100, Streak: 3, Task A)
  await db.collection('auth_accounts').updateOne(
    { _id: userAUid },
    {
      $set: {
        _id: userAUid,
        email: 'userA@noviqq.uz',
        displayName: 'User A',
        xp: 100,
        streak: 3,
      },
    },
    { upsert: true }
  );
  await db.collection('users').updateOne(
    { _id: userAUid },
    {
      $set: {
        _id: userAUid,
        email: 'userA@noviqq.uz',
        displayName: 'User A',
        xp: 100,
        streak: 3,
        dailyTargetMinutes: 30,
        subscription: { plan: 'free', status: 'active' },
      },
    },
    { upsert: true }
  );

  // Setup Account B (XP: 900, Streak: 12, Task B)
  await db.collection('auth_accounts').updateOne(
    { _id: userBUid },
    {
      $set: {
        _id: userBUid,
        email: 'userB@noviqq.uz',
        displayName: 'User B',
        xp: 900,
        streak: 12,
      },
    },
    { upsert: true }
  );
  await db.collection('users').updateOne(
    { _id: userBUid },
    {
      $set: {
        _id: userBUid,
        email: 'userB@noviqq.uz',
        displayName: 'User B',
        xp: 900,
        streak: 12,
        dailyTargetMinutes: 45,
        subscription: { plan: 'pro', status: 'active' },
      },
    },
    { upsert: true }
  );

  const sentMessages = [];
  const fakeFetch = async (url, options = {}) => {
    if (url.includes('sendMessage')) {
      const payload = JSON.parse(options.body || '{}');
      sentMessages.push(payload);
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 201 } }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };

  const handler = localTelegram({
    botToken: '123456:fake_token',
    firebaseConfig: {
      apiKey: 'fake-key',
      projectId: 'demo-noviq',
      firestoreDatabaseId: '(default)',
    },
    fetchImpl: fakeFetch,
  });

  const sendWebhook = async (body) => {
    let statusCode = 200;
    let headers = {};
    let responseBody = null;

    const req = {
      url: '/api/telegram/webhook',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify(body));
      },
    };

    const res = {
      set statusCode(c) { statusCode = c; },
      get statusCode() { return statusCode; },
      setHeader(k, v) { headers[k] = v; },
      end(payload) {
        try { responseBody = JSON.parse(payload); } catch { responseBody = payload; }
      },
    };

    await handler(req, res, () => {});
    return { statusCode, headers, body: responseBody };
  };

  // Generate tokens for A and B
  const tokenA = randomBytes(24).toString('hex');
  const hashA = createHash('sha256').update(tokenA).digest('hex');
  await db.collection('telegram_link_tokens').insertOne({
    _id: hashA,
    token: tokenA,
    userId: userAUid,
    displayName: 'User A',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    used: false,
  });

  const tokenB = randomBytes(24).toString('hex');
  const hashB = createHash('sha256').update(tokenB).digest('hex');
  await db.collection('telegram_link_tokens').insertOne({
    _id: hashB,
    token: tokenB,
    userId: userBUid,
    displayName: 'User B',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    used: false,
  });

  // 1. Link T to Account A
  const linkResA = await sendWebhook({
    update_id: 2001,
    message: { chat: { id: chatId }, from: { username: 'student' }, text: `/start link_${tokenA}` },
  });
  assert.equal(linkResA.body.linked, true);
  assert.equal(linkResA.body.userId, userAUid);

  // 2. Attempt to link T to Account B -> Requires switching confirmation!
  const linkResB = await sendWebhook({
    update_id: 2002,
    message: { chat: { id: chatId }, from: { username: 'student' }, text: `/start link_${tokenB}` },
  });
  assert.equal(linkResB.body.switchConfirmationRequired, true);
  assert.ok(linkResB.body.actionId, 'Must return actionId');

  // Verify that EVERY inline button callback_data is <= 64 bytes!
  const switchMsg = sentMessages.find((m) => m.reply_markup?.inline_keyboard?.some((row) => row.some((b) => b.callback_data?.includes('switch_confirm'))));
  assert.ok(switchMsg, 'Must send switch confirmation keyboard');
  const switchButtons = switchMsg.reply_markup.inline_keyboard.flat();
  for (const btn of switchButtons) {
    if (btn.callback_data) {
      const byteLen = Buffer.byteLength(btn.callback_data, 'utf8');
      assert.ok(byteLen <= 64, `Button callback_data "${btn.callback_data}" exceeds 64 bytes (${byteLen} bytes)`);
    }
  }

  // At this moment, Account A is STILL linked in DB
  const accAStill = await db.collection('auth_accounts').findOne({ _id: userAUid });
  assert.equal(accAStill.telegramId, String(chatId));

  // Test forged actionId is rejected
  const fakeRes = await sendWebhook({
    update_id: 20021,
    callback_query: {
      id: 'cb-switch-fake',
      data: 'switch_confirm:fake_random_callback_id_00000000',
      message: { chat: { id: chatId } },
      from: { username: 'student' },
    },
  });
  assert.equal(fakeRes.body.switched, false, 'Forged callback ID must be rejected');

  // 3. Complete switch to Account B via switch_confirm callback using actionId
  const switchRes = await sendWebhook({
    update_id: 2003,
    callback_query: {
      id: 'cb-switch-local',
      data: `switch_confirm:${linkResB.body.actionId}`,
      message: { chat: { id: chatId } },
      from: { username: 'student' },
    },
  });
  assert.equal(switchRes.body.switched, true);

  // Test replaying the exact same switch_confirm button is rejected (single-use)
  const replayRes = await sendWebhook({
    update_id: 20031,
    callback_query: {
      id: 'cb-switch-replay',
      data: `switch_confirm:${linkResB.body.actionId}`,
      message: { chat: { id: chatId } },
      from: { username: 'student' },
    },
  });
  assert.equal(replayRes.body.switched, false, 'Replaying switch_confirm must fail');

  // 4. Verify Account A is NO LONGER linked, and study progress is intact
  const accAAfter = await db.collection('auth_accounts').findOne({ _id: userAUid });
  const userAAfter = await db.collection('users').findOne({ _id: userAUid });
  assert.equal(accAAfter.telegramId, undefined, 'Account A must be unlinked');
  assert.equal(userAAfter.telegramId, undefined);
  assert.equal(userAAfter.xp, 100, 'Account A XP must be unchanged');
  assert.equal(userAAfter.streak, 3, 'Account A streak must be unchanged');

  // 5. Verify Account B is now the ONLY linked account
  const accBAfter = await db.collection('auth_accounts').findOne({ _id: userBUid });
  const userBAfter = await db.collection('users').findOne({ _id: userBUid });
  assert.equal(accBAfter.telegramId, String(chatId));
  assert.equal(userBAfter.telegramId, String(chatId));
  assert.equal(userBAfter.xp, 900, 'Account B XP must be 900');
  assert.equal(userBAfter.streak, 12, 'Account B streak must be 12');

  // 6. Verify unlinking B does not restore A
  const unlinkRes = await sendWebhook({
    update_id: 2004,
    callback_query: {
      id: 'cb-unlink-local',
      data: 'unlink_confirm',
      message: { chat: { id: chatId } },
    },
  });
  assert.equal(unlinkRes.body.unlinked, true);
  const accBUnlinked = await db.collection('auth_accounts').findOne({ _id: userBUid });
  const accAUnlinked = await db.collection('auth_accounts').findOne({ _id: userAUid });
  assert.equal(accBUnlinked.telegramId, undefined);
  assert.equal(accAUnlinked.telegramId, undefined, 'Account A is NOT restored');
  } finally {
    delete process.env.NOVIQ_LOCAL_DB_FILE;
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}
  }
});
