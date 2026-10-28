const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { createHandler } = require('./vercel.cjs');

test('Vercel adapter preserves Firebase authentication and callable guards', async t => {
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-noviq' });
  const auth = admin.auth(), original = auth.verifyIdToken;
  auth.verifyIdToken = async token => {
    if (token !== 'valid-test-token') throw new Error('Invalid token');
    return { uid: 'student-a', sub: 'student-a' };
  };
  let invoked = 0, loaded = 0;
  const api = {
    echo: onCall(request => {
      invoked++;
      if (request.data.uid !== request.auth.uid) throw new HttpsError('permission-denied', 'Own account only.');
      return { uid: request.auth.uid, text: request.data.text };
    }),
    scheduledJob: { __endpoint: { scheduleTrigger: {} } },
    webhook: { __endpoint: { httpsTrigger: {} } },
  };
  const app = express();
  app.use(express.json());
  app.all('/api/rpc', createHandler(() => { loaded++; return api; }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/rpc`;
  const call = (name, data, token) => fetch(`${base}?name=${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  try {
    await t.test('anonymous requests never initialize the backend', async () => {
      const response = await call('echo', {});
      assert.equal(response.status, 401); assert.equal(loaded, 0); assert.equal(invoked, 0);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    });
    await t.test('forged ID tokens never reach the handler', async () => {
      const response = await call('echo', { uid: 'student-a' }, 'forged');
      assert.equal(response.status, 401); assert.equal(invoked, 0);
    });
    await t.test('verified Firebase identity and callable data reach the handler', async () => {
      const response = await call('echo', { uid: 'student-a', text: 'hello' }, 'valid-test-token');
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { result: { uid: 'student-a', text: 'hello' } });
    });
    await t.test('existing authorization errors preserve their status', async () => {
      const response = await call('echo', { uid: 'student-b' }, 'valid-test-token');
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.status, 'PERMISSION_DENIED');
    });
    await t.test('scheduled jobs, webhooks and prototype names cannot be called', async () => {
      for (const name of ['scheduledJob', 'webhook', 'constructor']) {
        assert.equal((await call(name, {}, 'valid-test-token')).status, 404);
      }
    });
    await t.test('GET and malformed callable envelopes are rejected', async () => {
      assert.equal((await fetch(`${base}?name=echo`)).status, 405);
      const response = await fetch(`${base}?name=echo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-test-token' }, body: '{"uid":"student-a"}' });
      assert.equal(response.status, 400);
    });
  } finally {
    auth.verifyIdToken = original;
    await new Promise(resolve => server.close(resolve));
  }
});
