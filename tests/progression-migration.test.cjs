const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planMigration}=require('../scripts/plan-xp-migration.cjs');
test('offline migration dry run is repeatable, preserves XP/history and excludes unverified Planner evidence',()=>{
  const session={id:'server-proof',userId:'fixture',verified:true,category:'focus',duration:1500,timestamp:'2026-10-26T10:00:00Z'};
  const input={uid:'fixture',completeExport:true,user:{xp:9999,streak:8,localXp:999999,settings:{theme:'dark'}},trusted:{xp:2300,achievements:{legacy:{unlockedAt:'2025-01-01'}}},studySessions:[session,session,{...session,id:'forged',verified:false},{...session,id:'other',userId:'other'}]};
  const before=JSON.stringify(input),first=planMigration(input),second=planMigration(input);
  assert.deepEqual(first,second);assert.equal(JSON.stringify(input),before);assert.equal(first.canonicalXp,2300);assert.equal(first.proposedTrustedPatch.level,7);
  assert.equal(first.proposedTrustedPatch.counters.focusSeconds,1500);assert.equal(first.verifiedFocusSessions,1);
  assert.equal(first.preserved.trusted.achievements.legacy.unlockedAt,'2025-01-01');assert.equal(first.preserved.user.streak,8);
  const again=planMigration({...input,trusted:{...input.trusted,...first.proposedTrustedPatch}});
  assert.deepEqual(first.proposedTrustedPatch,again.proposedTrustedPatch);
});
test('partial exports cannot produce a migration plan',()=>{
  assert.throws(()=>planMigration({uid:'fixture',studySessions:[]}),/complete/);
});
