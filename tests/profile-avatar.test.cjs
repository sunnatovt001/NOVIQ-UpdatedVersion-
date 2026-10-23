const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const stored = new Map();
  const context = {
    exports: {},
    crypto: { getRandomValues: values => { values[0] = 2; return values; } },
    require: name => name.endsWith('subscription') ? {
      isPro: profile => profile?.subscription?.plan === 'pro',
    } : {
      loadLocalData: (key, fallback) => stored.has(key) ? stored.get(key) : fallback,
      trySaveLocalData: (key, value) => stored.set(key, value),
    },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/profileAvatar.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return { ...context.exports, stored };
}

test('random default survives repeated resolution and legacy avatars are replaced', () => {
  const api = fixture();
  const profile = { uid: 'student', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=old' };
  assert.equal(api.getProfileAvatar(profile), '/avatars/free-3.png');
  assert.equal(api.getProfileAvatar(profile), '/avatars/free-3.png');
  assert.equal(api.stored.size, 1);
});

test('presets follow the plan while uploads and custom photos survive', () => {
  const api = fixture();
  assert.equal(api.getProfileAvatar({ photoURL: '/avatars/free-4.png', subscription: { plan: 'pro' } }), '/avatars/pro-4.png');
  assert.equal(api.getProfileAvatar({ photoURL: '/avatars/pro-2.png' }), '/avatars/free-2.png');
  for (const photoURL of ['data:image/jpeg;base64,custom', 'https://example.com/my-photo.jpg']) {
    assert.equal(api.getProfileAvatar({ photoURL, subscription: { plan: 'pro' } }), photoURL);
  }
});

test('each plan has exactly four existing image assets', () => {
  const api = fixture();
  for (const premium of [false, true]) {
    const options = api.avatarOptions(premium);
    assert.equal(options.length, 4);
    for (const path of options) assert.ok(fs.statSync('public' + path).size > 10000);
  }
});

test('verified membership selects premium avatars even before the profile projection catches up', () => {
  const api = fixture();
  const profile = { uid: 'verified-member', photoURL: '/avatars/free-4.png', subscription: { plan: 'free' } };
  assert.equal(api.getProfileAvatar(profile, true), '/avatars/pro-4.png');
  assert.equal(api.getProfileAvatar({ ...profile, photoURL: '/avatars/pro-2.png' }, false), '/avatars/free-2.png');
  assert.equal(api.getProfileAvatar({ ...profile, photoURL: 'https://example.com/upload.jpg' }, true), 'https://example.com/upload.jpg');
});
