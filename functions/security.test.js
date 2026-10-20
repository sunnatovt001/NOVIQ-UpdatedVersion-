const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const crypto = require("node:crypto");

test("community directory is member-only, paginated and excludes private account fields", async () => {
  const h = harness();
  h.records.set("communities/real/members/u1", { role: "owner", displayName: "Saved name" });
  h.records.set("users/u1", { displayName: "Current name", username: "current_username", email: "private@example.invalid", telegramId: "private" });
  h.records.set("users/u1/trusted/communityPresence", { leases: { tab: Date.now() + 60000 }, lastSeenAt: new Date().toISOString() });
  for (let i=0; i<52; i++) h.records.set(`communities/real/members/member${String(i).padStart(2,"0")}`, { displayName: `Stored ${i}`, role:"member" });
  const before = h.records.size;
  await assert.rejects(h.functions.getCommunityMembers({ auth: {uid:"outsider"}, data:{communityId:"real"} }), {code:"permission-denied"});
  const first = await h.functions.getCommunityMembers({auth:{uid:"u1"},data:{communityId:"real"}});
  assert.equal(first.count,53);assert.equal(first.onlineCount,1);assert.equal(first.members.length,50);assert.ok(first.nextCursor);
  const next = await h.functions.getCommunityMembers({auth:{uid:"u1"},data:{communityId:"real",after:first.nextCursor}});
  assert.equal(next.members.length,3);assert.equal(next.nextCursor,null);
  const self=next.members.find(member=>member.uid==="u1");assert.equal(self.username,"current_username");assert.equal(self.displayName,"Current name");assert.equal(self.online,true);
  assert.ok(!JSON.stringify(next).includes("private"));assert.equal(h.records.size,before);
});
test("presence leases preserve other tabs, expire and require authentication", async()=>{
  const h=harness();
  await assert.rejects(h.functions.updateCommunityPresence({data:{sessionId:"isolated_tab_123456",online:true}}),{code:"unauthenticated"});
  await assert.rejects(h.functions.updateCommunityPresence({auth:{uid:"u1"},data:{sessionId:"../invalid",online:true}}),{code:"invalid-argument"});
  const path="users/u1/trusted/communityPresence";
  h.records.set(path,{leases:{expired:Date.now()-1,other:Date.now()+60000}});
  await h.functions.updateCommunityPresence({auth:{uid:"u1"},data:{sessionId:"isolated_tab_123456",online:true}});
  assert.equal(h.records.get(path).leases.expired,undefined);assert.ok(h.records.get(path).leases.other);
  await h.functions.updateCommunityPresence({auth:{uid:"u1"},data:{sessionId:"isolated_tab_123456",online:false}});
  assert.equal(h.records.get(path).leases.isolated_tab_123456,undefined);assert.ok(h.records.get(path).leases.other);
});
test("AI uses the available model and header-only key, and does not retry credential rejection", async()=>{
  const calls=[];
  const h=harness({}, {fetch:async(url,options)=>{calls.push({url,options});return {ok:false,status:403,json:async()=>({error:{message:"API key forbidden"}})};}});
  await assert.rejects(h.functions.generateAiResponse({auth:{uid:"u1"},data:{contents:"Isolated question",feature:"tutor",retries:1}}),error=>error.details.reason==="AI_KEY_OR_PERMISSION");
  assert.equal(calls.length,1);assert.ok(calls[0].url.includes("gemini-3.5-flash-lite"));assert.ok(!calls[0].url.includes("test-key"));assert.equal(calls[0].options.headers["x-goog-api-key"],"test-key");
});

test("Tutor uses one fast model with minimal thinking and retries only explicit temporary rejection", async()=>{
 const calls=[];
 const h=harness({GEMINI_MODELS:"obsolete-model"},{fetch:async(url,options)=>{
  calls.push({url,options});
  if(calls.length===1)return {ok:false,status:503,json:async()=>({error:{message:"Temporarily unavailable"}})};
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{thought:true,text:"Private thought"},{text:"Actual tutor answer"}]}}]})};
 }});
 const result=await h.functions.generateAiResponse({auth:{uid:"u1"},data:{contents:"Isolated question",feature:"tutor"}});
 assert.equal(result.text,"Actual tutor answer");assert.equal(result.model,"gemini-3.5-flash-lite");assert.equal(calls.length,2);assert.equal(calls[0].url,calls[1].url);
 assert.equal(JSON.parse(calls[0].options.body).generationConfig.thinkingConfig.thinkingLevel,"minimal");
});
test("Tutor timeout never repeats an unconfirmed provider generation",async()=>{
 let calls=0;const h=harness({}, {fetch:async()=>{calls++;throw new Error("The operation timed out");}});
 await assert.rejects(h.functions.generateAiResponse({auth:{uid:"u1"},data:{contents:"Isolated question",feature:"tutor"}}),error=>error.details.reason==="AI_TIMEOUT");assert.equal(calls,1);
});

// Exercise the exported handlers against an isolated transaction store. No
// Firebase credentials, Gemini calls, Telegram messages or payments are made.
function harness(env = {}, overrides = {}) {
  const records = new Map();
  const stamp = (date) => ({ toDate: () => new Date(date) });
  const merge = (base, patch) => {
    const result = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (value?.deleteField)
        delete result[key];
      else if (value?.increment !== undefined)
        result[key] = (Number(result[key]) || 0) + value.increment;
      else if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !value.toDate
      )
        result[key] = merge(result[key] || {}, value);
      else result[key] = value;
    }
    return result;
  };
  const ref = (path) => ({
    path,
    collection: (name) => collection(`${path}/${name}`),
    get: async () => snapshot(path),
    set: async (data, opts) => write(path, data, opts),
    create: async (data) => {
      if (records.has(path))
        throw Object.assign(new Error("exists"), { code: 6 });
      write(path, data);
    },
  });
  const collection = (path) => ({
    path,
    orderBy: () => {
      let after = "";
      const sorted = {
        startAfter(value) { after = value; return sorted; },
        limit(count) { return { get: async () => ({ docs: [...records.entries()].filter(([key]) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1 && key.split("/").at(-1) > after).sort(([a], [b]) => a.localeCompare(b)).slice(0, count).map(([key, data]) => ({ id: key.split("/").at(-1), data: () => data })) }) }; },
      };
      return sorted;
    },
    count: () => ({ get: async () => ({ data: () => ({ count: [...records.keys()].filter((key) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1).length }) }) }),
    where: (field, operator, value) => {
      const exec = async (count) => {
        let docs = [...records.entries()]
          .filter(([key, data]) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1 && operator === "==" && data[field] === value);
        if (count !== undefined) docs = docs.slice(0, count);
        const mapped = docs.map(([key, data]) => ({ id: key.split("/").at(-1), data: () => data, ref: ref(key) }));
        return { docs: mapped, empty: !mapped.length };
      };
      return {
        queryPath: path,
        get: async () => exec(),
        limit: (count) => ({
          queryPath: path,
          get: async () => exec(count),
        }),
      };
    },
    doc: (id = crypto.randomBytes(8).toString("hex")) => ref(`${path}/${id}`),
    limit: (count) => ({ queryPath: path, get: async () => ({ docs: [...records.entries()].filter(([key]) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1).slice(0, count).map(([key, data]) => ({ id: key.split("/").at(-1), data: () => data })) }) }),
  });
  const snapshot = (path) => ({
    exists: records.has(path),
    data: () => records.get(path),
    ref: ref(path),
  });
  const write = (path, data, opts) =>
    records.set(path, merge(opts?.merge ? records.get(path) || {} : {}, data));
  let tail = Promise.resolve();
  const db = {
    doc: ref,
    collection,
    batch: () => {
      const ops = [];
      return {
        set: (target, data, opts) => ops.push(() => write(target.path, data, opts)),
        delete: (target) => ops.push(() => records.delete(target.path)),
        commit: async () => { ops.forEach((op) => op()); },
      };
    },
    runTransaction: (fn) => {
      const run = tail.then(async () => {
        const pending = [];
        const tx = {
          get: async (target) => {
            if (typeof target.get === "function") {
              return await target.get();
            }
            if (target.queryPath) {
              const docs = [...records.entries()]
                .filter(([key]) => key.startsWith(`${target.queryPath}/`) && key.split("/").length === target.queryPath.split("/").length + 1)
                .map(([key, data]) => ({ id: key.split("/").at(-1), data: () => data, ref: ref(key) }));
              return { docs, empty: !docs.length };
            }
            return snapshot(target.path);
          },
          set: (target, data, opts) =>
            pending.push(() => write(target.path, data, opts)),
          create: (target, data) => {
            if (records.has(target.path)) throw new Error("exists");
            pending.push(() => write(target.path, data));
          },
          update: (target, data) =>
            pending.push(() => write(target.path, data, { merge: true })),
          delete: (target) => pending.push(() => records.delete(target.path)),
        };
        const result = await fn(tx);
        pending.forEach((operation) => operation());
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  class HttpsError extends Error {
    constructor(code, message, details) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  const handler = (...args) => args.at(-1);
  const services = {
    "firebase-admin": { apps: [], initializeApp() {}, auth: () => ({}) },
    "firebase-admin/firestore": {
      getFirestore: () => db,
      FieldValue: {
        increment: (increment) => ({ increment }),
        serverTimestamp: () => stamp(Date.now()),
        delete: () => ({ deleteField: true }),
      },
      Timestamp: {
        fromDate: stamp,
        fromMillis: stamp,
        now: () => stamp(Date.now()),
      },
    },
    "firebase-functions/v2": {
      logger: { info() {}, warn() {}, error() {} },
      setGlobalOptions() {},
    },
    "firebase-functions/v2/firestore": { onDocumentCreated: handler, onDocumentWritten: handler },
    "firebase-functions/v2/https": {
      onCall: handler,
      onRequest: handler,
      HttpsError,
    },
    "firebase-functions/v2/scheduler": { onSchedule: handler },
    "node:crypto": crypto,
    "./policy": require("./policy"),
    "./community": require("./community"),
    "./metrics": require("./metrics"),
    "./appUrl": require("./appUrl"),
  };
  const context = {
    exports: {},
    require: (name) => services[name],
    process: {
      env: {
        GEMINI_API_KEY: "test-key",
        PAYMENT_WEBHOOK_SECRET: "payment-secret",
        TELEGRAM_BOT_TOKEN: "test-bot",
        TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
        ...env,
      },
    },
    Buffer,
    Date,
    Intl,
    URL,
    AbortSignal,
    fetch: overrides.fetch || (async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        result: { username: "noviqq_bot" },
        candidates: [{ content: { parts: [{ text: "answer" }] } }],
      }),
    })),
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/index.js`, "utf8"), context);
  records.set("users/u1", {
    uid: "u1",
    xp: 0,
    subscription: { plan: "free", status: "active" },
    dailyTargetMinutes: 30,
  });
  const response = () => ({
    code: 200,
    status(code) {
      this.code = code;
      return this;
    },
    send(value) {
      this.body = value;
    },
    json(value) {
      this.body = value;
    },
  });
  return { functions: context.exports, records, snapshot, response, stamp };
}
const auth = { uid: "u1", token: {} };

test('Telegram webhook requires configuration and secret, validates update IDs and deduplicates zero', async () => {
  for (const env of [{ TELEGRAM_WEBHOOK_SECRET: '' }, { TELEGRAM_BOT_TOKEN: '' }]) {
    const h = harness(env), res = h.response();
    await h.functions.telegramWebhook({ method: 'POST', get: () => 'telegram-secret', body: {} }, res);
    assert.equal(res.code, 503);
  }
  const h = harness(), denied = h.response();
  await h.functions.telegramWebhook({ method: 'POST', get: () => 'forged', body: {} }, denied);
  assert.equal(denied.code, 401);
  const invalid = h.response();
  await h.functions.telegramWebhook({ method: 'POST', get: () => 'telegram-secret', body: { update_id: '../bad' } }, invalid);
  assert.equal(invalid.code, 400);
  const first = h.response(), duplicate = h.response();
  const request = { method: 'POST', get: () => 'telegram-secret', body: { update_id: 0 } };
  await h.functions.telegramWebhook(request, first);
  await h.functions.telegramWebhook(request, duplicate);
  assert.equal(duplicate.body.duplicate, true);
});

test("community counts are read-only and available only to actual group members", async () => {
  const h = harness();
  h.records.set("communities/g1/members/u1", { uid: "u1" });
  h.records.set("communities/g1/members/u2", { uid: "u2" });
  const before = h.records.size;
  const result = await h.functions.getCommunityMemberCount({ auth, data: { communityId: "g1" } });
  assert.equal(result.count, 2); assert.equal(h.records.size, before);
  await assert.rejects(h.functions.getCommunityMemberCount({ auth: { uid: "stranger" }, data: { communityId: "g1" } }), { code: "permission-denied" });
});

test("legacy author lookup reveals only real group message authors' display names", async () => {
  const h = harness();
  h.records.set("communities/g1/members/u1", { uid: "u1" });
  h.records.set("communities/g1/messages/m1", { userId: "u2", content: "isolated test" });
  h.records.set("communities/g1/messages/m2", { userId: "deleted" });
  h.records.set("users/u2", { displayName: "Existing profile name", email: "private@example.invalid" });
  h.records.set("users/outsider", { displayName: "Private outsider" });
  const before = h.records.size;
  const result = await h.functions.getCommunityMemberCount({ auth, data: { communityId: "g1", authorIds: ["u2", "deleted", "outsider"] } });
  assert.equal(result.authors.u2, "Existing profile name");
  assert.equal(result.authors.deleted, null);assert.equal(result.authors.outsider, null);
  assert.equal(JSON.stringify(result).includes("private@example.invalid"), false);assert.equal(h.records.size, before);
  await assert.rejects(h.functions.getCommunityMemberCount({ auth: {uid:"outsider"}, data:{communityId:"g1",authorIds:["u2"]} }), {code:"permission-denied"});
  await assert.rejects(h.functions.getCommunityMemberCount({ auth, data:{communityId:"g1",authorIds:["../private"]} }), {code:"invalid-argument"});
});

test("AI backend reports missing credentials, timeout, empty answer and rate errors without exposing secrets", async () => {
  const missing = harness({ GEMINI_API_KEY: "" });
  await assert.rejects(missing.functions.generateAiResponse({ auth, data: { contents: "test", feature: "planner" } }), { code: "failed-precondition" });
  for (const [fetch, reason] of [
    [async () => { throw new Error("The operation timed out"); }, "AI_TIMEOUT"],
    [async () => ({ ok: true, json: async () => ({ candidates: [] }) }), "AI_EMPTY_RESPONSE"],
    [async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "quota 429" } }) }), "AI_QUOTA_OR_RATE_LIMIT"],
  ]) {
    const h = harness({}, { fetch });
    await assert.rejects(h.functions.generateAiResponse({ auth, data: { contents: "test", feature: "planner", retries: 0 } }), (error) => error.code === "unavailable" && error.details?.reason === reason);
  }
});

test("AI requires authentication and rejects concurrent quota overflow", async () => {
  const h = harness();
  await assert.rejects(
    h.functions.generateAiResponse({ data: { contents: "hello" } }),
    { code: "unauthenticated" },
  );
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      h.functions.generateAiResponse({
        auth,
        data: { contents: "hello", feature: "tutor" },
      }),
    ),
  );
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 5);
  assert.equal(
    results.filter((item) => item.status === "rejected")[0].reason.message,
    "AI_DAILY_LIMIT",
  );
});
test("analytics retry increments nested counters exactly once", async () => {
  const h = harness();
  h.records.set("analyticsEvents/e1", {
    userId: "u1",
    eventType: "site_visit",
    details: { pageViews: 99999 },
  });
  const event = { data: { ref: h.snapshot("analyticsEvents/e1").ref } };
  await Promise.all([
    h.functions.onAnalyticsEventCreated(event),
    h.functions.onAnalyticsEventCreated(event),
  ]);
  assert.equal(h.records.get("analytics/summary").pageViews, 1);
  assert.equal(h.records.get("analytics/summary").eventCounts.site_visit, 1);
  assert.equal(h.records.get("analyticsUsers/u1").pageViews, 1);
});
test("forged XP awards do not earn raw XP or invented bonuses", async () => {
  const h = harness();
  h.records.set("users/u1/progressEvents/e1", {
    type: "xp_award",
    rawXp: 30,
    awards: [
      { key: "bonus:monthly-goals:fake" },
      { key: "daily-mission-complete:fake" },
    ],
  });
  await h.functions.onProgressEventCreated({
    params: { userId: "u1", eventId: "e1" },
  });
  assert.equal(h.records.get("users/u1").xp, 5);
  h.records.set("users/u1/progressEvents/e2", { type: "xp_award", rawXp: 30 });
  await h.functions.onProgressEventCreated({
    params: { userId: "u1", eventId: "e2" },
  });
  assert.equal(h.records.get("users/u1").xp, 5);
});
test("study session completion requires a server-issued start and caps elapsed time", async () => {
  const h = harness();
  const sessionId = "a".repeat(32);
  await assert.rejects(
    h.functions.completeStudySession({
      auth,
      data: { sessionId, duration: 3600, subject: "Math" },
    }),
    { code: "failed-precondition" },
  );
  h.records.set("users/u1/trusted/activeSession", {
    id: sessionId,
    category: "focus",
    startedAt: h.stamp(Date.now() - 120000),
    completed: false,
  });
  const request = {
    auth,
    data: { sessionId, duration: 3600, subject: "Math" },
  };
  await Promise.all([
    h.functions.completeStudySession(request),
    h.functions.completeStudySession(request),
  ]);
  assert.ok(
    h.records.get(`users/u1/studySessions/${sessionId}`).duration <= 121,
  );
  assert.equal(
    h.records.get(`users/u1/studySessions/${sessionId}`).xpEarned,
    2,
  );
});
test("valid session triggers can arrive out of order without losing or duplicating XP", async () => {
  const h = harness();
  const now = Date.now();
  for (const [id, ended] of [
    ["early", now - 300000],
    ["late", now - 120000],
  ]) {
    h.records.set(`users/u1/studySessions/${id}`, {
      userId: "u1",
      verified: true,
      category: "focus",
      duration: 60,
      timestamp: new Date(ended).toISOString(),
      xpEarned: 99999,
    });
    h.records.set(`users/u1/progressEvents/session-${id}`, {
      type: "study_session",
      sessionId: id,
    });
  }
  for (const id of ["late", "early", "late"]) {
    await h.functions.onProgressEventCreated({
      params: { userId: "u1", eventId: `session-${id}` },
    });
  }
  assert.equal(h.records.get("users/u1").xp, 7);
  assert.equal(h.records.get("users/u1").totalStudySeconds, 120);
  assert.equal(
    h.records.get("users/u1").lastStudySessionAt,
    new Date(now - 120000).toISOString(),
  );
});
test("unconfigured online payments fail before creating a checkout", async () => {
  const h = harness();
  await assert.rejects(
    h.functions.createSubscriptionCheckout({
      auth,
      data: { billingCycle: "monthly", provider: "click", amount: 1 },
    }),
    { code: "failed-precondition" },
  );
  assert.equal(
    [...h.records.keys()].filter((key) => key.includes("subscriptionCheckouts"))
      .length,
    0,
  );
});
test("payment validation rejects a wrong amount and replay does not extend subscription", async () => {
  const h = harness();
  const checkout = {
    plan: "pro",
    provider: "click",
    billingCycle: "monthly",
    amount: 39000,
    currency: "UZS",
    status: "pending",
  };
  h.records.set("users/u1/subscriptionCheckouts/c1", checkout);
  const body = {
    userId: "u1",
    checkoutId: "c1",
    provider: "click",
    amount: 1,
    currency: "UZS",
    transactionId: "tx1",
  };
  const request = { method: "POST", get: () => "payment-secret", body };
  let res = h.response();
  await h.functions.paymentWebhook(request, res);
  assert.equal(res.code, 400);
  body.amount = 39000;
  res = h.response();
  await h.functions.paymentWebhook(request, res);
  assert.equal(res.code, 200);
  const periodEnd = h.records.get("users/u1").subscription.currentPeriodEnd;
  await h.functions.paymentWebhook(request, h.response());
  assert.equal(
    h.records.get("users/u1").subscription.currentPeriodEnd,
    periodEnd,
  );
});
test("Telegram rejects UID linking, expired tokens and token reuse", async () => {
  const h = harness();
  const token = (await h.functions.createTelegramLink({ auth })).token;
  const call = async (payload) => {
    const res = h.response();
    await h.functions.telegramWebhook(
      {
        method: "POST",
        get: () => "telegram-secret",
        body: {
          message: {
            text: `/start link_${payload}`,
            chat: { id: 123456, type: "private" },
            from: {},
          },
        },
      },
      res,
    );
    return res;
  };
  assert.equal((await call("u1")).body.linked, false);
  assert.equal((await call(token)).body.linked, true);
  assert.equal((await call(token)).body.linked, false);
  const expired = (await h.functions.createTelegramLink({ auth })).token;
  const hash = crypto.createHash("sha256").update(expired).digest("hex");
  h.records.get(`telegramLinks/${hash}`).expiresAt = h.stamp(Date.now() - 1000);
  assert.equal((await call(expired)).body.linked, false);
});

test("Telegram planner and metrics require a linked private account", async () => {
  const h = harness();
  h.records.get("users/u1").telegramId = "123456";
  for (const command of ["/planner", "/metrics"]) {
    const response = h.response();
    await h.functions.telegramWebhook({ method: "POST", get: () => "telegram-secret",
      body: { message: { text: command, chat: { id: 123456, type: "private" } } } }, response);
    assert.equal(response.body.linked, true);
    const unknown = h.response();
    await h.functions.telegramWebhook({ method: "POST", get: () => "telegram-secret",
      body: { message: { text: command, chat: { id: 999999, type: "private" } } } }, unknown);
    assert.equal(unknown.body.linked, false);
    const group = h.response();
    await h.functions.telegramWebhook({ method: "POST", get: () => "telegram-secret",
      body: { message: { text: command, chat: { id: 123456, type: "group" } } } }, group);
    assert.equal(group.body.ignored, true);
  }
});

test("Cross-account Telegram data isolation, switching confirmation and task ownership (Phase 5)", async () => {
  const sentMessages = [];
  const h = harness({}, {
    fetch: async (url, options) => {
      if (url.includes("sendMessage")) {
        const payload = JSON.parse(options.body || "{}");
        sentMessages.push(payload);
        return { ok: true, json: async () => ({ ok: true, result: { message_id: 101 } }) };
      }
      return { ok: true, json: async () => ({ ok: true, result: { username: "noviqq_bot" } }) };
    },
  });

  // Setup Account A
  h.records.set("users/test-user-A", {
    uid: "test-user-A",
    displayName: "User A",
    xp: 100,
    streak: 3,
    dailyTargetMinutes: 30,
    subscription: { plan: "free", status: "active" },
  });
  h.records.set("users/test-user-A/planner/smart-v2", {
    tasks: [{ id: "task-A", title: "Task A", completed: false }],
  });

  // Setup Account B
  h.records.set("users/test-user-B", {
    uid: "test-user-B",
    displayName: "User B",
    xp: 900,
    streak: 12,
    dailyTargetMinutes: 45,
    subscription: { plan: "pro", status: "active" },
  });
  h.records.set("users/test-user-B/planner/smart-v2", {
    tasks: [{ id: "task-B", title: "Task B", completed: false }],
  });

  const chatId = 777888;
  const sendCmd = async (text) => {
    const res = h.response();
    await h.functions.telegramWebhook(
      {
        method: "POST",
        get: () => "telegram-secret",
        body: { message: { text, chat: { id: chatId, type: "private" }, from: {} } },
      },
      res,
    );
    return res;
  };

  const sendCallback = async (data) => {
    const res = h.response();
    await h.functions.telegramWebhook(
      {
        method: "POST",
        get: () => "telegram-secret",
        body: {
          callback_query: {
            id: "cb_1",
            data,
            message: { chat: { id: chatId } },
            from: { username: "student" },
          },
        },
      },
      res,
    );
    return res;
  };

  // 1. Link T to Account A
  const tokenA = (await h.functions.createTelegramLink({ auth: { uid: "test-user-A" } })).token;
  const linkResA = await sendCmd(`/start link_${tokenA}`);
  assert.equal(linkResA.body.linked, true);
  assert.equal(h.records.get("users/test-user-A").telegramId, String(chatId));

  // 2. Verify /metrics and /planner display ONLY A's data
  sentMessages.length = 0;
  await sendCmd("/metrics");
  const metricsA = sentMessages.at(-1)?.text || "";
  assert.ok(metricsA.includes("100"), "Must display A's XP (100)");
  assert.ok(metricsA.includes("3"), "Must display A's Streak (3)");
  assert.ok(!metricsA.includes("900"), "Must NOT display B's XP (900)");
  assert.ok(!metricsA.includes("12"), "Must NOT display B's Streak (12)");

  sentMessages.length = 0;
  await sendCmd("/planner");
  const plannerA = sentMessages.at(-1)?.text || "";
  assert.ok(plannerA.includes("Task A"), "Must display A's task (Task A)");
  assert.ok(!plannerA.includes("Task B"), "Must NOT display B's task (Task B)");

  // 3 & 4. Attempt to link T to Account B -> Requires switching confirmation!
  const tokenB = (await h.functions.createTelegramLink({ auth: { uid: "test-user-B" } })).token;
  const linkResB = await sendCmd(`/start link_${tokenB}`);
  assert.equal(linkResB.body.switchConfirmationRequired, true);
  assert.equal(linkResB.body.previousUid, "test-user-A");
  assert.equal(linkResB.body.targetUid, "test-user-B");
  assert.ok(linkResB.body.actionId, "Must return short actionId");

  // Verify that EVERY inline button callback_data is <= 64 bytes!
  const switchMsg = sentMessages.at(-1);
  const switchButtons = switchMsg?.reply_markup?.inline_keyboard?.flat() || [];
  assert.ok(switchButtons.length >= 2, "Must send at least confirm and cancel buttons");
  for (const btn of switchButtons) {
    if (btn.callback_data) {
      const byteLen = Buffer.byteLength(btn.callback_data, "utf8");
      assert.ok(byteLen <= 64, `Button callback_data "${btn.callback_data}" exceeds 64 bytes (${byteLen} bytes)`);
    }
  }

  // Account A is STILL linked at this point
  assert.equal(h.records.get("users/test-user-A").telegramId, String(chatId));
  assert.equal(h.records.get("users/test-user-B").telegramId, undefined);

  // 5. Complete switch to Account B via switch_confirm callback using actionId
  const switchRes = await sendCallback(`switch_confirm:${linkResB.body.actionId}`);
  assert.equal(switchRes.body.switched, true);
  assert.equal(switchRes.body.targetUid, "test-user-B");

  // Replaying switch_confirm must fail (single-use protection)
  const replayCallbackRes = await sendCallback(`switch_confirm:${linkResB.body.actionId}`);
  assert.equal(replayCallbackRes.body.switched, false);

  // 6. Verify /metrics and /planner display ONLY B's data
  sentMessages.length = 0;
  await sendCmd("/metrics");
  const metricsB = sentMessages.at(-1)?.text || "";
  assert.ok(metricsB.includes("900"), "Must display B's XP (900)");
  assert.ok(metricsB.includes("12"), "Must display B's Streak (12)");
  assert.ok(!metricsB.includes("100"), "Must NOT display A's XP (100)");
  assert.ok(!metricsB.includes("3"), "Must NOT display A's Streak (3)");

  sentMessages.length = 0;
  await sendCmd("/planner");
  const plannerB = sentMessages.at(-1)?.text || "";
  assert.ok(plannerB.includes("Task B"), "Must display B's task (Task B)");
  assert.ok(!plannerB.includes("Task A"), "Must NOT display A's task (Task A)");

  // 7 & 8. Verify Account A is no longer linked, and Account A's study data is unchanged
  assert.equal(h.records.get("users/test-user-A").telegramId, undefined, "Account A must be unlinked");
  assert.equal(h.records.get("users/test-user-A").xp, 100, "Account A XP must be untouched");
  assert.equal(h.records.get("users/test-user-A").streak, 3, "Account A streak must be untouched");
  assert.equal(h.records.get("users/test-user-A/planner/smart-v2").tasks[0].completed, false, "Account A tasks must be untouched");

  // 9. Verify old inline callbacks (for Task A) cannot modify Account A or award XP to Account B
  const taskDoneOld = await sendCallback("task_done:task-A");
  assert.equal(taskDoneOld.body.taskCompleted, false);
  assert.equal(taskDoneOld.body.error, "TASK_NOT_OWNED");
  assert.equal(h.records.get("users/test-user-A/planner/smart-v2").tasks[0].completed, false);
  assert.equal(h.records.get("users/test-user-A").xp, 100);
  assert.equal(h.records.get("users/test-user-B").xp, 900); // No unearned XP awarded

  // Task B completion works for Account B
  const taskDoneB = await sendCallback("task_done:task-B");
  assert.equal(taskDoneB.body.taskCompleted, "task-B");
  assert.equal(h.records.get("users/test-user-B/planner/smart-v2").tasks[0].completed, true);
  assert.equal(h.records.get("users/test-user-B").xp, 920, "Account B must receive +20 XP");

  // 10. Verify unlinking B does NOT restore Account A
  const unlinkRes = await sendCallback("unlink_confirm");
  assert.equal(unlinkRes.body.unlinked, true);
  assert.equal(h.records.get("users/test-user-B").telegramId, undefined);
  assert.equal(h.records.get("users/test-user-A").telegramId, undefined, "Account A must NOT be restored");
  const postUnlink = await sendCmd("/metrics");
  assert.equal(postUnlink.body.linked, false);

  // 11. Test parallel linking requests and replayed tokens
  const replayRes = await sendCmd(`/start link_${tokenB}`);
  assert.equal(replayRes.body.linked, false, "Consumed token must be rejected");
});

test("independent study contexts resume and survive another task starting", async () => {
  const h = harness();
  const focus = await h.functions.startStudySession({
    auth,
    data: { category: "focus", context: "focus" },
  });
  const planner = await h.functions.startStudySession({
    auth,
    data: { category: "quiz", context: "planner-task" },
  });
  assert.notEqual(focus.sessionId, planner.sessionId);
  const resumed = await h.functions.startStudySession({
    auth,
    data: { category: "quiz", context: "planner-task" },
  });
  assert.equal(resumed.sessionId, planner.sessionId);
  assert.equal(resumed.resumed, true);
  h.records.get(`users/u1/trusted/start-${focus.sessionId}`).startedAt =
    h.stamp(Date.now() - 240000);
  h.records.get(`users/u1/trusted/start-${planner.sessionId}`).startedAt =
    h.stamp(Date.now() - 240000);
  await h.functions.completeStudySession({
    auth,
    data: { sessionId: focus.sessionId, duration: 120, subject: "Focus" },
  });
  await h.functions.completeStudySession({
    auth,
    data: { sessionId: planner.sessionId, duration: 120, subject: "Quiz" },
  });
  assert.equal(
    h.records.get(`users/u1/studySessions/${planner.sessionId}`).duration,
    120,
  );
  const fresh = await h.functions.startStudySession({
    auth,
    data: { category: "quiz", context: "planner-task" },
  });
  assert.notEqual(fresh.sessionId, planner.sessionId);
});
test("parallel timers cannot credit more time than the server wall clock", async () => {
  const h = harness();
  const starts = await Promise.all(
    ["focus", "planner"].map((context) =>
      h.functions.startStudySession({
        auth,
        data: { category: "focus", context },
      }),
    ),
  );
  for (const start of starts)
    h.records.get(`users/u1/trusted/start-${start.sessionId}`).startedAt =
      h.stamp(Date.now() - 120000);
  await h.functions.completeStudySession({
    auth,
    data: { sessionId: starts[0].sessionId, duration: 120, subject: "Focus" },
  });
  await assert.rejects(
    h.functions.completeStudySession({
      auth,
      data: {
        sessionId: starts[1].sessionId,
        duration: 120,
        subject: "Planner",
      },
    }),
    { code: "failed-precondition" },
  );
});
test("community membership writes are atomic and repeat joins/leaves preserve counts", async () => {
  const h = harness();
  h.records.set("users/u2", { displayName: "Friend" });
  const { communityId } = await h.functions.createCommunity({
    auth,
    data: { name: "Study together", description: "Practice" },
  });
  assert.equal(h.records.get(`communities/${communityId}`).membersCount, 1);
  assert.equal(
    h.records.get(`users/u1/joinedCommunities/${communityId}`).role,
    "owner",
  );
  const friend = { uid: "u2", token: {} };
  await Promise.all(
    [1, 2].map(() =>
      h.functions.joinCommunity({ auth: friend, data: { communityId } }),
    ),
  );
  assert.equal(h.records.get(`communities/${communityId}`).membersCount, 2);
  await assert.rejects(
    h.functions.leaveCommunity({ auth, data: { communityId } }),
    { code: "failed-precondition" },
  );
  await Promise.all(
    [1, 2].map(() =>
      h.functions.leaveCommunity({ auth: friend, data: { communityId } }),
    ),
  );
  assert.equal(h.records.get(`communities/${communityId}`).membersCount, 1);
  assert.equal(
    h.records.has(`users/u2/joinedCommunities/${communityId}`),
    false,
  );
});
test("legacy joined groups can restore their existing member connection", async () => {
  const h = harness();
  h.records.set("communities/legacy", {
    name: "General",
    isPublic: false,
    createdBy: "owner",
    membersCount: 1,
  });
  h.records.set("users/u1/joinedCommunities/legacy", {
    name: "General",
    role: "member",
    joinedAt: "2026-01-02T03:04:05.000Z",
  });

  await h.functions.joinCommunity({
    auth,
    data: { communityId: "legacy" },
  });

  assert.equal(h.records.get("communities/legacy/members/u1").role, "member");
  assert.equal(
    h.records.get("communities/legacy/members/u1").joinedAt,
    "2026-01-02T03:04:05.000Z",
  );
  assert.equal(h.records.get("communities/legacy").membersCount, 2);
});
test("chat requires membership, preserves retry IDs and limits message spam", async () => {
  const h = harness(),
    communityId = "room";
  const request = {
    auth,
    data: { communityId, content: "Hello", messageId: "message-1" },
  };
  await assert.rejects(h.functions.sendCommunityMessage(request), {
    code: "permission-denied",
  });
  h.records.set("communities/room/members/u1", { displayName: "Student" });
  await Promise.all(
    [1, 2].map(() => h.functions.sendCommunityMessage(request)),
  );
  assert.equal(h.records.get("users/u1/trusted/communityMessageRate").count, 1);
  assert.equal(
    h.records.get("communities/room/messages/message-1").displayName,
    "Student",
  );
  await assert.rejects(
    h.functions.sendCommunityMessage({
      ...request,
      data: { ...request.data, content: "Changed" },
    }),
    { code: "already-exists" },
  );
  const results = await Promise.allSettled(
    Array.from({ length: 31 }, (_, i) =>
      h.functions.sendCommunityMessage({
        auth,
        data: { communityId, content: "Message", messageId: `next-${i}` },
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 29);
  await assert.rejects(
    h.functions.sendCommunityMessage({
      auth,
      data: { communityId, content: "x".repeat(2001), messageId: "large" },
    }),
    { code: "invalid-argument" },
  );
});
test("friend invites require the intended verified recipient and create reciprocal friendships once", async () => {
  const h = harness(),
    sender = {
      uid: "u1",
      token: { email: "sender@example.com", email_verified: true },
    },
    recipient = {
      uid: "u2",
      token: { email: "friend@example.com", email_verified: true },
    };
  h.records.set("users/u2", { displayName: "Friend" });
  const { token } = await h.functions.createFriendInvite({
    auth: sender,
    data: { email: "FRIEND@example.com" },
  });
  await assert.rejects(
    h.functions.acceptFriendInvite({ auth: sender, data: { token } }),
    { code: "permission-denied" },
  );
  await assert.rejects(
    h.functions.acceptFriendInvite({
      auth: {
        uid: "u3",
        token: { email: "stranger@example.com", email_verified: true },
      },
      data: { token },
    }),
    { code: "permission-denied" },
  );
  await assert.rejects(
    h.functions.acceptFriendInvite({
      auth: {
        ...recipient,
        token: { email: "friend@example.com", email_verified: false },
      },
      data: { token },
    }),
    { code: "failed-precondition" },
  );
  const preview = await h.functions.getFriendInvite({
    auth: recipient,
    data: { token },
  });
  assert.equal(preview.status, "pending");
  await Promise.all(
    [1, 2].map(() =>
      h.functions.acceptFriendInvite({ auth: recipient, data: { token } }),
    ),
  );
  assert.equal(
    h.records.get("users/u1/friends/u2").email,
    "friend@example.com",
  );
  assert.equal(
    h.records.get("users/u2/friends/u1").email,
    "sender@example.com",
  );
  assert.equal(
    h.records.get(`users/u1/friendInvites/${token}`).status,
    "accepted",
  );
});
test("expired invitations and self invitations are rejected", async () => {
  const h = harness(),
    sender = { uid: "u1", token: { email: "sender@example.com" } };
  await assert.rejects(
    h.functions.createFriendInvite({
      auth: sender,
      data: { email: "sender@example.com" },
    }),
    { code: "invalid-argument" },
  );
  const { token } = await h.functions.createFriendInvite({
    auth: sender,
    data: { email: "friend@example.com" },
  });
  h.records.get(`friendInvitations/${token}`).expiresAt = new Date(
    Date.now() - 1000,
  ).toISOString();
  await assert.rejects(
    h.functions.acceptFriendInvite({
      auth: {
        uid: "u2",
        token: { email: "friend@example.com", email_verified: true },
      },
      data: { token },
    }),
    { code: "deadline-exceeded" },
  );
});

test("expired study proofs restart cleanly and cannot complete old work", async () => {
  const h = harness();
  const original = await h.functions.startStudySession({
    auth,
    data: { category: "quiz", context: "planner-expired" },
  });
  const key = crypto
    .createHash("sha256")
    .update("planner-expired")
    .digest("hex");
  for (const path of [
    `users/u1/trusted/session-${key}`,
    `users/u1/trusted/start-${original.sessionId}`,
  ])
    h.records.get(path).startedAt = h.stamp(Date.now() - 9 * 3600000);
  const restarted = await h.functions.startStudySession({
    auth,
    data: { category: "quiz", context: "planner-expired" },
  });
  assert.equal(restarted.resumed, false);
  assert.notEqual(restarted.sessionId, original.sessionId);
  await assert.rejects(
    h.functions.completeStudySession({
      auth,
      data: { sessionId: original.sessionId, duration: 120, subject: "Quiz" },
    }),
    { code: "failed-precondition" },
  );
});
