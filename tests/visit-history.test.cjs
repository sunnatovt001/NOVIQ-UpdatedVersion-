const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

test('historical streak uses dated evidence, excludes delayed uploads and ignores old aggregate guesses', async () => {
  const event = (uid, server, client = server) => ({
    data: () => ({userId:uid,createdAt:client}),
    createTime: {toMillis:()=>Date.parse(server)},
  });
  const writes = [];
  let finish;
  const complete = new Promise(resolve => { finish = resolve; });
  const db = {
    collection:()=>({where:()=>({get:async()=>({docs:[
      event('user','2026-10-26T10:00:00Z'),
      event('user','2026-10-27T10:00:00Z'),
      event('user','2026-10-28T10:00:00Z'),
      event('user','2026-10-28T11:00:00Z'),
      event('user','2026-10-25T10:00:00Z','2026-10-23T10:00:00Z'),
      event('uncertain','2026-10-25T10:00:00Z','2026-10-23T10:00:00Z'),
    ]})})}),
    doc:path=>path,
    runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>({visitStreak:99,bestVisitStreak:999})}),update:(path,data)=>writes.push({path,data})}),
    terminate:async()=>finish(),
  };
  const process = {argv:['node','script','cli','--apply']};
  vm.runInNewContext(fs.readFileSync('scripts/backfill-visit-streaks.cjs','utf8'),{
    process,Date,Map,Number,Math,console:{log(){},error:assert.fail},
    require:()=>async()=>({db}),
  });
  await complete;
  const actual = writes.find(write=>write.path==='users/user').data;
  assert.equal(actual.visitStreak,3);
  assert.equal(actual.bestVisitStreak,3);
  const uncertain = writes.find(write=>write.path==='users/uncertain').data;
  assert.equal(uncertain.visitStreak,0);
  assert.equal(uncertain.bestVisitStreak,0);
});
