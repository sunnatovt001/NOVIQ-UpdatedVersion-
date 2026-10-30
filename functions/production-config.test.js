const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, logBackendError, createHandler } = require('./vercel.cjs');
const config = require('../firebase-applet-config.json');

const account = { project_id: config.projectId, client_email: 'test@example.invalid', private_key: 'test\\nkey' };
const envFor = patch => ({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...account, ...patch }) });
function fixture() {
  let initialized, loaded = 0;
  const admin = { apps: [], credential: { cert(value) { initialized = value; return {}; } }, initializeApp() {} };
  return { admin, load: () => { loaded++; return { ready: true }; }, get initialized() { return initialized; }, get loaded() { return loaded; } };
}
test('startup rejects missing, malformed and incomplete service accounts with safe codes', () => {
  for (const [env, code] of [
    [{}, 'BACKEND_NOT_CONFIGURED'],
    [{ FIREBASE_SERVICE_ACCOUNT_JSON: '{private secret' }, 'FIREBASE_CREDENTIAL_JSON_INVALID'],
    [{ FIREBASE_SERVICE_ACCOUNT_JSON: 'null' }, 'FIREBASE_CREDENTIAL_FIELDS_MISSING'],
    [envFor({ private_key: '' }), 'FIREBASE_CREDENTIAL_FIELDS_MISSING'],
    [envFor({ project_id: 'other-project' }), 'FIREBASE_PROJECT_MISMATCH'],
    [{ ...envFor(), FIRESTORE_DATABASE: '(default)' }, 'FIRESTORE_DATABASE_MISMATCH'],
  ]) {
    const f = fixture();
    assert.throws(createLoader(env, f.admin, f.load), { code });
    assert.equal(f.loaded, 0);
  }
});
test('startup normalizes PEM newlines and caches only a successful handler load', () => {
  const f = fixture(), load = createLoader(envFor(), f.admin, f.load);
  assert.equal(load().ready, true); load();
  assert.equal(f.initialized.private_key, 'test\nkey'); assert.equal(f.loaded, 1);
});
test('invalid PEM is classified without exposing credential parser details', () => {
  const f = fixture(); f.admin.credential.cert = () => { throw new Error('private key material'); };
  assert.throws(createLoader(envFor(), f.admin, f.load), { code: 'FIREBASE_PRIVATE_KEY_INVALID' });
});
test('configuration can recover after a failed initialization', () => {
  const env = {}, f = fixture(), load = createLoader(env, f.admin, f.load);
  assert.throws(load, { code: 'BACKEND_NOT_CONFIGURED' });
  Object.assign(env, envFor()); assert.equal(load().ready, true);
});
test('server diagnostics omit raw exception messages and stacks', () => {
  const original = console.error, logs = []; console.error = (...args) => logs.push(args);
  try {
    logBackendError(Object.assign(new Error('bot123:secret private-key'), { code: 'MODULE_NOT_FOUND' }));
    logBackendError(Object.assign(new Error('credential secret'), { code: 'BACKEND_NOT_CONFIGURED' }));
    const output = JSON.stringify(logs);
    assert.ok(!output.includes('bot123:secret')); assert.ok(!output.includes('credential secret'));
    assert.ok(output.includes('BACKEND_MODULE_MISSING')); assert.ok(output.includes('FIREBASE_SERVICE_ACCOUNT_JSON'));
  } finally { console.error = original; }
});
test('missing production credentials reproduce the RPC 503 and keep details server-side', async () => {
  const f = fixture(), logs = [], original = console.error;
  console.error = (...args) => logs.push(args);
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  try {
    await createHandler(createLoader({}, f.admin, f.load))({ method: 'POST', query: { name: 'createTelegramLink' }, headers: { authorization: 'Bearer isolated-test-token' }, body: { data: null } }, response);
    assert.equal(response.code, 503); assert.equal(response.body.error.status, 'UNAVAILABLE');
    assert.ok(JSON.stringify(logs).includes('BACKEND_NOT_CONFIGURED'));
    assert.ok(!JSON.stringify(response.body).includes('FIREBASE_SERVICE_ACCOUNT_JSON'));
  } finally { console.error = original; }
});
