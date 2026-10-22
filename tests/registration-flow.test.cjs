const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function flow() {
  const entries = new Map();
  const context = { exports: {}, sessionStorage: {
    setItem: (key, value) => entries.set(key, value),
    getItem: key => entries.get(key) ?? null,
    removeItem: key => entries.delete(key),
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/onboarding/registrationFlow.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
}

test('landing clicks and normal login do not request onboarding', () => {
  const api = flow();
  assert.equal(api.isRegistrationOnboarding('old-account', ''), false);
  assert.equal(api.isRegistrationOnboarding('old-account', '#/dashboard'), false);
});
test('successful registration resumes only for the same account', () => {
  const api = flow();
  api.setRegistrationOnboarding('new-account');
  assert.equal(api.isRegistrationOnboarding('new-account', '#/dashboard'), true);
  assert.equal(api.isRegistrationOnboarding('other-account', '#/dashboard'), false);
  api.setRegistrationOnboarding(null);
  assert.equal(api.isRegistrationOnboarding('new-account', '#/dashboard'), false);
});
