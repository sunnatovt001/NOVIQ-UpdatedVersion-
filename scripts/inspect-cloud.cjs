// Inspection using an installed Firebase CLI library. --harden performs only
// the authorized domain allowlist addition and database delete protection.
// No user records are read and credential values are never printed.
const path = require('node:path');
const fs = require('node:fs');
const cli = path.resolve(process.argv[2]);
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json','utf8'));
(async () => {
  const auth = require(path.join(cli,'lib/auth.js'));
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error('Firebase CLI login is required');
  await require(path.join(cli,'lib/requireAuth.js')).requireAuth({project:config.projectId,...account});
  const authApi = require(path.join(cli,'lib/gcp/auth.js'));
  let domains = await authApi.getAuthDomains(config.projectId);
  const firestore = require(path.join(cli,'lib/gcp/firestore.js'));
  let database = await firestore.getDatabase(config.projectId, config.firestoreDatabaseId);
  if (process.argv.includes('--harden')) {
    const previous = {authorizedDomains:domains,deleteProtection:database.deleteProtectionState};
    const backupPath = 'artifacts/production-audit/cloud-before-hardening.json';
    if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath,JSON.stringify(previous,null,2));
    if (!domains.includes('noviqq.uz')) domains = await authApi.updateAuthDomains(config.projectId,[...domains,'noviqq.uz']);
    if (database.deleteProtectionState !== 'DELETE_PROTECTION_ENABLED') {
      const {FirestoreApi} = require(path.join(cli,'lib/firestore/api.js'));
      await new FirestoreApi().updateDatabase(config.projectId,config.firestoreDatabaseId,'DELETE_PROTECTION_ENABLED',undefined);
      database = await firestore.getDatabase(config.projectId, config.firestoreDatabaseId);
    }
  }
  let backupSchedules;
  try { backupSchedules = await firestore.listBackupSchedules(config.projectId, config.firestoreDatabaseId); }
  catch { backupSchedules = 'inspection unavailable'; }
  const result = {checkedAt:new Date().toISOString(),project:config.projectId,domain:'noviqq.uz',domainAuthorized:domains.includes('noviqq.uz'),authorizedDomains:domains,database:{location:database.locationId,pitr:database.pointInTimeRecoveryEnablement,deleteProtection:database.deleteProtectionState},backupSchedules};
  fs.writeFileSync('artifacts/production-audit/cloud-readiness.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error('Read-only cloud inspection failed:',error.message);process.exitCode=1;});
