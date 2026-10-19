import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createStaticFrontend } from '../src/staticFrontend.mjs';
import { fileURLToPath } from 'node:url';
test('static frontend refuses secrets, traversal, missing assets and mutations', async () => {
  const server = http.createServer(createStaticFrontend(fileURLToPath(new URL('../', import.meta.url))));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/.env', '/%2eenv', '/assets/missing.js', '/api/missing', '/%2e%2e%5csecret']) assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
