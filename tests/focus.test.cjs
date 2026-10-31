const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function compile(path) {
  return ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
}
const helper = {};
vm.runInNewContext(compile("src/lib/focusTimer.ts"), {
  exports: helper,
  setTimeout,
  clearTimeout,
});
const focusCopy = {};
vm.runInNewContext(compile("src/features/focus/focusCopy.ts"), {
  exports: focusCopy,
});

test("session verification fails promptly when the server is unreachable", async () => {
  await assert.rejects(
    helper.withFocusTimeout(() => new Promise(() => {}), 10),
    /timed out/,
  );
  assert.equal(await helper.withFocusTimeout(async () => "receipt"), "receipt");
  await assert.rejects(
    helper.withFocusTimeout(async () => {
      throw new Error("404");
    }),
    /404/,
  );
});

function focusHarness({
  start = async () => {
    throw new Error("404");
  },
  cached,
  plannerContext,
} = {}) {
  const slots = [],
    effects = [],
    intervals = new Map(),
    storage = new Map();
  if (cached) storage.set("noviq-focus-user", cached);
  if (plannerContext) storage.set('noviq:user:plannerFocusContext:v2', plannerContext);
  let index = 0,
    dirty = false,
    tree,
    now = 1000000,
    intervalId = 0,
    starts = 0,
    cloudWrites = 0;
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in slots))
        slots[slot] = typeof initial === "function" ? initial() : initial;
      return [
        slots[slot],
        (value) => {
          const next = typeof value === "function" ? value(slots[slot]) : value;
          if (!Object.is(next, slots[slot])) {
            slots[slot] = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const slot = index++;
      return (slots[slot] ||= { current: initial });
    },
    useCallback(fn) { return fn; },
    useMemo(factory) {
      return factory();
    },
    useEffect(fn, deps) {
      const slot = index++,
        previous = slots[slot];
      if (
        !previous ||
        deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
      ) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[slot] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const modules = {
    "@/src/lib/useVerifiedFocusSession": {useVerifiedFocusSession() {}},
    "@/src/features/pro/useStudyEvidence": {useStudyEvidence:()=>({records:(storage.get('noviq-focus-history-user')||[]).map(record=>({...record,userId:'user',category:'focus',xpEarned:0})),ready:true,error:false,deviceSeconds:0,retry:()=>{}})},
    "@/src/features/pro/activitySummary": {activityDay:value=>new Date(value).toISOString().slice(0,10),actualDuration:value=>String(value)},
    "@/src/features/planner/useSmartPlanner": {
      focusContextKey: uid => `noviq:${uid}:plannerFocusContext:v2`,
      recordPlannerFocus: (uid, id, seconds, timestamp, verified, context) => {
        if (context) storage.set(`planner-receipt-${id}`, {uid,id,seconds,timestamp,verified,context});
      },
    },
    react,
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "@/src/lib/localStore": {
      loadLocalData: (key, fallback) => storage.get(key) ?? fallback,
      trySaveLocalData: (key, value) => {
        storage.set(key, value);
        return true;
      },
    },
    "@/src/contexts/AuthContext": {
      useAuth: () => ({ user: { uid: "user" }, profile: {} }),
    },
    "@/src/contexts/LocaleContext": {
      useLocale: () => ({ locale: "en" }),
    },
    "@/src/features/focus/focusCopy": focusCopy,
    "@/src/lib/analytics": { trackUserEvent: async () => {} },
    "@/src/lib/progress": {
      calculateSessionXp: () => 10,
      startStudySession: () => {
        starts++;
        return start();
      },
      persistStudySession: async () => {
        cloudWrites++;
        return 'verified-receipt';
      },
    },
    "@/src/lib/focusTimer": {
      withFocusTimeout: (operation) => Promise.resolve().then(operation),
    },
    "motion/react": { motion: { div: "div" } },
    "lucide-react": {},
    "@/src/lib/utils": {
      formatTime: (seconds) =>
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
      cn: (...args) => args.join(" "),
    },
  };
  const exports = {};
  const setTestInterval = (fn) => {
    const id = ++intervalId;
    intervals.set(id, fn);
    return id;
  };
  const runtime = {
    exports: {},
    require: (name) => {
      if(name==='@/src/lib/visitStreak')return {visitStreaks:()=>({current:0,best:0})};
      if(name==='@/src/features/focus/FocusLock')return {FocusLock:()=>null};
      if(name==='@/src/features/pro/FocusReflection')return {FocusReflection:()=>null};
      assert.ok(name in modules, name);
      return modules[name];
    },
    Date: Clock,
    crypto: { randomUUID: () => `local-${now}` },
    console,
    window: { setInterval: setTestInterval,dispatchEvent:()=>{} },
    Event: class Event {},
    setInterval: setTestInterval,
    clearInterval: (id) => intervals.delete(id),
  };
  vm.runInNewContext('(function(){'+compile('src/features/focus/useFocusController.ts')+'\n})()', runtime);
  modules['@/src/features/focus/useFocusController'] = runtime.exports;
  runtime.exports = exports;
  vm.runInNewContext('(function(){'+compile('src/pages/Focus.tsx')+'\n})()', runtime);
  function render() {
    do {
      dirty = false;
      index = 0;
      tree = exports.Focus();
      effects.splice(0).forEach((fn) => fn());
    } while (dirty);
  }
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    return [
      node,
      ...[node.props?.children].flat(Infinity).flatMap((child) => nodes(child)),
    ];
  }
  render();
  return {
    storage,
    click(label) {
      const button = nodes(tree).find(
        (node) =>
          node.type === "button" &&
          (node.props["aria-label"] === label ||
            node.props.children?.includes?.(label)),
      );
      assert.ok(button, `Missing button: ${label}`);
      assert.ok(!button.props.disabled, `Disabled button: ${label}`);
      button.props.onClick({ stopPropagation() {} });
      render();
    },
    async settle() {
      for (let i = 0; i < 12; i++) {
        await Promise.resolve();
        render();
      }
    },
    tick(seconds) {
      now += seconds * 1000;
      [...intervals.values()].forEach((fn) => fn());
      render();
    },
    text: () => JSON.stringify(tree),
    get starts() {
      return starts;
    },
    get cloudWrites() {
      return cloudWrites;
    },
  };
}

test("missing backend does not block start, pause, resume or local completion", async () => {
  const app = focusHarness();
  app.click("Start timer");
  assert.match(app.text(), /Pause timer/);
  await app.settle();
  app.tick(60);
  assert.match(app.text(), /24:00/);
  app.click("Pause timer");
  app.tick(20);
  assert.match(app.text(), /24:00/);
  app.click("Start timer");
  assert.equal(app.starts, 1);
  app.click("End incomplete session");
  await app.settle();
  assert.match(app.text(), /Short break/);
  assert.equal(app.storage.get("noviq-focus-history-user")[0].duration, 60);
  assert.equal(app.cloudWrites, 0);
  app.click("Start timer");
  app.tick(300);
  await app.settle();
  assert.match(app.text(), /25:00/);
  app.click("Start timer");
  await app.settle();
  assert.equal(app.starts, 2);
});

test("reset ignores a late server response and remains responsive during verification", async () => {
  let resolve;
  const app = focusHarness({
    start: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  app.click("Start timer");
  await app.settle();
  app.click("Pause timer");
  app.click("Reset timer");
  resolve("late-receipt");
  await app.settle();
  assert.equal(app.storage.get("noviq-focus-user").sessionId, undefined);
  assert.match(app.text(), /25:00/);
});

test("verified focus sessions still use server completion", async () => {
  const app = focusHarness({ start: async () => "verified-receipt" });
  app.click("Start timer");
  await app.settle();
  app.tick(60);
  app.click("End incomplete session");
  await app.settle();
  assert.equal(app.cloudWrites, 1);
  assert.equal(app.storage.get("noviq-focus-history-user")[0].id, 'verified-receipt');
  assert.equal(app.storage.get("noviq-focus-history-user")[0].origin, 'server');
  assert.equal(app.storage.get("noviq-focus-history-user")[0].duration, 60);
  assert.match(app.text(), /Short break/);
});

test("restored device-only session resumes without losing elapsed time", async () => {
  const app = focusHarness({
    cached: {
      time: 1000,
      mode: "focus",
      startedAt: 999000,
      localOnly: true,
      localId: "restored",
    },
  });
  app.click("Start timer");
  await app.settle();
  app.tick(10);
  assert.equal(app.starts, 0);
  app.click("End incomplete session");
  await app.settle();
  assert.equal(app.storage.get("noviq-focus-history-user")[0].duration, 510);
});

test('Focus attributes completed local time to the selected Planner assignment', async () => {
  const app=focusHarness({plannerContext:{taskId:'assignment',title:'My homework',subject:'Physics'}});
  app.click('Start timer');await app.settle();app.tick(1200);app.click('Complete focus session');await app.settle();
  const receipts=[...app.storage.entries()].filter(([key])=>key.startsWith('planner-receipt-'));
  assert.equal(receipts.length,1);assert.equal(receipts[0][1].context.taskId,'assignment');assert.equal(receipts[0][1].seconds,1200);assert.equal(receipts[0][1].verified,false);
});

test('Focus attributes verified time once without creating an extra study session', async () => {
  const app=focusHarness({start:async()=> 'verified-receipt',plannerContext:{taskId:'assignment',title:'My homework',subject:'Physics'}});
  app.click('Start timer');await app.settle();app.tick(1200);app.click('Complete focus session');await app.settle();
  assert.equal(app.cloudWrites,1);assert.equal(app.storage.get('planner-receipt-verified-receipt').seconds,1200);
});

test('switching assignments cannot attribute a previous timer to the new assignment', async () => {
  const app=focusHarness({plannerContext:{taskId:'new',title:'New',subject:'Physics'},cached:{time:1000,mode:'focus',startedAt:999000,localOnly:true,localId:'old',plannerTaskId:'old'}});
  assert.match(app.text(),/25:00/);
});
