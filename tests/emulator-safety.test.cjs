const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('Firestore rules checks reject missing or nonlocal emulator targets before client initialization', () => {
  for (const target of [undefined, 'example.invalid:8089', '127.0.0.1:9999']) {
    const env = { ...process.env };
    if (target === undefined) delete env.FIRESTORE_EMULATOR_HOST;
    else env.FIRESTORE_EMULATOR_HOST = target;
    const result = spawnSync(process.execPath, ['tests/firestore.rules.cjs'], { cwd: process.cwd(), env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Rules tests require FIRESTORE_EMULATOR_HOST=127\.0\.0\.1:8089/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|ETIMEDOUT/);
  }
});
