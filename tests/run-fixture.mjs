import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const [serverFile, port, ...suites] = process.argv.slice(2);
if (!serverFile || !/^\d+$/.test(port) || !suites.length) throw new Error('Usage: run-fixture.mjs server-file port suite...');
const fixtureScope = serverFile.replace(/[^a-zA-Z0-9_-]/g, '-');
const server = spawn(process.execPath, [serverFile], { stdio: 'inherit', env: {...process.env, NOVIQ_FIXTURE_SCOPE: fixtureScope} });
let serverExited = false;
let active;
server.on('exit', () => { serverExited = true; active?.kill(); });
const stop = () => { active?.kill(); server.kill(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (serverExited) throw new Error('Fixture server exited before readiness');
    try { ready = (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw new Error('Fixture server readiness timed out');
  for (const suite of suites) {
    active = spawn(process.execPath, [suite], { stdio: 'inherit', env: process.env });
    const timer = setTimeout(() => active?.kill(), 240000);
    try {
      const code = await new Promise((resolve, reject) => { active.once('error', reject); active.once('exit', resolve); });
      if (code !== 0) throw new Error(`${suite} failed (${code})`);
    } finally { clearTimeout(timer); active = undefined; }
  }
} finally {
  stop();
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
