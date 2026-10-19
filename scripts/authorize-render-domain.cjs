// Scoped fix for the owner-requested Render authentication failure.
const path = require('node:path');
async function main() {
  const { config, cli, db } = await require('./cloud-client.cjs')(process.argv[2]);
  await db.terminate();
  if (config.projectId !== 'gen-lang-client-0937997111') throw new Error('Unexpected project.');
  const api = require(path.join(cli, 'lib/gcp/auth.js'));
  const domain = 'noviq-updatedversion.onrender.com';
  const before = await api.getAuthDomains(config.projectId);
  if (!before.includes(domain)) await api.updateAuthDomains(config.projectId, [...before, domain]);
  const after = await api.getAuthDomains(config.projectId);
  if (!after.includes(domain) || !before.every(item => after.includes(item))) throw new Error('Domain verification failed.');
  console.log(JSON.stringify({ domainAuthorized: true, domain, existingDomainsPreserved: true, accountWrites: 0 }));
}
main().catch(() => { console.error('Scoped auth domain fix failed; credentials not printed.'); process.exitCode = 1; });
