import { createHash, randomBytes } from 'node:crypto';
import dns from 'node:dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import {
  getAppUrl,
  getAppRouteUrl,
  getProfileUrl,
  getPlannerUrl,
  getFocusUrl,
  getFlashcardsUrl,
  getPricingUrl,
  getMetricsUrl,
  getAppHost,
} from './appUrl.mjs';

export const DEFAULT_TIMEZONE = 'Asia/Tashkent';

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function formatTimeInZone(timestamp, timezone = DEFAULT_TIMEZONE) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(timestamp));
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: DEFAULT_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(timestamp));
  }
}

export function getTodayKey(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(date));
    const find = (type) => parts.find((p) => p.type === type)?.value;
    return `${find('year')}-${find('month')}-${find('day')}`;
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

export function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildBotTexts(env = process.env) {
  const host = getAppHost(env);
  const pricingUrl = getPricingUrl(env);

  return {
    uz: {
      welcomeNew: `🎓 <b>NOVIQ ta'lim platformasiga xush kelibsiz!</b>

NOVIQ — talabalar va o'quvchilar uchun aqlli ta'lim super-ilovasi:
• 📅 <b>Smart Planner</b> — AI yordamida tuzilgan kunlik vazifalar
• 🎯 <b>Focus Timer</b> — Pomodoro va chuqur diqqat taymeri
• 🃏 <b>Flashcards</b> — Intervalli takrorlash fleshkardlari
• 📊 <b>Analytics</b> — O'qish ko'rsatkichlari, XP va seriyalar
• 🤖 <b>AI Tutor</b> — Har qanday fandan shaxsiy murabbiy

Profilingizni ulash uchun NOVIQ veb-saytidagi <b>Profile</b> bo'limidan <b>"Botni ulash"</b> tugmasini bosing.`,
      welcomeLinked: (name, streak, xp) => `🎓 <b>Salom, ${escapeHtml(name)}!</b>

NOVIQ hisobingiz muvaffaqiyatli ulangan!
🔥 Seriya: <b>${streak} kun</b> | ⚡️ XP: <b>${xp}</b>

Quyidagi menyu orqali darslaringizni boshqarishingiz mumkin:`,
      linkSuccess: (name) => `✅ <b>Muvaffaqiyatli ulandi!</b>

Assalomu alaykum, <b>${escapeHtml(name)}</b>! Sizning NOVIQ profilingiz Telegram botga ulandi.
Endi kunlik vazifalar, dars eslatmalari va o'qish xulosalari shu yerga yuboriladi.`,
      linkExpired: `⚠️ <b>Ulanish havolasi eskirgan yoki yaroqsiz.</b>

Iltimos, NOVIQ veb-saytidagi <b>Profile</b> sahifasiga o'tib, yangi ulanish havolasini oling. Havola 10 daqiqa amal qiladi.`,
      unlinkedPrompt: `⚠️ <b>Hisobingiz ulanmagan.</b>

NOVIQ botidan to'liq foydalanish uchun, iltimos, saytdagi <b>Profile</b> bo'limiga kirib Telegram botni ulang.`,
      plannerEmpty: `📅 <b>Bugungi vazifalar</b>

Bugun uchun hali rejalashtirilgan vazifalar yo'q.
Saytga kirib <b>Smart Planner</b> orqali kunlik dars jadvalingizni tuzishingiz mumkin.`,
      plannerTitle: (dateKey, completed, total) => `📅 <b>Bugungi vazifalar (${dateKey})</b>
Bajarildi: <b>${completed}/${total}</b> ta vazifa\n`,
      todayScheduleTitle: (dateKey) => `🗓 <b>Bugungi o'qish jadvali (${dateKey})</b>\n`,
      focusTitle: (todayMinutes, goalMinutes, active) => `🎯 <b>Focus Timer (Diqqat taymeri)</b>

Bugungi o'qish vaqti: <b>${todayMinutes} daqiqa</b> (Maqsad: ${goalMinutes} daq)
Holat: ${active ? '🟢 <b>Fokus sessiyasi davom etmoqda...</b>' : '⚪️ Taymer to\'xtatilgan'}`,
      focusStarted: `▶️ <b>25 daqiqalik fokus sessiyasi boshlandi!</b>\n\nChalg'imasdan darsga diqqat qarating. Sessiyani yakunlash uchun quyidagi tugmani bosing.`,
      focusEnded: (minutes, xp) => `⏹ <b>Fokus sessiyasi yakunlandi!</b>\n\nQayd etilgan vaqt: <b>${minutes} daqiqa</b> (+${xp} XP)`,
      flashcardsEmpty: `🃏 <b>Fleshkardlar</b>\n\nSizda hali fleshkard to'plamlari mavjud emas. NOVIQ veb-saytida yangi to'plam yarating!`,
      flashcardsTitle: (count) => `🃏 <b>Sizning fleshkard to'plamlaringiz (${count} ta):</b>\n`,
      metricsTitle: (user, stats) => `📊 <b>Sizning NOVIQ natijalaringiz</b>

👤 Talaba: <b>${escapeHtml(user.displayName || 'NOVIQ Talaba')}</b>
⭐️ Daraja: <b>${escapeHtml(user.levelName || 'Boshlang\'ich')}</b> (${user.level || 1}-daraja)
⚡️ Umumiy XP: <b>${user.xp || 0} XP</b>
🔥 Joriy seriya: <b>${user.streak || 0} kun</b>
⏱ Bugungi fokus: <b>${stats.todayMinutes || 0} daqiqa</b>
🎯 Kunlik maqsad: <b>${user.dailyTargetMinutes || 30} daqiqa</b>
✅ Bugun bajarilgan vazifalar: <b>${stats.todayCompletedTasks || 0} ta</b>
💳 Obuna: <b>${user.subscription?.plan === 'pro' && ['active', 'trialing'].includes(user.subscription?.status) ? 'PRO ⭐️' : 'Bepul (Free)'}</b>`,
      remindersTitle: (prefs) => `🔔 <b>Telegram eslatmalari sozlamalari</b>

Dars vaqtlari va kunlik hisobotlar bo'yicha xabarnomalarni sozlang:`,
      settingsTitle: (user) => `⚙️ <b>Sozlamalar va hisob holati</b>

👤 Ism: <b>${escapeHtml(user.displayName || 'NOVIQ Talaba')}</b>
📧 Email: <b>${escapeHtml(user.email || 'Bog\'lanmagan')}</b>
🕒 Vaqt mintaqasi: <b>${user.timezone || DEFAULT_TIMEZONE}</b>
💳 Obuna rejasi: <b>${user.subscription?.plan === 'pro' && ['active', 'trialing'].includes(user.subscription?.status) ? 'NOVIQ PRO ⭐️' : 'NOVIQ Free'}</b>
🆔 Telegram ID: <code>${user.telegramId}</code>`,
      helpText: `ℹ️ <b>NOVIQ Bot buyruqlari</b>

/start — Botni ishga tushirish va asosiy menyu
/planner — Bugungi vazifalar ro'yxati va ularni bajarish
/today — Bugungi dars jadvali va muddatlar
/focus — Fokus taymeri (Pomodoro)ni boshqarish
/flashcards — Fleshkardlar to'plamini ko'rish
/metrics — Shaxsiy natijalar, XP va seriya statistikasi
/reminders — Eslatma va xabarnomalarni sozlash
/settings — Hisob sozlamalari va Telegramni uzish
/help — Qo'llanma va buyruqlar haqida ma'lumot

Qo'llab-quvvatlash: @noviq_support | Sayt: ${host}`,
      unlinkedSuccess: `👋 <b>Hisob muvaffaqiyatli uzildi.</b>

Telegram profilingiz NOVIQ hisobidan uzildi. Qayta ulash uchun veb-sayt orqali bog'lanishingiz mumkin.`,
      proExclusiveNotice: `⭐️ <b>Ushbu imkoniyat faqat NOVIQ PRO a'zolari uchun!</b>

PRO obunaga o'ting va cheksiz AI murabbiy, batafsil tahlillar va premium imkoniyatlardan foydalaning:
${pricingUrl}`,
    },
    en: {
      welcomeNew: `🎓 <b>Welcome to NOVIQ!</b>

NOVIQ is your all-in-one educational productivity platform:
• 📅 <b>Smart Planner</b> — AI-powered daily study scheduling
• 🎯 <b>Focus Timer</b> — Deep work and Pomodoro tracking
• 🃏 <b>Flashcards</b> — Spaced repetition memory decks
• 📊 <b>Analytics</b> — Real XP, study metrics, and streaks
• 🤖 <b>AI Tutor</b> — 24/7 personal academic mentor

To connect your account, click <b>"Connect bot"</b> in the <b>Profile</b> section of the NOVIQ website.`,
      welcomeLinked: (name, streak, xp) => `🎓 <b>Hello, ${escapeHtml(name)}!</b>

Your NOVIQ account is connected.
🔥 Streak: <b>${streak} days</b> | ⚡️ XP: <b>${xp}</b>

Use the menu below to navigate your study tools:`,
      linkSuccess: (name) => `✅ <b>Account successfully linked!</b>

Welcome, <b>${escapeHtml(name)}</b>! Your NOVIQ profile is now linked to Telegram.
Daily tasks, reminders, and study summaries will be sent directly here.`,
      linkExpired: `⚠️ <b>Linking link is invalid or expired.</b>

Please return to your <b>Profile</b> on the NOVIQ website and generate a new connection link. Tokens expire after 10 minutes.`,
      unlinkedPrompt: `⚠️ <b>Account not connected.</b>

To access your study planner and metrics, connect your account from the <b>Profile</b> page on the NOVIQ website.`,
      plannerEmpty: `📅 <b>Today's Tasks</b>

No tasks scheduled for today yet.
Visit the website to generate or add study tasks in your <b>Smart Planner</b>.`,
      plannerTitle: (dateKey, completed, total) => `📅 <b>Today's Tasks (${dateKey})</b>
Completed: <b>${completed}/${total}</b> tasks\n`,
      todayScheduleTitle: (dateKey) => `🗓 <b>Today's Study Schedule (${dateKey})</b>\n`,
      focusTitle: (todayMinutes, goalMinutes, active) => `🎯 <b>Focus Timer</b>

Today's study time: <b>${todayMinutes} min</b> (Daily goal: ${goalMinutes} min)
Status: ${active ? '🟢 <b>Focus session in progress...</b>' : '⚪️ Timer idle'}`,
      focusStarted: `▶️ <b>25-minute focus session started!</b>\n\nStay distraction-free. Tap Stop when finished.`,
      focusEnded: (minutes, xp) => `⏹ <b>Focus session completed!</b>\n\nLogged duration: <b>${minutes} minutes</b> (+${xp} XP)`,
      flashcardsEmpty: `🃏 <b>Flashcards</b>\n\nYou don't have any flashcard decks yet. Create your first deck on the NOVIQ web app!`,
      flashcardsTitle: (count) => `🃏 <b>Your Flashcard Decks (${count}):</b>\n`,
      metricsTitle: (user, stats) => `📊 <b>Your NOVIQ Analytics</b>

👤 Student: <b>${escapeHtml(user.displayName || 'NOVIQ Student')}</b>
⭐️ Level: <b>${escapeHtml(user.levelName || 'Beginner')}</b> (Level ${user.level || 1})
⚡️ Total XP: <b>${user.xp || 0} XP</b>
🔥 Streak: <b>${user.streak || 0} days</b>
⏱ Focus time today: <b>${stats.todayMinutes || 0} min</b>
🎯 Daily target: <b>${user.dailyTargetMinutes || 30} min</b>
✅ Tasks completed today: <b>${stats.todayCompletedTasks || 0}</b>
💳 Plan: <b>${user.subscription?.plan === 'pro' && ['active', 'trialing'].includes(user.subscription?.status) ? 'PRO ⭐️' : 'Free'}</b>`,
      remindersTitle: (prefs) => `🔔 <b>Telegram Notification Preferences</b>

Manage automated study alerts and summaries:`,
      settingsTitle: (user) => `⚙️ <b>Settings & Account Details</b>

👤 Name: <b>${escapeHtml(user.displayName || 'NOVIQ Student')}</b>
📧 Email: <b>${escapeHtml(user.email || 'Not connected')}</b>
🕒 Timezone: <b>${user.timezone || DEFAULT_TIMEZONE}</b>
💳 Subscription: <b>${user.subscription?.plan === 'pro' && ['active', 'trialing'].includes(user.subscription?.status) ? 'NOVIQ PRO ⭐️' : 'NOVIQ Free'}</b>
🆔 Telegram ID: <code>${user.telegramId}</code>`,
      helpText: `ℹ️ <b>NOVIQ Bot Commands</b>

/start — Start the bot and view main menu
/planner — View today's tasks and mark them complete
/today — View today's study schedule and deadlines
/focus — Start or stop a focus session
/flashcards — View your flashcard decks
/metrics — View real progress statistics and streaks
/reminders — Configure reminder preferences
/settings — View account settings and unlink
/help — Show commands and help

Support: @noviq_support | Website: ${host}`,
      unlinkedSuccess: `👋 <b>Account successfully unlinked.</b>

Your Telegram account has been disconnected from NOVIQ. You can reconnect anytime through the website.`,
      proExclusiveNotice: `⭐️ <b>This feature is exclusive to NOVIQ PRO members!</b>

Upgrade to PRO to unlock advanced AI tutoring, unlimited decks, and in-depth performance analytics:
${pricingUrl}`,
    },
  };
}

export const BOT_TEXTS = buildBotTexts();

export function getCopy(locale = 'uz', env = process.env) {
  const texts = buildBotTexts(env);
  return texts[locale] || texts.uz;
}

export function isValidTelegramButtonUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('tg://')) return true;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1') {
      return false;
    }
    return hostname.includes('.');
  } catch {
    return false;
  }
}

export function makeSafeUrlButton(text, url, fallbackCallbackData = 'menu:url:web') {
  if (isValidTelegramButtonUrl(url)) {
    return { text, url };
  }
  return { text, callback_data: fallbackCallbackData };
}

export function buildMainMenuKeyboard(locale = 'uz', env = process.env) {
  const isUz = locale === 'uz';
  const webUrl = getAppUrl(env);
  return {
    inline_keyboard: [
      [
        { text: isUz ? '📅 Planner' : '📅 Planner', callback_data: 'menu:planner' },
        { text: isUz ? '🎯 Focus' : '🎯 Focus', callback_data: 'menu:focus' },
      ],
      [
        { text: isUz ? '📊 Natijalar' : '📊 Metrics', callback_data: 'menu:metrics' },
        { text: isUz ? '🃏 Fleshkardlar' : '🃏 Flashcards', callback_data: 'menu:flashcards' },
      ],
      [
        { text: isUz ? '🔔 Eslatmalar' : '🔔 Reminders', callback_data: 'menu:reminders' },
        { text: isUz ? '⚙️ Sozlamalar' : '⚙️ Settings', callback_data: 'menu:settings' },
      ],
      [
        makeSafeUrlButton(isUz ? '🌐 Saytga o\'tish' : '🌐 Open NOVIQ Web', webUrl, 'menu:url:web'),
      ],
    ],
  };
}

export class TelegramBotService {
  constructor({ token, botUsername = 'noviqq_bot', webhookSecret = '', fetchImpl = fetch }) {
    this.token = token;
    this.botUsername = botUsername;
    this.webhookSecret = webhookSecret;
    this.fetch = fetchImpl;
  }

  async callApi(method, payload = {}, { timeoutMs } = {}) {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
    const pollTimeout = method === 'getUpdates' && typeof payload.timeout === 'number'
      ? (payload.timeout * 1000) + 15000
      : 30000;
    const effectiveTimeout = timeoutMs || pollTimeout;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await this.fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'close',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(effectiveTimeout),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          const desc = result?.description || `HTTP ${response.status}`;
          throw new Error(`Telegram API [${method}] failed: ${desc}`);
        }
        return result.result;
      } catch (error) {
        if (attempt < 2 && (error.name === 'TypeError' || error.message?.includes('fetch failed'))) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          throw new Error(`Telegram API [${method}] timed out after ${effectiveTimeout}ms. Check network connection to api.telegram.org:443.`);
        }
        throw error;
      }
    }
  }

  async sendMessage(chatId, text, options = {}) {
    return this.callApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options,
    });
  }

  async editMessageText(chatId, messageId, text, options = {}) {
    try {
      return await this.callApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options,
      });
    } catch (error) {
      if (String(error.message).includes('message is not modified')) return null;
      throw error;
    }
  }

  async answerCallbackQuery(callbackQueryId, options = {}) {
    return this.callApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...options,
    });
  }

  async getMe() {
    return this.callApi('getMe');
  }

  async getWebhookInfo() {
    return this.callApi('getWebhookInfo');
  }

  async deleteWebhook(dropPendingUpdates = false) {
    return this.callApi('deleteWebhook', { drop_pending_updates: dropPendingUpdates });
  }

  async getUpdates({ offset, limit = 50, timeout = 30, allowed_updates = ['message', 'callback_query'] } = {}) {
    return this.callApi('getUpdates', { offset, limit, timeout, allowed_updates });
  }

  async setWebhook(url, secretToken = this.webhookSecret) {
    return this.callApi('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
    });
  }
}

// -------------------------------------------------------------
// Database Access Helpers (MongoDB Atlas / In-Memory Mock)
// -------------------------------------------------------------

export async function findUserByTelegramId(db, telegramId) {
  const idStr = String(telegramId);
  const account = await db.collection('auth_accounts').findOne({ telegramId: idStr });
  if (account) {
    const userDoc = (await db.collection('users').findOne({ _id: account._id })) || {};
    return {
      uid: account._id,
      email: account.email || userDoc.email || '',
      displayName: account.displayName || userDoc.displayName || 'NOVIQ Student',
      telegramId: idStr,
      telegramUsername: account.telegramUsername || userDoc.telegramUsername || '',
      streak: Number(userDoc.streak ?? account.streak) || 0,
      xp: Number(userDoc.xp ?? account.xp) || 0,
      level: Number(userDoc.level ?? account.level) || 1,
      levelName: userDoc.levelName || account.levelName || 'Beginner',
      dailyTargetMinutes: Number(userDoc.dailyTargetMinutes ?? account.dailyTargetMinutes) || 30,
      timezone: userDoc.timezone || account.timezone || DEFAULT_TIMEZONE,
      subscription: userDoc.subscription || account.subscription || { plan: 'free', status: 'inactive' },
      settings: userDoc.settings || account.settings || {},
      reminders: account.telegramReminders || userDoc.telegramReminders || {
        studyReminders: true,
        dailyStreakSummary: true,
        taskDeadlines: true,
      },
      locale: account.telegramLocale || 'uz',
    };
  }

  // Fallback to direct 'users' collection
  const user = await db.collection('users').findOne({ telegramId: idStr });
  if (user) {
    return {
      uid: user._id,
      email: user.email || '',
      displayName: user.displayName || 'NOVIQ Student',
      telegramId: idStr,
      telegramUsername: user.telegramUsername || '',
      streak: Number(user.streak) || 0,
      xp: Number(user.xp) || 0,
      level: Number(user.level) || 1,
      levelName: user.levelName || 'Beginner',
      dailyTargetMinutes: Number(user.dailyTargetMinutes) || 30,
      timezone: user.timezone || DEFAULT_TIMEZONE,
      subscription: user.subscription || { plan: 'free', status: 'inactive' },
      settings: user.settings || {},
      reminders: user.telegramReminders || {
        studyReminders: true,
        dailyStreakSummary: true,
        taskDeadlines: true,
      },
      locale: user.telegramLocale || 'uz',
    };
  }
  return null;
}

export async function createLinkToken(db, userId) {
  const token = randomBytes(24).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 10 * 60000);

  // Invalidate older tokens for this user
  await db.collection('telegram_link_tokens').deleteMany({ userId });

  await db.collection('telegram_link_tokens').insertOne({
    _id: tokenHash,
    userId,
    expiresAt,
    used: false,
    createdAt: new Date(),
  });

  return { token, expiresAt };
}

export async function verifyAndLinkTelegram(db, token, telegramUser, chatId) {
  const tokenHash = hashToken(token);
  const now = new Date();

  const record = await db.collection('telegram_link_tokens').findOne({
    _id: tokenHash,
  });

  if (!record || !record.userId) return null;

  // Check if expired or already used
  const expiresAt = new Date(record.expiresAt);
  if (record.used || expiresAt <= now) {
    // If this chat is already linked to this exact account, return it
    const existing = await findUserByTelegramId(db, chatId);
    if (existing && existing.uid === record.userId) {
      return existing;
    }
    return null;
  }

  const userId = record.userId;
  const idStr = String(chatId);

  // Check if this Telegram chat is currently linked to a different account (Account A)
  const existing = await findUserByTelegramId(db, chatId);
  if (existing && existing.uid !== userId) {
    // Generate a secure, short-lived callback ID for the switch confirmation (< 64 bytes total callback_data)
    const actionId = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await db.collection('telegram_switch_actions').insertOne({
      _id: actionId,
      action: 'switch_confirm',
      targetUserId: userId,
      chatId: String(chatId),
      tokenHash,
      createdAt: now.toISOString(),
      expiresAt,
      used: false,
    });

    // Require explicit confirmation before replacing the existing binding
    return {
      switchConfirmationRequired: true,
      previousUser: existing,
      targetUserId: userId,
      tokenRecord: record,
      tokenHash,
      actionId,
    };
  }

  const nowIso = now.toISOString();

  // 1. Revoke any other accounts currently bound to this chatId
  await db.collection('auth_accounts').updateMany(
    { telegramId: idStr, _id: { $ne: userId } },
    { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } }
  );
  await db.collection('users').updateMany(
    { telegramId: idStr, _id: { $ne: userId } },
    { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } }
  );

  // 2. Mark token used immediately to prevent replay
  await db.collection('telegram_link_tokens').updateOne(
    { _id: tokenHash },
    { $set: { used: true, usedAt: nowIso, usedByChatId: idStr } }
  );

  const accountData = {
    _id: userId,
    uid: userId,
    telegramId: idStr,
    telegramUsername: telegramUser.username || '',
    telegramLinkedAt: nowIso,
    updatedAt: nowIso,
  };
  if (record.displayName) accountData.displayName = record.displayName;
  if (record.email) accountData.email = record.email;

  const userData = {
    _id: userId,
    uid: userId,
    telegramId: idStr,
    telegramUsername: telegramUser.username || '',
    telegramLinkedAt: nowIso,
    updatedAt: nowIso,
  };
  if (record.displayName) userData.displayName = record.displayName;
  if (record.email) userData.email = record.email;
  if (record.userProfile) Object.assign(userData, record.userProfile);

  // 3. Update/upsert target account
  await db.collection('auth_accounts').updateOne({ _id: userId }, { $set: accountData }, { upsert: true });
  await db.collection('users').updateOne({ _id: userId }, { $set: userData }, { upsert: true });

  return findUserByTelegramId(db, chatId);
}

export async function executeTelegramAccountSwitch(db, switchKey, telegramUser, chatId) {
  const now = new Date();
  const idStr = String(chatId);

  // 1. Look up action record in telegram_switch_actions (short callback ID)
  let actionRecord = await db.collection('telegram_switch_actions').findOne({ _id: switchKey });
  let tokenHash = null;
  let targetUserId = null;

  if (actionRecord) {
    // Validate action record
    if (actionRecord.used) return null;
    if (new Date(actionRecord.expiresAt) <= now) return null;
    if (String(actionRecord.chatId) !== idStr) return null; // Chat binding validation

    tokenHash = actionRecord.tokenHash;
    targetUserId = actionRecord.targetUserId;
  } else {
    // Direct tokenHash fallback (for tests or backward compatibility)
    tokenHash = switchKey;
  }

  const record = await db.collection('telegram_link_tokens').findOne({ _id: tokenHash });
  if (!record || !record.userId) return null;
  const expiresAt = new Date(record.expiresAt);
  if (record.used || expiresAt <= now) return null;
  if (targetUserId && record.userId !== targetUserId) return null;
  targetUserId = record.userId;

  const nowIso = now.toISOString();

  // 2. Mark action record used if present
  if (actionRecord) {
    await db.collection('telegram_switch_actions').updateOne(
      { _id: actionRecord._id },
      { $set: { used: true, usedAt: nowIso, usedByChatId: idStr } }
    );
  }

  // 3. Atomically revoke any other accounts currently bound to this chatId (e.g. Account A)
  // Account A keeps all XP, streak, planner, and profile data intact!
  await db.collection('auth_accounts').updateMany(
    { telegramId: idStr, _id: { $ne: targetUserId } },
    { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } }
  );
  await db.collection('users').updateMany(
    { telegramId: idStr, _id: { $ne: targetUserId } },
    { $unset: { telegramId: 1, telegramUsername: 1, telegramLinkedAt: 1 } }
  );

  // 4. Mark token used immediately to prevent replay
  await db.collection('telegram_link_tokens').updateOne(
    { _id: tokenHash },
    { $set: { used: true, usedAt: nowIso, usedByChatId: idStr } }
  );

  // 5. Bind target user (Account B)
  const accountPatch = {
    telegramId: idStr,
    telegramUsername: telegramUser.username || '',
    telegramLinkedAt: nowIso,
    updatedAt: nowIso,
  };
  await db.collection('auth_accounts').updateOne({ _id: targetUserId }, { $set: accountPatch }, { upsert: true });
  await db.collection('users').updateOne({ _id: targetUserId }, { $set: accountPatch }, { upsert: true });

  return findUserByTelegramId(db, chatId);
}

export async function unlinkTelegramUser(db, userId) {
  const unsetData = {
    telegramId: 1,
    telegramUsername: 1,
    telegramLinkedAt: 1,
  };
  await db.collection('auth_accounts').updateOne({ _id: userId }, { $unset: unsetData });
  await db.collection('users').updateOne({ _id: userId }, { $unset: unsetData });
  await db.collection('telegram_link_tokens').deleteMany({ userId });
  return true;
}

export async function fetchUserTasks(db, userId, dateKey) {
  // Try planner_plans collection
  let plan = await db.collection('planner_plans').findOne({ userId });
  if (!plan) {
    plan = await db.collection('planner_plans').findOne({ _id: userId });
  }

  // Fallback to migration_documents
  if (!plan) {
    const archive = await db.collection('migration_documents').findOne({ path: `users/${userId}/planner/smart-v2` });
    if (archive?.fieldsJson) {
      try {
        plan = JSON.parse(archive.fieldsJson);
      } catch {
        // ignore
      }
    }
  }

  if (!plan) {
    // Check legacy state format
    const legacyArchive = await db.collection('migration_documents').findOne({ path: `users/${userId}/planner/state` });
    if (legacyArchive?.fieldsJson) {
      try {
        const state = JSON.parse(legacyArchive.fieldsJson);
        const tasks = Array.isArray(state.tasks) ? state.tasks : [];
        const progress = state.taskProgress || {};
        return tasks.map((t) => ({
          id: t.id,
          title: t.label || t.title || 'Study Task',
          minutes: Number(t.minutes || t.duration) || 25,
          completed: progress[t.id]?.status === 'completed',
          section: t.section || '',
        }));
      } catch {
        // ignore
      }
    }
    return [];
  }

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  // Return all tasks or tasks relevant for today
  return tasks.map((t) => ({
    id: t.id,
    title: t.title || t.label || 'Study Task',
    minutes: Number(t.minutes || t.duration) || 25,
    completed: Boolean(t.completed),
    completedAt: t.completedAt,
    subjectId: t.subjectId || '',
    deadline: t.deadline,
    scheduledWindow: t.scheduledWindow || '',
  }));
}

export async function completeUserTask(db, userId, taskId) {
  const now = Date.now();
  // 1. Update in planner_plans - strictly scoped to this user
  const planResult = await db.collection('planner_plans').updateOne(
    { $or: [{ userId }, { _id: userId }], 'tasks.id': taskId },
    { $set: { 'tasks.$.completed': true, 'tasks.$.completedAt': now, updatedAt: now } }
  );

  if (!planResult || planResult.modifiedCount === 0) {
    return false;
  }

  // 2. Award XP (+20) and increment streak if not completed
  await db.collection('users').updateOne(
    { _id: userId },
    {
      $inc: { xp: 20 },
      $set: { lastActive: new Date().toISOString(), lastStudySessionAt: new Date().toISOString() },
    }
  );
  await db.collection('auth_accounts').updateOne(
    { _id: userId },
    {
      $inc: { xp: 20 },
      $set: { lastActive: new Date().toISOString() },
    }
  );

  return true;
}

export async function fetchUserSchedule(db, userId, dateKey) {
  let plan = await db.collection('planner_plans').findOne({ userId }) || await db.collection('planner_plans').findOne({ _id: userId });
  if (!plan) return [];
  const sessions = Array.isArray(plan.sessions) ? plan.sessions : [];
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const subjects = Array.isArray(plan.subjects) ? plan.subjects : [];

  return sessions.map((s) => {
    const task = tasks.find((t) => t.id === s.taskId);
    const subject = subjects.find((sub) => sub.id === task?.subjectId);
    return {
      start: s.start,
      end: s.end,
      taskTitle: task?.title || 'Study Session',
      subjectName: subject?.name || 'General',
      completed: Boolean(task?.completed),
    };
  });
}

export async function fetchUserMetrics(db, userId, timezone = DEFAULT_TIMEZONE) {
  const dateStr = getTodayKey(new Date(), timezone);
  const tasks = await fetchUserTasks(db, userId, dateStr);
  const completedTasks = tasks.filter((t) => t.completed).length;

  // Study sessions from MongoDB
  const sessions = await db.collection('study_sessions').find({
    userId,
    timestamp: { $regex: `^${dateStr}` },
  }).toArray();

  const todayMinutes = sessions.reduce((sum, s) => sum + Math.round((Number(s.duration) || 0) / 60), 0);

  return {
    todayMinutes,
    todayCompletedTasks: completedTasks,
    totalTasks: tasks.length,
  };
}

export async function fetchUserDecks(db, userId) {
  let decks = await db.collection('decks').find({ userId }).toArray();
  if (!decks.length) {
    const docs = await db.collection('migration_documents').find({
      path: { $regex: `^users/${userId}/decks/[^/]+$` },
    }).toArray();
    decks = docs.map((d) => {
      try {
        const data = JSON.parse(d.fieldsJson);
        return { id: d.path.split('/').pop(), title: data.title || 'Deck', subject: data.subject || '' };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }
  return decks;
}

export async function startUserFocusSession(db, userId, category = 'focus', durationMinutes = 25) {
  const sessionId = randomBytes(16).toString('hex');
  const now = new Date();
  await db.collection('study_sessions').insertOne({
    _id: sessionId,
    id: sessionId,
    userId,
    category,
    duration: durationMinutes * 60,
    timestamp: now.toISOString(),
    startedAt: now,
    active: true,
  });
  return { sessionId, durationMinutes };
}

export async function stopUserFocusSession(db, userId) {
  const activeSession = await db.collection('study_sessions').findOne({ userId, active: true });
  if (!activeSession) return null;

  const now = new Date();
  const elapsedSeconds = Math.max(60, Math.min(activeSession.duration, Math.round((now - new Date(activeSession.startedAt)) / 1000)));
  const minutes = Math.round(elapsedSeconds / 60);
  const xp = Math.min(100, Math.max(10, Math.round(minutes * 2)));

  await db.collection('study_sessions').updateOne(
    { _id: activeSession._id },
    {
      $set: {
        active: false,
        duration: elapsedSeconds,
        completedAt: now,
        xpEarned: xp,
      },
    }
  );

  await db.collection('users').updateOne(
    { _id: userId },
    {
      $inc: { xp, totalStudySeconds: elapsedSeconds },
      $set: { lastActive: now.toISOString(), lastStudySessionAt: now.toISOString() },
    }
  );

  return { minutes, xp };
}

export async function toggleUserReminder(db, userId, key) {
  const account = await db.collection('auth_accounts').findOne({ _id: userId });
  const current = account?.telegramReminders || {
    studyReminders: true,
    dailyStreakSummary: true,
    taskDeadlines: true,
  };
  current[key] = !current[key];

  await db.collection('auth_accounts').updateOne({ _id: userId }, { $set: { telegramReminders: current } });
  await db.collection('users').updateOne({ _id: userId }, { $set: { telegramReminders: current } });

  return current;
}

// -------------------------------------------------------------
// Update Processor (Commands & Callbacks)
// -------------------------------------------------------------

export async function processTelegramUpdate(db, botService, update) {
  if (!update || typeof update !== 'object') return { ok: true, ignored: true };

  // 1. Enforce Idempotency using update_id
  const updateId = String(update.update_id || '');
  if (updateId) {
    try {
      await db.collection('telegram_processed_updates').insertOne({
        _id: updateId,
        processedAt: new Date(),
      });
    } catch (error) {
      if (error.code === 11000) {
        return { ok: true, duplicate: true }; // Already processed
      }
      throw error;
    }
  }

  // 2. Handle Callback Queries (Inline Button Clicks)
  if (update.callback_query) {
    return handleCallbackQuery(db, botService, update.callback_query);
  }

  // 3. Handle Messages
  const message = update.message || update.edited_message;
  if (!message) return { ok: true, ignored: true };

  const chatId = message.chat?.id;
  if (!chatId) return { ok: true, ignored: true };

  // Reject group chats for private personal data
  if (message.chat?.type !== 'private') {
    if (String(message.text || '').startsWith('/')) {
      await botService.sendMessage(chatId, '🔒 NOVIQ shaxsiy ta\'lim ma\'lumotlarini himoyalash uchun botdan faqat shaxsiy (private) chatda foydalanish mumkin.');
    }
    return { ok: true, ignored: true };
  }

  const text = String(message.text || '').trim();
  const fromUser = message.from || {};

  // Check /start command (may have deep link token: /start link_<token>)
  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (startMatch) {
    const rawPayload = (startMatch[1] || '').trim();
    return handleStartCommand(db, botService, chatId, fromUser, rawPayload);
  }

  // Check other commands
  const command = text.split(/\s/)[0].split('@')[0].toLowerCase();
  const user = await findUserByTelegramId(db, chatId);

  if (!user) {
    const copy = getCopy(fromUser.language_code === 'uz' ? 'uz' : 'en');
    await botService.sendMessage(chatId, `${copy.unlinkedPrompt}\n\n🌐 <b>NOVIQ Profile:</b> ${getProfileUrl()}`, {
      reply_markup: {
        inline_keyboard: [
          [makeSafeUrlButton('🌐 NOVIQ Profile', getProfileUrl(), 'menu:url:profile')],
          [{ text: 'ℹ️ Yordam / Help', callback_data: 'menu:help' }],
        ],
      },
    });
    return { ok: true, unlinked: true };
  }

  const copy = getCopy(user.locale || fromUser.language_code);

  switch (command) {
    case '/planner':
      return handlePlannerCommand(db, botService, chatId, user, copy);
    case '/today':
      return handleTodayCommand(db, botService, chatId, user, copy);
    case '/focus':
      return handleFocusCommand(db, botService, chatId, user, copy);
    case '/flashcards':
      return handleFlashcardsCommand(db, botService, chatId, user, copy);
    case '/metrics':
      return handleMetricsCommand(db, botService, chatId, user, copy);
    case '/reminders':
      return handleRemindersCommand(db, botService, chatId, user, copy);
    case '/settings':
      return handleSettingsCommand(db, botService, chatId, user, copy);
    case '/help':
      await botService.sendMessage(chatId, copy.helpText, {
        reply_markup: buildMainMenuKeyboard(user.locale),
      });
      return { ok: true, command: 'help' };
    default:
      await botService.sendMessage(chatId, copy.helpText, {
        reply_markup: buildMainMenuKeyboard(user.locale),
      });
      return { ok: true, unknownCommand: true };
  }
}

async function handleStartCommand(db, botService, chatId, fromUser, payload) {
  const isUz = fromUser.language_code === 'uz';
  const copy = getCopy(isUz ? 'uz' : 'en');

  // Handle deep link token
  if (payload.startsWith('link_')) {
    const token = payload.slice('link_'.length).trim();
    if (/^[a-f0-9]{48}$/.test(token)) {
      const linkResult = await verifyAndLinkTelegram(db, token, fromUser, chatId);
      if (linkResult?.switchConfirmationRequired) {
        const oldName = linkResult.previousUser.displayName || 'Eski hisob';
        const newName = linkResult.tokenRecord.displayName || 'Yangi hisob';
        await botService.sendMessage(
          chatId,
          `⚠️ <b>Diqqat: Hisobni almashtirish</b>\n\n` +
          `Bu Telegram hisob hozirda boshqa NOVIQ profilingizga (<b>${escapeHtml(oldName)}</b>) ulangan.\n\n` +
          `Ushbu Telegram hisobni yangi profilingizga (<b>${escapeHtml(newName)}</b>) ulamoqchimisiz?\n\n` +
          `ℹ️ <i>Eski hisobingiz (${escapeHtml(oldName)}) uziladi, ammo undagi barcha ballar (XP), seriya va o'qish rejalari to'liq saqlanadi.</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🔄 Ha, hisobni almashtirish (${escapeHtml(newName)})`, callback_data: `switch_confirm:${linkResult.actionId || linkResult.tokenHash}` }],
                [{ text: '❌ Bekor qilish', callback_data: `switch_cancel:${linkResult.actionId || ''}` }],
              ],
            },
          }
        );
        return { ok: true, switchConfirmationRequired: true, actionId: linkResult.actionId };
      }
      if (linkResult && !linkResult.switchConfirmationRequired) {
        await botService.sendMessage(
          chatId,
          copy.linkSuccess(linkResult.displayName),
          { reply_markup: buildMainMenuKeyboard(linkResult.locale) }
        );
        return { ok: true, linked: true };
      }
    }

    // Invalid or expired token: never leak an old account
    await botService.sendMessage(
      chatId,
      `${copy.linkExpired}\n\n🌐 <b>NOVIQ Profile:</b> ${getProfileUrl()}`,
      {
        reply_markup: {
          inline_keyboard: [
            [makeSafeUrlButton('🔗 Yangi havola olish / Get New Link', getProfileUrl(), 'menu:url:profile')],
            [{ text: 'ℹ️ Yordam / Help', callback_data: 'menu:help' }],
          ],
        },
      }
    );
    return { ok: true, linkFailed: true };
  }

  // Regular /start
  const user = await findUserByTelegramId(db, chatId);
  if (user) {
    await botService.sendMessage(
      chatId,
      copy.welcomeLinked(user.displayName, user.streak, user.xp),
      { reply_markup: buildMainMenuKeyboard(user.locale) }
    );
    return { ok: true, userLinked: true };
  }

  await botService.sendMessage(chatId, `${copy.welcomeNew}\n\n🌐 <b>NOVIQ Profile:</b> ${getProfileUrl()}`, {
    reply_markup: {
      inline_keyboard: [
        [makeSafeUrlButton('🔗 Profilni ulash / Connect Account', getProfileUrl(), 'menu:url:profile')],
        [{ text: 'ℹ️ Yordam / Help', callback_data: 'menu:help' }],
      ],
    },
  });
  return { ok: true, newGuest: true };
}

async function handlePlannerCommand(db, botService, chatId, user, copy) {
  const dateKey = getTodayKey(new Date(), user.timezone);
  const tasks = await fetchUserTasks(db, user.uid, dateKey);

  if (!tasks.length) {
    await botService.sendMessage(chatId, copy.plannerEmpty, {
      reply_markup: buildMainMenuKeyboard(user.locale),
    });
    return { ok: true, tasks: 0 };
  }

  const completed = tasks.filter((t) => t.completed).length;
  let text = copy.plannerTitle(dateKey, completed, tasks.length);

  const buttons = [];
  tasks.forEach((task, idx) => {
    const icon = task.completed ? '✅' : '⏳';
    text += `\n${icon} <b>${idx + 1}. ${escapeHtml(task.title)}</b> (${task.minutes} min)`;
    if (!task.completed) {
      buttons.push([
        { text: `✅ Bajarildi: ${task.title.slice(0, 20)}`, callback_data: `task_done:${task.id}` },
      ]);
    }
  });

  buttons.push([{ text: '🔙 Asosiy menyu', callback_data: 'menu:main' }]);

  await botService.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
  return { ok: true, tasks: tasks.length };
}

async function handleTodayCommand(db, botService, chatId, user, copy) {
  const dateKey = getTodayKey(new Date(), user.timezone);
  const schedule = await fetchUserSchedule(db, user.uid, dateKey);
  const tasks = await fetchUserTasks(db, user.uid, dateKey);

  let text = copy.todayScheduleTitle(dateKey);
  if (schedule.length) {
    text += '<b>Rejalashtirilgan mashg\'ulotlar:</b>\n';
    schedule.forEach((s) => {
      const startStr = formatTimeInZone(s.start, user.timezone);
      const endStr = formatTimeInZone(s.end, user.timezone);
      const icon = s.completed ? '✅' : '🕒';
      text += `${icon} <code>${startStr} - ${endStr}</code>: ${escapeHtml(s.taskTitle)} (<i>${escapeHtml(s.subjectName)}</i>)\n`;
    });
  } else {
    text += 'Bugungi taqvimda band qilingan alohida o\'quv bloklari yo\'q.\n';
  }

  const pendingTasks = tasks.filter((t) => !t.completed);
  if (pendingTasks.length) {
    text += `\n<b>Kutilayotgan vazifalar (${pendingTasks.length}):</b>\n`;
    pendingTasks.slice(0, 5).forEach((t) => {
      text += `• ${escapeHtml(t.title)} (${t.minutes} min)\n`;
    });
  }

  await botService.sendMessage(chatId, text, {
    reply_markup: buildMainMenuKeyboard(user.locale),
  });
  return { ok: true };
}

async function handleFocusCommand(db, botService, chatId, user, copy) {
  const stats = await fetchUserMetrics(db, user.uid, user.timezone);
  const activeSession = await db.collection('study_sessions').findOne({ userId: user.uid, active: true });

  const text = copy.focusTitle(stats.todayMinutes, user.dailyTargetMinutes, Boolean(activeSession));
  const buttons = [];

  if (activeSession) {
    buttons.push([{ text: '⏹ Fokusni yakunlash', callback_data: 'focus:stop' }]);
  } else {
    buttons.push([
      { text: '▶️ 25 min Fokus', callback_data: 'focus:start:25' },
      { text: '▶️ 50 min Chuqur diqqat', callback_data: 'focus:start:50' },
    ]);
  }
  buttons.push([{ text: '🔙 Asosiy menyu', callback_data: 'menu:main' }]);

  await botService.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
  return { ok: true };
}

async function handleFlashcardsCommand(db, botService, chatId, user, copy) {
  const decks = await fetchUserDecks(db, user.uid);
  if (!decks.length) {
    await botService.sendMessage(chatId, `${copy.flashcardsEmpty}\n\n🌐 <b>NOVIQ Flashcards:</b> ${getFlashcardsUrl()}`, {
      reply_markup: {
        inline_keyboard: [
          [makeSafeUrlButton('🌐 Yangi to\'plam yaratish', getFlashcardsUrl(), 'menu:url:flashcards')],
          [{ text: '🔙 Asosiy menyu', callback_data: 'menu:main' }],
        ],
      },
    });
    return { ok: true, decks: 0 };
  }

  let text = copy.flashcardsTitle(decks.length);
  decks.slice(0, 8).forEach((deck, idx) => {
    text += `\n${idx + 1}. <b>${escapeHtml(deck.title)}</b> ${deck.subject ? `(<i>${escapeHtml(deck.subject)}</i>)` : ''}`;
  });

  text += `\n\n<i>To'plamlar bo'yicha mashg'ulot o'tish uchun veb-ilovaga kiring:</i>\n🌐 ${getFlashcardsUrl()}`;

  await botService.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [makeSafeUrlButton('🃏 Saytda mashq qilish', getFlashcardsUrl(), 'menu:url:flashcards')],
        [{ text: '🔙 Asosiy menyu', callback_data: 'menu:main' }],
      ],
    },
  });
  return { ok: true, decks: decks.length };
}

async function handleMetricsCommand(db, botService, chatId, user, copy) {
  const stats = await fetchUserMetrics(db, user.uid, user.timezone);
  const text = copy.metricsTitle(user, stats);

  await botService.sendMessage(chatId, text, {
    reply_markup: buildMainMenuKeyboard(user.locale),
  });
  return { ok: true };
}

async function handleRemindersCommand(db, botService, chatId, user, copy) {
  const prefs = user.reminders;
  const isUz = user.locale === 'uz';

  const text = `${copy.remindersTitle(prefs)}
• O'qish eslatmalari: <b>${prefs.studyReminders ? 'Yoqilgan ✅' : 'O\'chirilgan ❌'}</b>
• Kunlik seriya xulosasi (21:00): <b>${prefs.dailyStreakSummary ? 'Yoqilgan ✅' : 'O\'chirilgan ❌'}</b>
• Vazifa muddati eslatmalari: <b>${prefs.taskDeadlines ? 'Yoqilgan ✅' : 'O\'chirilgan ❌'}</b>`;

  const buttons = [
    [
      {
        text: `${prefs.studyReminders ? '🔔' : '🔕'} Dars eslatmasi (${prefs.studyReminders ? 'ON' : 'OFF'})`,
        callback_data: 'rem_toggle:studyReminders',
      },
    ],
    [
      {
        text: `${prefs.dailyStreakSummary ? '📊' : '🔕'} Kunlik hisobot (${prefs.dailyStreakSummary ? 'ON' : 'OFF'})`,
        callback_data: 'rem_toggle:dailyStreakSummary',
      },
    ],
    [
      {
        text: `${prefs.taskDeadlines ? '⏰' : '🔕'} Muddat eslatmasi (${prefs.taskDeadlines ? 'ON' : 'OFF'})`,
        callback_data: 'rem_toggle:taskDeadlines',
      },
    ],
    [{ text: '🔙 Asosiy menyu', callback_data: 'menu:main' }],
  ];

  await botService.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
  return { ok: true };
}

async function handleSettingsCommand(db, botService, chatId, user, copy) {
  const text = copy.settingsTitle(user);
  const isUz = user.locale === 'uz';

  const buttons = [
    [
      { text: isUz ? '🔔 Eslatmalar sozlamasi' : '🔔 Reminders', callback_data: 'menu:reminders' },
      { text: isUz ? '📊 Shaxsiy natijalar' : '📊 Metrics', callback_data: 'menu:metrics' },
    ],
    [
      { text: isUz ? '⚠️ Hisobni uzish (Unlink)' : '⚠️ Unlink Account', callback_data: 'unlink_prompt' },
    ],
    [{ text: isUz ? '🔙 Asosiy menyu' : '🔙 Main Menu', callback_data: 'menu:main' }],
  ];

  await botService.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
  return { ok: true };
}

// -------------------------------------------------------------
// Callback Query Handler
// -------------------------------------------------------------

async function handleCallbackQuery(db, botService, callbackQuery) {
  const callbackId = callbackQuery.id;
  const data = callbackQuery.data || '';
  const message = callbackQuery.message;
  const chatId = message?.chat?.id;

  if (!chatId) {
    await botService.answerCallbackQuery(callbackId);
    return { ok: true };
  }

  // Handle account switch confirmation
  if (data.startsWith('switch_confirm:')) {
    const switchKey = data.slice('switch_confirm:'.length);
    const switchedUser = await executeTelegramAccountSwitch(db, switchKey, callbackQuery.from, chatId);
    if (switchedUser) {
      await botService.answerCallbackQuery(callbackId, { text: 'Hisob muvaffaqiyatli almashtirildi!' });
      await botService.sendMessage(
        chatId,
        `✅ <b>Hisob muvaffaqiyatli almashtirildi!</b>\n\n` +
        `Telegram endi <b>${escapeHtml(switchedUser.displayName)}</b> profilingizga ulandi.\n` +
        `Oldingi hisobingiz Telegramdan uzildi (lekin uning barcha o'qish ma'lumotlari saqlandi).`,
        {
          parse_mode: 'HTML',
          reply_markup: buildMainMenuKeyboard(switchedUser.locale),
        }
      );
      return { ok: true, switched: true, uid: switchedUser.uid };
    } else {
      await botService.answerCallbackQuery(callbackId, { text: 'Havola eskirgan yoki yaroqsiz', show_alert: true });
      await botService.sendMessage(chatId, '⚠️ Ulash havolasi yaroqsiz yoki muddati o\'tgan.');
      return { ok: true, switched: false };
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
    await botService.answerCallbackQuery(callbackId, { text: 'Bekor qilindi' });
    await botService.sendMessage(chatId, '❌ Hisobni almashtirish bekor qilindi. Telegram joriy profilingizda qoldi.');
    return { ok: true, cancelled: true };
  }

  const user = await findUserByTelegramId(db, chatId);
  if (!user) {
    if (data === 'menu:help') {
      await botService.answerCallbackQuery(callbackId);
      await botService.sendMessage(chatId, getCopy('uz').helpText);
      return { ok: true };
    }
    if (data.startsWith('menu:url:')) {
      await botService.answerCallbackQuery(callbackId);
      const target = data.slice('menu:url:'.length);
      const url = target === 'profile' ? getProfileUrl() : getAppUrl();
      await botService.sendMessage(chatId, `🌐 <b>NOVIQ Havolasi:</b>\n${url}\n\n<i>Brauzeringizda oching va hisobingizni ulang.</i>`, { parse_mode: 'HTML' });
      return { ok: true };
    }
    await botService.answerCallbackQuery(callbackId, {
      text: 'Hisob ulanmagan. Iltimos, NOVIQ profilingizni ulang.',
      show_alert: true,
    });
    return { ok: true };
  }

  const copy = getCopy(user.locale);

  if (data.startsWith('menu:url:')) {
    await botService.answerCallbackQuery(callbackId);
    const target = data.slice('menu:url:'.length);
    let targetUrl = getAppUrl();
    let label = 'NOVIQ Veb-sayt';
    if (target === 'profile') {
      targetUrl = getProfileUrl();
      label = 'NOVIQ Profil';
    } else if (target === 'flashcards') {
      targetUrl = getFlashcardsUrl();
      label = 'NOVIQ Fleshkardlar';
    }
    await botService.sendMessage(
      chatId,
      `🌐 <b>${label}:</b>\n${targetUrl}\n\n<i>Brauzeringizda ushbu sahifani oching.</i>`,
      { parse_mode: 'HTML' }
    );
    return { ok: true, urlShown: targetUrl };
  }

  // 1. Task Completion Callback (scoped strictly to current user)
  if (data.startsWith('task_done:')) {
    const taskId = data.slice('task_done:'.length);
    const completed = await completeUserTask(db, user.uid, taskId);
    if (!completed) {
      await botService.answerCallbackQuery(callbackId, {
        text: 'Vazifa topilmadi yoki boshqa hisobga tegishli.',
        show_alert: true,
      });
      return { ok: true, taskCompleted: false };
    }
    await botService.answerCallbackQuery(callbackId, {
      text: 'Vazifa bajarildi! +20 XP berildi 🎉',
    });
    return handlePlannerCommand(db, botService, chatId, user, copy);
  }

  // 2. Focus Start Callback
  if (data.startsWith('focus:start:')) {
    const minutes = Number(data.slice('focus:start:'.length)) || 25;
    await startUserFocusSession(db, user.uid, 'focus', minutes);
    await botService.answerCallbackQuery(callbackId, {
      text: `${minutes} daqiqalik fokus boshlandi!`,
    });
    await botService.sendMessage(chatId, copy.focusStarted, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⏹ Fokusni yakunlash', callback_data: 'focus:stop' }],
          [{ text: '🔙 Asosiy menyu', callback_data: 'menu:main' }],
        ],
      },
    });
    return { ok: true };
  }

  // 3. Focus Stop Callback
  if (data === 'focus:stop') {
    const result = await stopUserFocusSession(db, user.uid);
    if (result) {
      await botService.answerCallbackQuery(callbackId, {
        text: `Fokus yakunlandi: ${result.minutes} min (+${result.xp} XP)`,
      });
      await botService.sendMessage(chatId, copy.focusEnded(result.minutes, result.xp), {
        reply_markup: buildMainMenuKeyboard(user.locale),
      });
    } else {
      await botService.answerCallbackQuery(callbackId, { text: 'Faol fokus topilmadi.' });
    }
    return { ok: true };
  }

  // 4. Reminder Toggle
  if (data.startsWith('rem_toggle:')) {
    const prefKey = data.slice('rem_toggle:'.length);
    await toggleUserReminder(db, user.uid, prefKey);
    await botService.answerCallbackQuery(callbackId, { text: 'Sozlama yangilandi ✅' });
    const refreshedUser = await findUserByTelegramId(db, chatId);
    return handleRemindersCommand(db, botService, chatId, refreshedUser, copy);
  }

  // 5. Unlink Account
  if (data === 'unlink_prompt') {
    await botService.answerCallbackQuery(callbackId);
    await botService.sendMessage(
      chatId,
      '⚠️ <b>Haqiqatan ham Telegram akkauntingizni NOVIQ dan uzmoqchimisiz?</b>\n\nUzilgandan so\'ng bot orqali vazifalar va eslatmalar kelmaydi.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Ha, hisobni uzish', callback_data: 'unlink_confirm' }],
            [{ text: 'Bekor qilish', callback_data: 'menu:settings' }],
          ],
        },
      }
    );
    return { ok: true };
  }

  if (data === 'unlink_confirm') {
    await unlinkTelegramUser(db, user.uid);
    await botService.answerCallbackQuery(callbackId, {
      text: 'Hisob uzildi.',
      show_alert: true,
    });
    await botService.sendMessage(chatId, `${copy.unlinkedSuccess}\n\n🌐 <b>NOVIQ Profile:</b> ${getProfileUrl()}`, {
      reply_markup: {
        inline_keyboard: [
          [makeSafeUrlButton('🔗 Qayta ulash', getProfileUrl(), 'menu:url:profile')],
        ],
      },
    });
    return { ok: true, unlinked: true };
  }

  // 6. Menu Navigation
  if (data.startsWith('menu:')) {
    const screen = data.slice('menu:'.length);
    await botService.answerCallbackQuery(callbackId);
    switch (screen) {
      case 'planner':
        return handlePlannerCommand(db, botService, chatId, user, copy);
      case 'focus':
        return handleFocusCommand(db, botService, chatId, user, copy);
      case 'metrics':
        return handleMetricsCommand(db, botService, chatId, user, copy);
      case 'flashcards':
        return handleFlashcardsCommand(db, botService, chatId, user, copy);
      case 'reminders':
        return handleRemindersCommand(db, botService, chatId, user, copy);
      case 'settings':
        return handleSettingsCommand(db, botService, chatId, user, copy);
      case 'help':
        await botService.sendMessage(chatId, copy.helpText, {
          reply_markup: buildMainMenuKeyboard(user.locale),
        });
        return { ok: true };
      case 'main':
      default:
        await botService.sendMessage(
          chatId,
          copy.welcomeLinked(user.displayName, user.streak, user.xp),
          { reply_markup: buildMainMenuKeyboard(user.locale) }
        );
        return { ok: true };
    }
  }

  await botService.answerCallbackQuery(callbackId);
  return { ok: true, unknownCallback: true };
}

// -------------------------------------------------------------
// Automated Notifications Service
// -------------------------------------------------------------

export async function runAutomatedNotificationCycle(db, botService, now = new Date()) {
  const usersWithTelegram = await db.collection('auth_accounts').find({
    telegramId: { $exists: true, $ne: null },
  }).toArray();

  let sentCount = 0;

  for (const account of usersWithTelegram) {
    const chatId = account.telegramId;
    if (!chatId) continue;

    const user = await findUserByTelegramId(db, chatId);
    if (!user) continue;

    const timezone = user.timezone || DEFAULT_TIMEZONE;
    const todayKey = getTodayKey(now, timezone);
    const prefs = user.reminders || {};

    // 1. Daily Study Summary (at 21:00 in user's timezone)
    if (prefs.dailyStreakSummary) {
      const notificationKey = `daily_summary:${user.uid}:${todayKey}`;
      const hourInZone = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(now)
      );

      // Send between 21:00 and 22:00
      if (hourInZone >= 21) {
        const alreadySent = await db.collection('telegram_notifications').findOne({ _id: notificationKey });
        if (!alreadySent) {
          try {
            const stats = await fetchUserMetrics(db, user.uid, timezone);
            const copy = getCopy(user.locale);
            const text = `📊 <b>Kunlik NOVIQ hisoboti (${todayKey})</b>

Salom, <b>${escapeHtml(user.displayName)}</b>!
Bugungi o'qish natijalaringiz:
• Bajarilgan vazifalar: <b>${stats.todayCompletedTasks}/${stats.totalTasks}</b>
• O'qish vaqti: <b>${stats.todayMinutes} daqiqa</b> (Maqsad: ${user.dailyTargetMinutes} min)
• Joriy seriya: <b>${user.streak} kun</b> 🔥

${stats.todayCompletedTasks > 0 ? 'Bugungi rejalarni ajoyib yakunladingiz! Barakalla! 🌟' : 'Ertaga yanada yaxshiroq natija ko\'rsatishingizga ishonamiz! 💪'}`;

            await botService.sendMessage(chatId, text, {
              reply_markup: buildMainMenuKeyboard(user.locale),
            });

            await db.collection('telegram_notifications').insertOne({
              _id: notificationKey,
              userId: user.uid,
              chatId,
              type: 'daily_summary',
              sentAt: now,
              status: 'sent',
            });
            sentCount++;
          } catch (error) {
            console.warn(`[telegram-notify] Daily summary error for ${chatId}:`, error.message);
          }
        }
      }
    }

    // 2. Upcoming Task Deadlines
    if (prefs.taskDeadlines) {
      try {
        const tasks = await fetchUserTasks(db, user.uid, todayKey);
        for (const task of tasks) {
          if (task.completed) continue;
          const notificationKey = `deadline:${user.uid}:${task.id}:${todayKey}`;
          const alreadySent = await db.collection('telegram_notifications').findOne({ _id: notificationKey });
          if (alreadySent) continue;

          // If task has deadline today or is scheduled today
          await botService.sendMessage(
            chatId,
            `⏰ <b>Eslatma!</b> Bugungi vazifangiz hali yakunlanmadi:\n<b>${escapeHtml(task.title)}</b> (${task.minutes} min)\n\nUni yakunlab o'z seriyangizni saqlang!`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '✅ Bajarildi deb belgilash', callback_data: `task_done:${task.id}` }],
                ],
              },
            }
          );

          await db.collection('telegram_notifications').insertOne({
            _id: notificationKey,
            userId: user.uid,
            chatId,
            type: 'deadline',
            sentAt: now,
            status: 'sent',
          });
          sentCount++;
        }
      } catch (error) {
        console.warn(`[telegram-notify] Task deadline error for ${chatId}:`, error.message);
      }
    }
  }

  return { checkedUsers: usersWithTelegram.length, sentCount };
}
