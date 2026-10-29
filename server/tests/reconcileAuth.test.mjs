import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAuthAccounts, reconcileAuthAccounts } from '../src/reconcileAuth.mjs';
const snapshot = () => ({ version:1,kind:'firebase-auth',project:'source',exportedAt:'2026-10-29T07:00:00Z',
  hashConfig:{ algorithm:'SCRYPT',signerKey:'private-config' }, users:[
    { localId:'a',email:'A@example.invalid',passwordHash:'new-hash',salt:'salt',displayName:'A' },
    { localId:'b',email:'b@example.invalid',disabled:true },
  ] });
function fixture() {
  let tables=new Map(), fail=false; const session={};
  const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
  const db={collection(name){return {
    find(q,opts){assert.equal(opts.session,session);return {limit(){return this;},async toArray(){return [...table(name).values()].map(row=>structuredClone(row));}};},
    async findOne(q,opts){assert.equal(opts.session,session);return table(name).get(q._id);},
    async insertOne(row,opts){assert.equal(opts.session,session);if(table(name).has(row._id))throw new Error('duplicate');table(name).set(row._id,structuredClone(row));},
    async replaceOne(q,row,opts){assert.equal(opts.session,session);if(fail&&name==='auth_settings')throw new Error('write failed');table(name).set(row._id,structuredClone(row));},
  };}};
  const transaction=async work=>{const copy=structuredClone(tables);try{return await work(session);}catch(e){tables=copy;throw e;}};
  return {db,table,transaction,fail(){fail=true;}};
}
test('fresh Auth snapshot normalizes email and rejects source/identity conflicts before reconciliation',()=>{
  assert.equal(prepareAuthAccounts(snapshot(),'source').accounts[0].email,'a@example.invalid');
  assert.throws(()=>prepareAuthAccounts(snapshot(),'other'));
  const s=snapshot();s.users[1].email='a@example.invalid';assert.throws(()=>prepareAuthAccounts(s,'source'));
});
test('reconciliation preserves preimages, disabled status and password hashes, and is retry-safe',async()=>{
  const f=fixture(), prepared=prepareAuthAccounts(snapshot(),'source');
  f.table('auth_accounts').set('a',{...prepared.accounts[0],passwordHash:'old-hash'});
  const result=await reconcileAuthAccounts(f.db,prepared,f.transaction);
  assert.equal(result.accountsVerified,2);assert.equal(result.previousAccountsPreserved,1);
  assert.equal(f.table('auth_accounts').get('a').passwordHash,'new-hash');
  assert.equal(f.table('auth_accounts').get('b').disabled,true);
  assert.ok(f.table('migration_auth_reconciliations').get(prepared.snapshotId).preimageJson.includes('old-hash'));
  assert.equal((await reconcileAuthAccounts(f.db,prepared,f.transaction)).alreadyReconciled,true);
  f.table('auth_accounts').get('a').disabled=true;
  await assert.rejects(reconcileAuthAccounts(f.db,prepared,f.transaction));
  assert.equal(f.table('auth_accounts').get('a').disabled,true);
});
test('a hash-configuration failure rolls back account replacement, inserted accounts and receipt',async()=>{
  const f=fixture(),prepared=prepareAuthAccounts(snapshot(),'source');
  f.table('auth_accounts').set('a',{...prepared.accounts[0],passwordHash:'old-hash'});
  f.table('auth_settings').set('legacy-firebase',{_id:'legacy-firebase',project:'source',hashConfig:{algorithm:'SCRYPT',signerKey:'old'}});
  f.fail();await assert.rejects(reconcileAuthAccounts(f.db,prepared,f.transaction));
  assert.equal(f.table('auth_accounts').size,1);
  assert.equal(f.table('auth_accounts').get('a').passwordHash,'old-hash');
  assert.equal(f.table('migration_auth_reconciliations').size,0);
});
test('locally linked identities are never overwritten by a Firebase account import',async()=>{
  const f=fixture(),prepared=prepareAuthAccounts(snapshot(),'source');
  f.table('auth_accounts').set('a',{...prepared.accounts[0],telegramId:123});
  await assert.rejects(reconcileAuthAccounts(f.db,prepared,f.transaction));
  assert.equal(f.table('auth_accounts').get('a').telegramId,123);
  assert.equal(f.table('migration_auth_reconciliations').size,0);
});
