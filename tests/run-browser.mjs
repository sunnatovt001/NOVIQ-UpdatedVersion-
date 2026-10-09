import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const server = spawn(process.execPath, ['tests/browser-server.mjs'], { stdio: 'inherit' });
let serverExited = false;
server.on('exit', () => { serverExited = true; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (serverExited) throw new Error('Isolated browser server exited before readiness');
    try { ready = (await fetch('http://127.0.0.1:4180', {signal: AbortSignal.timeout(1000)})).ok; } catch {}
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw new Error('Isolated browser server readiness timed out');
  const tests = spawn(process.execPath, [process.argv[2] || 'tests/browser-check.cjs'], { stdio: 'inherit', env: process.env });
  const timer = setTimeout(() => tests.kill(), 240000);
  try {
    const code = await new Promise((resolve, reject) => { tests.on('error', reject); tests.on('exit', resolve); });
    if (code !== 0) throw new Error(`Browser regression suite failed (${code})`);
  } finally { clearTimeout(timer); }
} finally {
  server.kill();
}
