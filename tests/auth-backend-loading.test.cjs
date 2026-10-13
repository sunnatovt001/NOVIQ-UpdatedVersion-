const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');
const tree = ts.createSourceFile('AuthContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'onAuthStateChanged') callback = node.arguments[1].getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(callback);
function harness() {
  const loads = [], errors = [], loading = [], listeners = [], publications = [];
  const context = {
    exports: {}, accountRevision: 0, isDisposed: false, auth: { currentUser: { uid: 'u1' } },
    loadTimer: 0, clearTimeout() {}, deadline() {}, unsubscribeProfile: undefined, unsubscribeTrustedProgress: undefined,
    latestBaseProfile: null, latestTrustedProgress: {}, latestResolvedAdmin: false,
    publishProfile: () => publications.push(context.latestBaseProfile),
    buildTrustedProgressPatch: value => value,
    console: { warn() {}, error() {} },
    loadLocalData: () => null, profileCacheKey: uid => uid,
    createInitialProfile: user => ({ uid: user.uid }),
    setUser() {}, setAuthError: value => errors.push(value), setProfile() {}, setIsAdmin() {}, setLoading: value => loading.push(value),
    getAccountErrorCode: () => 'unavailable', withDeadline: promise => promise,
    require: name => {
      loads.push(name);
      if (context.fail) throw new Error('Backend unavailable');
      return name === 'firebase/firestore'
        ? { doc: (_, ...path) => path.join('/'), onSnapshot: (...args) => { listeners.push(args); return () => {}; }, runTransaction: () => context.transaction() }
        : { db: {} };
    },
  };
  vm.runInNewContext(ts.transpileModule(`exports.run = ${callback}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { context, loads, errors, loading, listeners, publications, run: context.exports.run };
}
test('signed-out auth does not load profile backend', async () => {
  const h = harness(); await h.run(null);
  assert.equal(h.loads.length, 0); assert.equal(h.loading.at(-1), false);
});
test('signed-in auth loads backend and starts both profile listeners', async () => {
  const h = harness(); await h.run({ uid: 'u1' });
  assert.equal(h.loads.length, 2); assert.equal(h.listeners.length, 2);
});
test('backend import failure settles auth loading with a safe error', async () => {
  const h = harness(); h.context.fail = true; await h.run({ uid: 'u1' });
  assert.equal(h.errors.at(-1), 'unavailable'); assert.equal(h.loading.at(-1), false);
  assert.equal(h.listeners.length, 0);
});
test('sign-out during backend loading prevents stale profile listeners', async () => {
  const h = harness(); const pending = h.run({ uid: 'u1' });
  h.context.auth.currentUser = null; await h.run(null); await pending;
  assert.equal(h.listeners.length, 0); assert.equal(h.loading.at(-1), false);
});

test('old listener callbacks are ignored after re-entering the same account', async () => {
  const h = harness(); await h.run({ uid: 'u1' });
  const oldTrusted = h.listeners[0], oldProfile = h.listeners[1];
  await h.run(null); await h.run({ uid: 'u1' });
  const before = h.errors.length;
  oldTrusted[1]({ exists: () => true, data: () => ({ xp: 999 }) });
  await oldProfile[1]({ exists: () => true, data: () => ({ uid: 'u1' }) });
  oldProfile[2]({ code: 'permission-denied' });
  assert.equal(h.publications.length, 0);
  assert.equal(h.errors.length, before);
  assert.equal(Object.keys(h.context.latestTrustedProgress).length, 0);
});

test('late profile bootstrap rejection cannot overwrite a newer account state', async () => {
  const h = harness(); let reject, started;
  const began = new Promise(resolve => { started = resolve; });
  h.context.transaction = () => { started(); return new Promise((_, fail) => { reject = fail; }); };
  await h.run({ uid: 'u1', reload: async () => {} });
  const oldProfile = h.listeners[1];
  const pending = oldProfile[1]({ exists: () => false, metadata: { fromCache: false } });
  await began;
  h.context.auth.currentUser = { uid: 'u2' }; await h.run({ uid: 'u2' });
  const before = h.errors.length;
  reject(new Error('Old bootstrap failed')); await pending;
  assert.equal(h.errors.length, before);
  assert.equal(h.publications.length, 0);
});
