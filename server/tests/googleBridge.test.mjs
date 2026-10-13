import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGoogleBridge, legacyProject } from '../src/googleBridge.mjs';
const token = 'synthetic'.repeat(20), timestamp = 1700000000;
const claims = () => ({ uid: 'original-uid', aud: legacyProject, iss: `https://securetoken.google.com/${legacyProject}`, firebase: { sign_in_provider: 'google.com' }, email_verified: true, auth_time: timestamp });
test('Google bridge accepts only verified recent Google claims for the legacy project', async () => {
  assert.deepEqual(await verifyGoogleBridge(token, { verify: async () => claims(), now: () => timestamp * 1000 }), { uid: 'original-uid', project: legacyProject });
  for (const patch of [{ aud: 'other-project' }, { iss: 'fake' }, { email_verified: false }, { firebase: { sign_in_provider: 'password' } }, { auth_time: timestamp - 301 }]) {
    assert.equal(await verifyGoogleBridge(token, { verify: async () => ({ ...claims(), ...patch }), now: () => timestamp * 1000 }), null);
  }
  assert.equal(await verifyGoogleBridge(token, { verify: async () => { throw new Error('bad signature'); } }), null);
});
