const { createHash } = require('node:crypto');

const escapeHtml = value => String(value).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
const notificationId = value => createHash('sha256').update(value).digest('hex');
const millis = value => typeof value === 'number' ? value : typeof value?.toMillis === 'function' ? value.toMillis() : Date.parse(value);

// Only scheduled blocks and explicit deadlines produce reminders. Unscheduled
// tasks and tomorrow's work must not generate a daily burst of messages.
function dueReminders(plan, now) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const progress = plan.taskProgress || {};
  const completed = task => task.completed || progress[task.id]?.status === 'completed';
  const reminders = [];
  for (const session of Array.isArray(plan.sessions) ? plan.sessions : []) {
    const task = tasks.find(task => task.id === session.taskId);
    if (!task || completed(task)) continue;
    const start = millis(session.start);
    if (start >= now && start <= now + 15 * 60000) reminders.push({ task, at: start, kind: 'session' });
  }
  for (const task of tasks) {
    if (!task?.id || completed(task)) continue;
    const deadline = millis(task.deadline);
    if (Number.isFinite(deadline) && deadline >= now && deadline <= now + 30 * 60000) reminders.push({ task, at: deadline, kind: 'deadline' });
  }
  return reminders;
}

function createNotificationSender({ db, send, timestamp, now = Date.now }) {
  return async (ref, chatId, text, options = {}) => {
    // A concurrent cron/webhook must claim before contacting Telegram. Unknown
    // delivery outcomes stay suppressed: Telegram has no idempotency key.
    const claimed = await db.runTransaction(async tx => {
      const previous = await tx.get(ref);
      if (previous.exists && ['sent', 'sending', 'unknown'].includes(previous.data()?.status)) return false;
      tx.set(ref, { status: 'sending', attemptedAt: timestamp(), chatId }, { merge: true });
      return true;
    });
    if (!claimed) return false;
    let deliveryStarted = false;
    try {
      const message = typeof text === 'function' ? await text() : text;
      deliveryStarted = true;
      await send(chatId, message, options);
    } catch (error) {
      await ref.set({ status: !deliveryStarted || error.deliveryRejected ? 'failed' : 'unknown', updatedAt: timestamp() }, { merge: true });
      return false;
    }
    // If persistence fails after delivery, the 'sending' claim still prevents
    // a retry from sending a duplicate. Do not change it to 'failed'.
    await ref.set({ status: 'sent', sentAt: timestamp(), deliveredAt: now() }, { merge: true });
    return true;
  };
}

function createNotificationSweep({ db, send, summary, timestamp, enabled, validChat, now = Date.now }) {
  const deliver = createNotificationSender({ db, send, timestamp, now });
  return async ({ budgetMs = 45000 } = {}) => {
    const started = now();
    const owner = require('node:crypto').randomUUID();
    const stateRef = db.doc('systemJobs/telegramNotifications');
    const state = await db.runTransaction(async tx => {
      const snapshot = await tx.get(stateRef);
      const previous = snapshot.data() || {};
      if (previous.leaseUntil > started) return null;
      tx.set(stateRef, { owner, leaseUntil: started + budgetMs + 60000 }, { merge: true });
      return previous;
    });
    if (!state) return { ok: true, busy: true };
    let cursor = state.cursor || '', users = 0, sentSummaries = 0, sentDeadlines = 0;
    const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(started);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hourCycle: 'h23' }).format(started));
    try {
      // Stable ID pagination avoids downloading the full account collection.
      while (now() - started < budgetMs - 15000) {
        let query = db.collection('users').orderBy('__name__');
        if (cursor) query = query.startAfter(cursor);
        const page = await query.limit(10).get();
        if (!page.docs.length) { cursor = ''; break; }
        // Three workers keep provider traffic bounded; a page is checkpointed
        // only after all of its users have settled.
        for (let offset = 0; offset < page.docs.length; offset += 3) {
          await Promise.all(page.docs.slice(offset, offset + 3).map(async document => {
            const user = document.data() || {}, chatId = String(user.telegramId || '').trim();
            if (!validChat(chatId)) return;
            try {
              if (hour >= 21 && enabled(user, 'dailyStreakSummary')) {
                if (await deliver(db.doc(`users/${document.id}/telegramNotifications/daily-${dayKey}`), chatId, () => summary(document.id, user))) sentSummaries++;
              }
              if (!enabled(user, 'taskDeadlines') || now() - started >= budgetMs - 5000) return;
              const smart = await db.doc(`users/${document.id}/planner/smart-v2`).get();
              const legacy = smart.exists ? null : await db.doc(`users/${document.id}/planner/state`).get();
              const data = smart.exists ? smart.data() : legacy?.data();
              for (const reminder of dueReminders(data?.state || data || {}, now()).slice(0, 5)) {
                if (now() - started >= budgetMs - 5000) break;
                const id = notificationId(`${reminder.kind}:${reminder.task.id}:${reminder.at}`);
                const ref = db.doc(`users/${document.id}/telegramNotifications/reminder-${id}`);
                const title = escapeHtml(String(reminder.task.title || reminder.task.label || 'Study task').slice(0, 300));
                const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' }).format(reminder.at);
                if (await deliver(ref, chatId, `<b>Eslatma · ${time} (Toshkent)</b>\n${title}`, { parse_mode: 'HTML' })) sentDeadlines++;
              }
            } catch { /* One unavailable account must not block the page. */ }
          }));
        }
        users += page.docs.length;
        cursor = page.docs.at(-1).id;
        await stateRef.set({ cursor, updatedAt: timestamp() }, { merge: true });
        if (page.docs.length < 10) { cursor = ''; break; }
      }
      return { ok: true, users, sentSummaries, sentDeadlines, hasMore: Boolean(cursor) };
    } finally {
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(stateRef);
        if (snapshot.data()?.owner === owner) tx.set(stateRef, { cursor, leaseUntil: 0, updatedAt: timestamp() }, { merge: true });
      });
    }
  };
}

module.exports = { dueReminders, createNotificationSender, createNotificationSweep, escapeHtml };
