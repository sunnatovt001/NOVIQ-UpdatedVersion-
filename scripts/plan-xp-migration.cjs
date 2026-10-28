// Offline-only dry run: no credentials, database SDK, writes or deployment.
// Input: a complete, separately authorized export for ONE user.
const fs=require('node:fs');
const {levelInfo,number}=require('../functions/progression');
function planMigration(input) {
  if(input.completeExport!==true || !input.uid || !Array.isArray(input.studySessions)) throw new Error('A complete isolated export with uid and studySessions is required.');
  const user=input.user||{}, trusted=input.trusted||{}, counters={...trusted.counters};
  const xp=number(trusted.xp ?? user.xp), info=levelInfo(xp), unique=new Map();
  for(const session of input.studySessions) {
    if(!session.id || session.userId!==input.uid || session.verified!==true || session.category!=='focus' || !Number.isFinite(session.duration) || session.duration<60 || session.duration>28800 || !Number.isFinite(Date.parse(session.timestamp))) continue;
    unique.set(session.id,session);
  }
  const sessions=[...unique.values()];
  counters.focusSeconds=Math.max(number(counters.focusSeconds),sessions.reduce((sum,s)=>sum+s.duration,0));
  counters.longFocusSessions=Math.max(number(counters.longFocusSessions),sessions.filter(s=>s.duration>=1500).length);
  counters.studyEvents=Math.max(number(counters.studyEvents),sessions.filter(s=>s.duration>=300).length);
  return {
    mode:'dry-run-only',migrationVersion:2,uid:input.uid,
    canonicalXp:xp,proposedTrustedPatch:{xp,level:info.level,levelName:info.name,counters},
    verifiedFocusSessions:sessions.length,
    preserved:{trusted,user},
    warnings:['No XP award, achievement unlock, streak rewrite, deletion, or production write is performed.','Client Planner points, self-reported reviews and unverified sessions are excluded.','Review export completeness, historical proof quality and reward deduplication before authorizing any production application.'],
    rollback:{instruction:'Restore only migrated derived fields from the preserved snapshot. Preserve subsequent XP ledger events and reconcile before applying any correction.'},
  };
}
if(require.main===module) {
  const path=process.argv[2];
  if(!path) throw new Error('Usage: node scripts/plan-xp-migration.cjs isolated-user-export.json');
  process.stdout.write(JSON.stringify(planMigration(JSON.parse(fs.readFileSync(path,'utf8'))),null,2)+'\n');
}
module.exports={planMigration};
