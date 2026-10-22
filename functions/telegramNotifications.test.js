const test = require('node:test');
const assert = require('node:assert/strict');
const { dueReminders, createNotificationSender, createNotificationSweep, escapeHtml } = require('./telegramNotifications');

function database(initial = {}) {
  const records = new Map(Object.entries(initial));
  let queue = Promise.resolve();
  const doc = path => ({ path, get: async () => ({ exists: records.has(path), data: () => records.get(path) }),
    set: async patch => { records.set(path, { ...records.get(path), ...patch }); } });
  return { records, doc,
    runTransaction(operation) {
      const result = queue.then(() => operation({ get: ref => ref.get(), set: (ref, patch) => { records.set(ref.path, { ...records.get(ref.path), ...patch }); } }));
      queue = result.catch(() => {}); return result;
    },
    collection(path) {
      let after = '', count = 10;
      const query = { orderBy: () => query, startAfter: id => { after = id; return query; }, limit: n => { count = n; return query; },
        get: async () => ({ docs: [...records.keys()].filter(key => key.startsWith(path + '/') && key.split('/').length === 2 && key.split('/')[1] > after).sort().slice(0, count).map(key => ({ id: key.split('/')[1], data: () => records.get(key) })) }) };
      return query;
    },
  };
}

test('reminders include only near-future sessions/deadlines and exclude completed or unscheduled tasks', () => {
  const now = Date.UTC(2026, 9, 22, 12);
  const tasks = [{ id: 'a', deadline: now + 20 * 60000 }, { id: 'tomorrow', deadline: now + 86400000 },
    { id: 'done', completed: true, deadline: now + 60000 }, { id: 'no-date' }];
  const reminders = dueReminders({ tasks, sessions: [{ taskId: 'a', start: now + 10 * 60000 }, { taskId: 'done', start: now }, { taskId: 'missing', start: now }] }, now);
  assert.deepEqual(reminders.map(item => item.kind), ['session', 'deadline']);
  assert.equal(dueReminders({ tasks, taskProgress: { a: { status: 'completed' } } }, now).length, 0);
  assert.equal(escapeHtml('<math & science>'), '&lt;math &amp; science&gt;');
});

test('concurrent notification delivery sends once and unknown outcomes are never blindly retried', async () => {
  const db = database(); let calls = 0;
  const deliver = createNotificationSender({ db, timestamp: () => 1, send: async () => { calls++; } });
  const ref = db.doc('notifications/a');
  await Promise.all([deliver(ref, '1', 'hello'), deliver(ref, '1', 'hello')]);
  assert.equal(calls, 1); assert.equal(db.records.get(ref.path).status, 'sent');
  const ambiguous = createNotificationSender({ db, timestamp: () => 1, send: async () => { calls++; throw new Error('timeout'); } });
  const other = db.doc('notifications/b');
  await ambiguous(other, '1', 'hello'); await ambiguous(other, '1', 'hello');
  assert.equal(calls, 2); assert.equal(db.records.get(other.path).status, 'unknown');
});

test('explicit provider rejection can retry, but persistence failure after delivery cannot duplicate', async () => {
  const db = database(); let calls = 0;
  const deliver = createNotificationSender({ db, timestamp: () => 1, send: async () => { if (++calls === 1) throw Object.assign(new Error(), { deliveryRejected: true }); } });
  const ref = db.doc('notifications/a');
  await deliver(ref, '1', 'hello'); await deliver(ref, '1', 'hello'); assert.equal(calls, 2);
  const failedWrite = db.doc('notifications/b'); failedWrite.set = async () => { throw new Error('database down'); };
  await assert.rejects(deliver(failedWrite, '1', 'hello'));
  await deliver(failedWrite, '1', 'hello'); assert.equal(calls, 3);
});

test('sweeps paginate past ten users, obey the summary hour, isolate failures and deduplicate repeats', async () => {
  let now = Date.UTC(2026, 9, 22, 15); // 20:00 Tashkent
  const db = database(); let sends = 0;
  for (let i = 0; i < 23; i++) db.records.set(`users/u${String(i).padStart(2, '0')}`, { telegramId: '1234' });
  const sweep = createNotificationSweep({ db, timestamp: () => now, now: () => now, send: async () => { sends++; },
    summary: async uid => { if (uid === 'u02') throw new Error('one unavailable account'); return 'summary'; },
    enabled: (_user, key) => key === 'dailyStreakSummary', validChat: Boolean });
  assert.equal((await sweep()).users, 23); assert.equal(sends, 0);
  now += 3600000;
  assert.equal((await sweep()).sentSummaries, 22); assert.equal(sends, 22);
  await sweep(); assert.equal(sends, 22);
  db.records.set('systemJobs/telegramNotifications', { leaseUntil: now + 10000 });
  assert.equal((await sweep()).busy, true);
});
