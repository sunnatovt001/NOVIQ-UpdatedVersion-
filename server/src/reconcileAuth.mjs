import { BSON } from 'mongodb';
import { prepareAuthArchive } from './authArchive.mjs';
import { digest } from './migrationArchive.mjs';

export function prepareAuthAccounts(snapshot, project) {
  const archive = prepareAuthArchive(snapshot, project), emails = new Set();
  const accounts = snapshot.users.map(user => {
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (email && emails.has(email)) throw new Error('Duplicate normalized email.');
    if (email) emails.add(email);
    return { _id: user.localId, ...(email ? { email } : {}), displayName: user.displayName || '',
      emailVerified: user.emailVerified === true, disabled: user.disabled === true,
      passwordHash: user.passwordHash || '', salt: user.salt || '',
      mfaRequired: !!user.mfaInfo?.length, providers: user.providerUserInfo || [], sourceProject: project };
  });
  return { snapshotId: archive._id, project, accounts,
    settings: { _id: 'legacy-firebase', project, hashConfig: snapshot.hashConfig } };
}

// Staging reconciliation retains an immutable preimage and commits all accounts
// plus the project hash parameters together. No source/Auth/Firebase writes.
export async function reconcileAuthAccounts(db, prepared, transaction) {
  return transaction(async session => {
    const accounts = db.collection('auth_accounts'), settings = db.collection('auth_settings');
    const receipts = db.collection('migration_auth_reconciliations');
    const receipt = await receipts.findOne({ _id: prepared.snapshotId }, { session });
    const previous = await accounts.find({}, { session }).limit(20001).toArray();
    if (previous.length > 20000) throw new Error('Account reconciliation exceeds budget.');
    const oldSettings = await settings.findOne({ _id: 'legacy-firebase' }, { session });
    const byId = new Map(previous.map(row => [row._id, row]));
    if (oldSettings && oldSettings.project !== prepared.project) throw new Error('Hash settings source mismatch.');
    const expectedKeys = new Set(['_id','email','displayName','emailVerified','disabled','passwordHash','salt','mfaRequired','providers','sourceProject']);
    const sourceIds = new Set(prepared.accounts.map(row => row._id));
    const stale = previous.filter(row => row.sourceProject === prepared.project && !sourceIds.has(row._id)).length;
    for (const row of prepared.accounts) {
      const old = byId.get(row._id);
      if (old && (old.sourceProject !== prepared.project || Object.keys(old).some(key => !expectedKeys.has(key)))) {
        throw new Error('Locally changed account requires explicit reconciliation.');
      }
      if (row.email && previous.some(other => other.email === row.email && other._id !== row._id)) throw new Error('Account identity conflict.');
      if (receipt && digest(old) !== digest(row)) throw new Error('Account changed since reconciliation.');
    }
    if (receipt) {
      if (digest(oldSettings) !== digest(prepared.settings)) throw new Error('Hash settings changed since reconciliation.');
      return { accountsVerified: prepared.accounts.length, staleAccounts: stale, alreadyReconciled: true, sourceWrites: 0, frontendCutover: false };
    }
    const preimageJson = BSON.EJSON.stringify({ accounts: previous, settings: oldSettings }, { relaxed: false });
    if (Buffer.byteLength(preimageJson) > 8 * 1024 * 1024) throw new Error('Account preimage exceeds budget.');
    await receipts.insertOne({ _id: prepared.snapshotId, project: prepared.project,
      preimageJson, preimageHash: digest(preimageJson), reconciledAt: new Date() }, { session });
    for (const row of prepared.accounts) {
      if (byId.has(row._id)) await accounts.replaceOne({ _id: row._id }, row, { session });
      else await accounts.insertOne(row, { session });
      if (digest(await accounts.findOne({ _id: row._id }, { session })) !== digest(row)) throw new Error('Account read-back mismatch.');
    }
    if (oldSettings) await settings.replaceOne({ _id: 'legacy-firebase' }, prepared.settings, { session });
    else await settings.insertOne(prepared.settings, { session });
    if (digest(await settings.findOne({ _id: 'legacy-firebase' }, { session })) !== digest(prepared.settings)) throw new Error('Hash configuration read-back mismatch.');
    return { accountsVerified: prepared.accounts.length, staleAccounts: stale, previousAccountsPreserved: previous.length,
      alreadyReconciled: false, sourceWrites: 0, frontendCutover: false };
  });
}
