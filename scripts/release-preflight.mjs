import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:dns/promises';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const hosting = read('firebase.json');
const client = read('firebase-applet-config.json');
const functions = read('functions/package.json');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
check(hosting.functions.runtime === 'nodejs22' && functions.engines.node === '22', 'Functions runtime must match Node.js 22 in both configurations.');
const databases = Array.isArray(hosting.firestore) ? hosting.firestore : [hosting.firestore];
check(databases.some(database => database.database === client.firestoreDatabaseId), 'Client and deployed Firestore databases differ.');
check(fs.existsSync('dist/index.html'), 'Production build missing; run npm run verify first.');
check(hosting.hosting.rewrites.some(r => r.source === '**' && r.destination === '/index.html'), 'Direct SPA routes must rewrite to index.html.');
check(hosting.hosting.headers.some(r => r.source === '**' && r.headers.some(h => h.key === 'Cache-Control' && h.value === 'no-cache')), 'SPA documents must revalidate to prevent stale chunk references.');

if (process.argv.includes('--live')) {
  if (!process.argv.includes('--backend-only')) {
    const domain = new URL(read('package.json').homepage).hostname;
    try { await resolve(domain); } catch { check(false, `Primary domain does not resolve in DNS: ${domain}`); }
  }
  if (!/^[a-z0-9-]+$/.test(client.projectId)) throw new Error('Invalid project identifier');
  // Fixed CLI arguments; never log credentials or read production user data.
  const result = spawnSync(`npx --yes firebase-tools@15.32.1 functions:list --project ${client.projectId} --json`, {shell:true,encoding:'utf8',timeout:120000});
  check(result.status === 0, 'Live Functions inspection failed; check Firebase CLI authentication and project access.');
  if (result.status === 0) {
    const deployed = JSON.parse(result.stdout).result;
    const required = [...fs.readFileSync('functions/index.js','utf8').matchAll(/exports\.(\w+)\s*=/g)].map(m => m[1]);
    const community = fs.readFileSync('functions/community.js','utf8');
    // Community exports are assigned from createCommunityHandlers at the entry.
    required.push(...[...community.matchAll(/api\.(\w+)\s*=/g)].map(m => m[1]));
    required.push(...(await import('../functions/metrics.js')).default.exportNames);
    const names = new Set(deployed.map(f => f.id));
    for (const name of required) check(names.has(name), `Required backend Function is not deployed: ${name}`);
    for (const fn of deployed) check(fn.runtime === 'nodejs22', `Backend runtime needs migration: ${fn.id} (${fn.runtime})`);
  }
} else {
  console.log('Local release configuration only; run npm run release:check:live before public launch.');
}
if (failures.length) {
  for (const message of failures) console.error(`BLOCKED: ${message}`);
  process.exitCode = 1;
} else console.log('Release configuration checks passed. Auth/domain, backup restore and provider smoke checks remain required (see LAUNCH_READINESS.md).');
