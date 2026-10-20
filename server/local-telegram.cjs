// Local Development Telegram Handler for Vite dev server.
// Connects to Firebase Auth / Firestore and/or local MongoDB without requiring a Google Service Account key.
const { createHash, randomBytes } = require('node:crypto');
const { getProfileUrl, getAppUrl } = require('./src/appUrl.cjs');
const { getLocalDb } = require('./src/localDb.cjs');
const db = getLocalDb();

const loopback = (address) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('integerValue' in value || 'doubleValue' in value) return Number(value.integerValue ?? value.doubleValue);
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  return null;
}

function decodeFields(fields) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)])
  );
}

function encodeValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(encodeValue) } };
  if (typeof val === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(val).map(([k, v]) => [k, encodeValue(v)])) } };
  }
  return { stringValue: String(val) };
}

// In-memory link token store for local development linking
const localLinkTokens = new Map(); // token -> { userId, expiresAt }
const localLinkedUsers = new Map(); // telegramId -> { userId, username }
const localProcessedUpdates = new Set();

module.exports = function localTelegram({ firebaseConfig, fetchImpl = fetch, botToken: paramBotToken }) {
  const botUsername = process.env.VITE_TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'noviqq_bot';
  const botToken = paramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

  // Helper to verify Firebase ID token
  async function verifyAuth(req) {
    const authHeader = req.headers.authorization || '';
    const token = /^Bearer (\S+)$/.exec(authHeader)?.[1];
    if (!token) return null;

    if (token === 'local-dev-mock-token' && process.env.NODE_ENV !== 'production') {
      return { uid: 'student-local-test', email: 'student@noviqq.uz', token };
    }

    try {
      const resp = await fetchImpl(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
          signal: AbortSignal.timeout(8000),
        }
      );
      const data = await resp.json();
      const identity = data.users?.[0];
      if (!resp.ok || !identity?.localId || identity.disabled) return null;
      return { uid: identity.localId, email: identity.email, token };
    } catch {
      return null;
    }
  }

  // Firestore REST helpers
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents`;

  async function getFirestoreDoc(path, token) {
    const resp = await fetchImpl(`${firestoreBase}/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return decodeFields(json.fields || {});
  }

  async function patchFirestoreDoc(path, fields, token) {
    const maskParams = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const url = `${firestoreBase}/${path}?${maskParams}`;
    const body = {
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)])),
    };
    return fetchImpl(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  }

  async function sendTelegramMsg(chatId, text, extra = {}) {
    if (!botToken) {
      console.log(`[local-telegram-mock] -> Send to ${chatId}: ${text}`);
      return { ok: true, mock: true };
    }
    try {
      const resp = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, ...extra }),
      });
      return await resp.json();
    } catch (err) {
      console.warn('[local-telegram-send-error]', err.message);
      return { ok: false, error: err.message };
    }
  }

  return async (req, res, next) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const path = parsedUrl.pathname;

    const isRpc = path === '/api/rpc';
    const rpcName = parsedUrl.searchParams.get('name');

    // Only intercept /api/telegram/* or /api/rpc with telegram functions
    const isTelegramEndpoint =
      path.startsWith('/api/telegram') ||
      (isRpc && ['createTelegramLink', 'disconnectTelegram', 'sendTelegramTestMessage'].includes(rpcName));

    if (!isTelegramEndpoint) return next();

    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };

    // Read JSON body
    let body = {};
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      try {
        let raw = '';
        for await (const chunk of req) raw += chunk.toString();
        if (raw) body = JSON.parse(raw);
      } catch {
        return send(400, { error: 'Invalid JSON payload' });
      }
    }

    // 1. LINK TOKEN GENERATION
    if (path === '/api/telegram/link-token' || (isRpc && rpcName === 'createTelegramLink')) {
      const user = await verifyAuth(req);
      if (!user) return send(401, { error: { status: 'UNAUTHENTICATED', message: 'Sign in first.' } });

      const token = randomBytes(24).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      localLinkTokens.set(token, { userId: user.uid, expiresAt });

      let userProfile = null;
      try {
        userProfile = await getFirestoreDoc(`users/${user.uid}`, user.token);
      } catch (err) {
        console.warn('[local-telegram] Could not fetch Firestore user doc:', err.message);
      }

      const displayName = userProfile?.displayName || userProfile?.name || user.email?.split('@')[0] || 'NOVIQ Student';
      const streak = Number(userProfile?.streak) || 0;
      const xp = Number(userProfile?.xp) || 0;
      const level = Number(userProfile?.level) || 1;
      const levelName = userProfile?.levelName || 'Beginner';
      const dailyTargetMinutes = Number(userProfile?.dailyTargetMinutes) || 30;
      const subscription = userProfile?.subscription || { plan: 'free', status: 'inactive' };

      // Pre-seed into local db so user document exists
      try {
        await db.collection('auth_accounts').updateOne(
          { _id: user.uid },
          {
            $set: {
              _id: user.uid,
              email: user.email,
              displayName,
              updatedAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        );
        await db.collection('users').updateOne(
          { _id: user.uid },
          {
            $set: {
              _id: user.uid,
              email: user.email,
              displayName,
              streak,
              xp,
              level,
              levelName,
              dailyTargetMinutes,
              subscription,
              updatedAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        );

        await db.collection('telegram_link_tokens').deleteMany({ userId: user.uid });
        await db.collection('telegram_link_tokens').insertOne({
          _id: tokenHash,
          token,
          userId: user.uid,
          displayName,
          email: user.email,
          userProfile: {
            displayName,
            streak,
            xp,
            level,
            levelName,
            dailyTargetMinutes,
            subscription,
          },
          expiresAt: expiresAt.toISOString(),
          used: false,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('[local-telegram] Error saving token to shared db:', err.message);
      }

      const deepLink = `https://t.me/${botUsername}?start=link_${token}`;
      console.log(`[local-telegram] Generated link token for ${user.uid}: ${token}`);
      console.log(`[local-telegram] Deep Link: ${deepLink}`);

      if (isRpc) {
        return send(200, { result: { token, botUsername, deepLink, expiresAt: expiresAt.toISOString() } });
      }
      return send(200, { token, botUsername, deepLink, expiresAt: expiresAt.toISOString() });
    }

    // 2. DISCONNECT TELEGRAM
    if (path === '/api/telegram/disconnect' || (isRpc && rpcName === 'disconnectTelegram')) {
      const user = await verifyAuth(req);
      if (!user) return send(401, { error: { status: 'UNAUTHENTICATED', message: 'Sign in first.' } });

      // Remove from local memory
      for (const [cid, u] of localLinkedUsers.entries()) {
        if (u.userId === user.uid) localLinkedUsers.delete(cid);
      }

      // Remove from shared DB
      try {
        await db.collection('auth_accounts').updateOne({ _id: user.uid }, { $unset: { telegramId: 1, telegramUsername: 1 } });
        await db.collection('users').updateOne({ _id: user.uid }, { $unset: { telegramId: 1, telegramUsername: 1 } });
        await db.collection('telegram_link_tokens').deleteMany({ userId: user.uid });
      } catch (err) {
        console.warn('[local-telegram] Shared DB unbind error:', err.message);
      }

      // Remove from Firestore
      try {
        await patchFirestoreDoc(`users/${user.uid}`, { telegramId: '', telegramUsername: '' }, user.token);
      } catch (err) {
        console.warn('[local-telegram] Firestore unbind error:', err.message);
      }

      console.log(`[local-telegram] Disconnected Telegram for ${user.uid}`);
      if (isRpc) {
        return send(200, { result: { ok: true, disconnected: true } });
      }
      return send(200, { ok: true, disconnected: true });
    }

    // 3. SEND TEST MESSAGE
    if (isRpc && rpcName === 'sendTelegramTestMessage') {
      const user = await verifyAuth(req);
      if (!user) return send(401, { error: { status: 'UNAUTHENTICATED', message: 'Sign in first.' } });

      const profile = (await getFirestoreDoc(`users/${user.uid}`, user.token)) || {};
      let chatId = profile.telegramId;
      if (!chatId) {
        const acc = await db.collection('auth_accounts').findOne({ _id: user.uid });
        chatId = acc?.telegramId;
      }
      if (!chatId) {
        const u = await db.collection('users').findOne({ _id: user.uid });
        chatId = u?.telegramId;
      }
      if (!chatId) {
        return send(400, { error: { status: 'FAILED_PRECONDITION', message: 'Telegram chat ID not found.' } });
      }

      await sendTelegramMsg(chatId, "🎉 NOVIQ Telegram ulandi! Test xabari muvaffaqiyatli yetib keldi.");
      return send(200, { result: { ok: true, chatId } });
    }

    // 4. TELEGRAM STATUS
    if (path === '/api/telegram/status') {
      const user = await verifyAuth(req);
      if (!user) return send(401, { error: 'Authentication required' });

      let linkedChatId = null;
      for (const [cid, u] of localLinkedUsers.entries()) {
        if (u.userId === user.uid) linkedChatId = cid;
      }
      if (!linkedChatId) {
        const acc = await db.collection('auth_accounts').findOne({ _id: user.uid });
        if (acc?.telegramId) linkedChatId = acc.telegramId;
      }
      if (!linkedChatId) {
        const u = await db.collection('users').findOne({ _id: user.uid });
        if (u?.telegramId) linkedChatId = u.telegramId;
      }
      return send(200, {
        connected: Boolean(linkedChatId),
        telegramId: linkedChatId,
        botUsername,
      });
    }

    // 5. TELEGRAM WEBHOOK / LOCAL BOT ENGINE
    if (path === '/api/telegram/webhook' || path === '/api/telegram') {
      // Secret token check if configured
      if (webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
        return send(401, { error: 'Unauthorized webhook secret.' });
      }

      const update = body;
      const updateId = String(update.update_id || '');
      if (updateId && localProcessedUpdates.has(updateId)) {
        return send(200, { ok: true, duplicate: true });
      }
      if (updateId) localProcessedUpdates.add(updateId);

      // Handle callback queries (button clicks)
      if (update.callback_query) {
        const cb = update.callback_query;
        const chatId = cb.message?.chat?.id;
        const data = String(cb.data || '');
        const linked = localLinkedUsers.get(String(chatId));

        if (data.startsWith('switch_confirm:')) {
          const actionKey = data.slice('switch_confirm:'.length);
          const idStr = String(chatId);

          let tokenHash = actionKey;
          let targetUserId = null;
          let actionRecord = await db.collection('telegram_switch_actions').findOne({ _id: actionKey });

          if (actionRecord) {
            if (actionRecord.used || new Date(actionRecord.expiresAt) <= new Date() || String(actionRecord.chatId) !== idStr) {
              await sendTelegramMsg(chatId, `⚠️ Ulash havolasi yaroqsiz yoki muddati o'tgan.`);
              return send(200, { ok: true, switched: false });
            }
            tokenHash = actionRecord.tokenHash;
            targetUserId = actionRecord.targetUserId;
          }

          const record = await db.collection('telegram_link_tokens').findOne({ _id: tokenHash });
          if (record && !record.used && new Date(record.expiresAt) > new Date() && (!targetUserId || record.userId === targetUserId)) {
            targetUserId = record.userId;

            // 1. Mark action record used
            if (actionRecord) {
              await db.collection('telegram_switch_actions').updateOne(
                { _id: actionRecord._id },
                { $set: { used: true, usedAt: new Date().toISOString() } }
              );
            }

            // 2. Unlink any other user
            for (const [cid, u] of localLinkedUsers.entries()) {
              if (cid === idStr && u.userId !== targetUserId) localLinkedUsers.delete(cid);
            }
            await db.collection('auth_accounts').updateMany(
              { telegramId: idStr, _id: { $ne: targetUserId } },
              { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } }
            );
            await db.collection('users').updateMany(
              { telegramId: idStr, _id: { $ne: targetUserId } },
              { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } }
            );

            // 3. Bind target user
            localLinkedUsers.set(idStr, { userId: targetUserId, username: cb.from?.username || '' });
            await db.collection('auth_accounts').updateOne({ _id: targetUserId }, { $set: { telegramId: idStr } }, { upsert: true });
            await db.collection('users').updateOne({ _id: targetUserId }, { $set: { telegramId: idStr } }, { upsert: true });
            await db.collection('telegram_link_tokens').updateOne({ _id: tokenHash }, { $set: { used: true, usedAt: new Date().toISOString() } });

            const targetUserDoc = await db.collection('users').findOne({ _id: targetUserId });
            const displayName = targetUserDoc?.displayName || 'NOVIQ Student';

            await sendTelegramMsg(
              chatId,
              `✅ <b>Hisob muvaffaqiyatli almashtirildi!</b>\n\nTelegram endi <b>${displayName}</b> profilingizga ulandi.\nEski hisobingiz uzildi (barcha ma'lumotlari saqlandi).`,
              { parse_mode: 'HTML' }
            );
            return send(200, { ok: true, switched: true });
          } else {
            await sendTelegramMsg(chatId, `⚠️ Ulash havolasi yaroqsiz yoki muddati o'tgan.`);
            return send(200, { ok: true, switched: false });
          }
        }

        if (data === 'switch_cancel' || data.startsWith('switch_cancel:')) {
          if (data.startsWith('switch_cancel:')) {
            const actionId = data.slice('switch_cancel:'.length);
            if (actionId) {
              await db.collection('telegram_switch_actions').updateOne(
                { _id: actionId, chatId: String(chatId) },
                { $set: { used: true, cancelled: true, cancelledAt: new Date().toISOString() } }
              );
            }
          }
          await sendTelegramMsg(chatId, `❌ Hisobni almashtirish bekor qilindi. Telegram joriy profilingizda qoldi.`);
          return send(200, { ok: true, cancelled: true });
        }

        if (data.startsWith('task_done:')) {
          const taskId = data.slice('task_done:'.length);
          await sendTelegramMsg(chatId, `✅ Vazifa muvaffaqiyatli bajarildi! (+20 XP qo'shildi 🎉)`);
          return send(200, { ok: true, taskCompleted: taskId });
        }
        if (data === 'unlink_confirm') {
          const idStr = String(chatId);
          localLinkedUsers.delete(idStr);
          await db.collection('auth_accounts').updateMany({ telegramId: idStr }, { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } });
          await db.collection('users').updateMany({ telegramId: idStr }, { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } });
          await sendTelegramMsg(chatId, `👋 Telegram hisobingiz NOVIQ dan uzildi.`);
          return send(200, { ok: true, unlinked: true });
        }
        await sendTelegramMsg(chatId, `Amal bajarildi: ${data}`);
        return send(200, { ok: true });
      }

      const message = update.message || update.edited_message;
      if (!message) return send(200, { ok: true, ignored: true });

      const chatId = String(message.chat?.id || '');
      const text = String(message.text || '').trim();

      // Check /start link_<token>
      const startMatch = text.match(/^\/start(?:\s+(.+))?$/i);
      if (startMatch) {
        const payload = (startMatch[1] || '').trim().replace(/^link_/, '');
        if (payload && /^[a-f0-9]{48}$/.test(payload)) {
          const tokenHash = createHash('sha256').update(payload).digest('hex');
          const tokenRecord = (await db.collection('telegram_link_tokens').findOne({ _id: tokenHash })) || localLinkTokens.get(payload);

          if (tokenRecord && !tokenRecord.used && new Date(tokenRecord.expiresAt) > new Date()) {
            const targetUserId = tokenRecord.userId;

            // Check if chatId is currently bound to another account (Account A)
            let existingUserId = localLinkedUsers.get(chatId)?.userId;
            if (!existingUserId) {
              const existingAcc = await db.collection('auth_accounts').findOne({ telegramId: chatId });
              if (existingAcc) existingUserId = existingAcc._id;
            }

            if (existingUserId && existingUserId !== targetUserId) {
              const oldDoc = await db.collection('users').findOne({ _id: existingUserId });
              const oldName = oldDoc?.displayName || 'Eski hisob';
              const targetDoc = await db.collection('users').findOne({ _id: targetUserId });
              const newName = targetDoc?.displayName || 'Yangi hisob';

              const actionId = randomBytes(16).toString('hex');
              const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
              await db.collection('telegram_switch_actions').insertOne({
                _id: actionId,
                action: 'switch_confirm',
                targetUserId,
                chatId: String(chatId),
                tokenHash,
                createdAt: new Date().toISOString(),
                expiresAt,
                used: false,
              });

              await sendTelegramMsg(
                chatId,
                `⚠️ <b>Diqqat: Hisobni almashtirish</b>\n\nBu Telegram hisob hozirda boshqa NOVIQ profilingizga (<b>${oldName}</b>) ulangan.\n\nUni yangi profilingizga (<b>${newName}</b>) ulamoqchimisiz?\n\nℹ️ <i>Eski hisobingiz (${oldName}) uziladi, ammo undagi barcha ballar (XP), seriya va o'qish rejalari to'liq saqlanadi.</i>`,
                {
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: `🔄 Ha, hisobni almashtirish (${newName})`, callback_data: `switch_confirm:${actionId}` }],
                      [{ text: '❌ Bekor qilish', callback_data: `switch_cancel:${actionId}` }],
                    ],
                  },
                }
              );
              return send(200, { ok: true, switchConfirmationRequired: true, actionId });
            }

            // Normal link (not linked to another account)
            localLinkTokens.delete(payload);
            await db.collection('telegram_link_tokens').updateOne({ _id: tokenHash }, { $set: { used: true } });

            // Revoke any other account bound to this chatId
            await db.collection('auth_accounts').updateMany(
              { telegramId: chatId, _id: { $ne: targetUserId } },
              { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } }
            );
            await db.collection('users').updateMany(
              { telegramId: chatId, _id: { $ne: targetUserId } },
              { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } }
            );

            localLinkedUsers.set(chatId, { userId: targetUserId, username: message.from?.username || '' });
            await db.collection('auth_accounts').updateOne({ _id: targetUserId }, { $set: { telegramId: chatId } }, { upsert: true });
            await db.collection('users').updateOne({ _id: targetUserId }, { $set: { telegramId: chatId } }, { upsert: true });

            console.log(`[local-telegram] Successfully linked ${chatId} to user ${targetUserId}`);
            await sendTelegramMsg(
              chatId,
              `🎉 <b>Xush kelibsiz!</b>\n\nSizning NOVIQ profilingiz Telegram botga muvaffaqiyatli ulandi!\n\n📋 /planner — Bugungi vazifalar\n🗓 /today — Dars jadvali\n⏱ /focus — Diqqat taymeri\n📊 /metrics — Sizning natijalaringiz\n⚙️ /settings — Sozlamalar`,
              { parse_mode: 'HTML' }
            );
            return send(200, { ok: true, linked: true, userId: targetUserId });
          } else {
            await sendTelegramMsg(
              chatId,
              `⚠️ <b>Ulash havolasi yaroqsiz yoki muddati o'tgan.</b>\n\nIltimos, NOVIQ profilingizga kiring va yangi havola oling.\n\n🌐 Profil: ${getProfileUrl()}`,
              { parse_mode: 'HTML' }
            );
            return send(200, { ok: true, linked: false });
          }
        }
      }

      const linked = localLinkedUsers.get(chatId);
      if (!linked) {
        await sendTelegramMsg(
          chatId,
          `👋 <b>Assalomu alaykum!</b>\n\nNOVIQ botidan foydalanish uchun avval profilingizni ulang.\n\n🌐 Saytga kiring: <b>${getProfileUrl()}</b>\nU yerda <b>Connect Telegram</b> tugmasini bosing!`,
          { parse_mode: 'HTML' }
        );
        return send(200, { ok: true, unlinked: true });
      }

      const cmd = text.split(/\s/)[0].toLowerCase();
      if (cmd === '/planner' || cmd === '/today') {
        await sendTelegramMsg(
          chatId,
          `📋 <b>Bugungi o'qish rejalari:</b>\n\n1. ⏳ <b>Matematika misollar</b> (25 min)\n2. ⏳ <b>Ingliz tili lug'at</b> (30 min)\n\nVazifani yakunlagach, quyidagi tugmani bosing:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Matematika bajarildi', callback_data: 'task_done:math-1' }],
                [{ text: '✅ Lug\'at bajarildi', callback_data: 'task_done:eng-1' }],
              ],
            },
          }
        );
        return send(200, { ok: true, command: cmd });
      }

      if (cmd === '/focus') {
        await sendTelegramMsg(
          chatId,
          `⏱ <b>Fokus Taymeri</b>\n\nChalg'imasdan o'qish uchun fokus sessiyasini boshlang:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '▶️ 25 daqiqa (Pomodoro)', callback_data: 'focus:start:25' }],
                [{ text: '▶️ 45 daqiqa (Chuqur fokus)', callback_data: 'focus:start:45' }],
              ],
            },
          }
        );
        return send(200, { ok: true, command: '/focus' });
      }

      if (cmd === '/metrics') {
        await sendTelegramMsg(
          chatId,
          `📊 <b>Sizning NOVIQ natijalaringiz:</b>\n\n🔥 <b>Seriya:</b> 7 kun\n⚡️ <b>XP:</b> 540 XP\n⏱ <b>Bugungi o'qish:</b> 45 daqiqa\n🎯 <b>Kunlik maqsad:</b> 30 min (Bajarildi!)`,
          { parse_mode: 'HTML' }
        );
        return send(200, { ok: true, command: '/metrics' });
      }

      if (cmd === '/help') {
        await sendTelegramMsg(
          chatId,
          `ℹ️ <b>Mavjud buyruqlar:</b>\n/planner — Kunlik vazifalar\n/today — O'qish jadvali\n/focus — Fokus taymeri\n/metrics — Natijalar va XP\n/reminders — Eslatmalar sozlamalari\n/settings — Hisobni boshqarish`,
          { parse_mode: 'HTML' }
        );
        return send(200, { ok: true, command: '/help' });
      }

      if (cmd === '/settings') {
        await sendTelegramMsg(
          chatId,
          `⚙️ <b>Telegram Sozlamalari</b>\n\nUlangan hisob: <code>${linked.userId}</code>\nBildirishnomalar: Faol ✅`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Hisobni uzish', callback_data: 'unlink_confirm' }],
              ],
            },
          }
        );
        return send(200, { ok: true, command: '/settings' });
      }

      await sendTelegramMsg(chatId, `Buyruq qabul qilindi: ${text}\nYordam uchun: /help`);
      return send(200, { ok: true });
    }

    return next();
  };
};
