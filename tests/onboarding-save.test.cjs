const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function load(source, globals = {}) {
  const context = { exports: {}, ...globals };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const copy = load(fs.readFileSync('src/features/onboarding/onboardingCopy.ts', 'utf8'));
const state = load(fs.readFileSync('src/features/onboarding/onboardingState.ts', 'utf8'), { require: () => copy });
const source = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');
const tree = ts.createSourceFile('AuthContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'completeOnboarding') callback = node.initializer.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
const answers = { mainGoal: 'Prepare for SAT', userType: 'IELTS learner', struggle: 'Remembering information' };
function harness({ legacy = false, denied = false, code, completed } = {}) {
  let profile = { uid: 'u1', onboarded: false, ...(completed === undefined ? {} : { onboardingCompleted: completed }) };
  let attempts = 0, publications = 0;
  const run = load(`exports.run = ${callback}`, {
    ...state, user: { uid: 'u1' }, auth: { currentUser: { uid: 'u1' } }, isReadOnlyAudit: false,
    clearLocalProfilePatch() {}, setProfile(update) { publications++; update(profile); },
    require: name => name === 'firebase/firestore' ? {
      doc: () => 'users/u1', serverTimestamp: () => 'server-time',
      runTransaction: async (_, action) => {
        attempts++;
        let patch;
        const result = await action({ get: async () => ({ exists: () => true, data: () => profile }), update: (_, value) => { patch = value; } });
        if (code || denied || (legacy && patch?.onboardingCompleted)) throw Object.assign(new Error('Write failed'), { code: code || 'permission-denied' });
        profile = { ...profile, ...patch };
        return result;
      },
    } : { db: {} },
  }).run;
  return { run, profile: () => profile, attempts: () => attempts, publications: () => publications };
}
test('current rules persist the full completion schema', async () => {
  const h = harness(); await h.run(answers);
  assert.equal(h.profile().onboardingCompleted, true);
  assert.equal(h.attempts(), 1);
});
test('legacy rules persist answers and completion before publishing success', async () => {
  const h = harness({ legacy: true }); await h.run(answers);
  assert.equal(h.attempts(), 2);
  assert.equal(state.hasCompletedOnboarding(h.profile()), true);
  assert.equal(h.profile().onboardingAnswers.struggle, answers.struggle);
  assert.equal(h.profile().onboardingCompleted, undefined);
  assert.equal(h.publications(), 1);
});
test('denied legacy writes never publish a completed local profile', async () => {
  const h = harness({ denied: true }); await assert.rejects(h.run(answers));
  assert.equal(h.profile().onboarded, false);
  assert.equal(h.publications(), 0);
});
test('legacy compatibility cannot override an explicit incomplete flag', async () => {
  const h = harness({ legacy: true, completed: false }); await assert.rejects(h.run(answers));
  assert.equal(h.profile().onboardingCompleted, false);
  assert.equal(h.publications(), 0);
});
test('network failures do not retry using a different schema', async () => {
  const h = harness({ code: 'unavailable' }); await assert.rejects(h.run(answers));
  assert.equal(h.attempts(), 1);
  assert.equal(h.publications(), 0);
});
