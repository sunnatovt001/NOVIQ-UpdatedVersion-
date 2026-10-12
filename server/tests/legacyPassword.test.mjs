import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLegacyPassword } from '../src/legacyPassword.mjs';

// Public compatibility vector from https://github.com/firebase/scrypt README.
const config = { algorithm: 'SCRYPT', memoryCost: 14, rounds: 8,
  saltSeparator: 'Bw==', signerKey: 'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==' };
const account = { salt: '42xEC+ixf3L2lw==', passwordHash: 'lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==' };
test('matches Firebase official password vector and rejects incorrect password', async () => {
  assert.equal(await verifyLegacyPassword('user1password', account, config), true);
  assert.equal(await verifyLegacyPassword('incorrect', account, config), false);
});
test('disabled, social-only, malformed and excessive hashing requests fail closed', async () => {
  assert.equal(await verifyLegacyPassword('user1password', { ...account, disabled: true }, config), false);
  assert.equal(await verifyLegacyPassword('password', {}, config), false);
  assert.equal(await verifyLegacyPassword('a'.repeat(1025), account, config), false);
  assert.equal(await verifyLegacyPassword('password', account, { ...config, memoryCost: 30 }), false);
  assert.equal(await verifyLegacyPassword('password', account, { ...config, algorithm: 'STANDARD_SCRYPT' }), false);
});
