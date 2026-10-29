const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/visitStreak.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,Date,Math,Number});
const {visitDay,visitStreaks,nextVisit}=exportsObject;
const at=Date.parse('2026-10-28T12:00:00Z'),today=visitDay(at);
test('daily visit is idempotent and missed days reset only current streak',()=>{
 const old={visitStreak:3,bestVisitStreak:24,lastVisitDay:today-1};
 const next=nextVisit(old,at);assert.equal(next.visitStreak,4);assert.equal(next.bestVisitStreak,24);
 assert.equal(nextVisit(next,at).visitStreak,4);
 assert.equal(visitStreaks(next,at+86400000).current,0);
 assert.equal(visitStreaks(next,at+2*86400000).current,0);
 assert.equal(visitStreaks(next,at+2*86400000).best,24);
 assert.equal(nextVisit(next,at+2*86400000).visitStreak,1);
});
test('Tashkent midnight is shared by dashboard and admin; future or missing data earns nothing',()=>{
 assert.equal(visitDay(Date.parse('2026-10-28T18:59:59Z')),today);
 assert.equal(visitDay(Date.parse('2026-10-28T19:00:00Z')),today+1);
 assert.equal(visitStreaks({streak:4},at).current,0);
 assert.equal(visitStreaks({visitStreak:4,lastVisitDay:today+1},at).current,0);
 assert.equal(nextVisit({},at).visitStreak,1);
});

test('no visit today shows zero for every account while keeping the best and valid continuity',()=>{
 const yesterday={visitStreak:2,bestVisitStreak:7,lastVisitDay:today-1};
 assert.equal(visitStreaks(yesterday,at).current,0);
 assert.equal(visitStreaks(yesterday,at).best,7);
 const returned=nextVisit(yesterday,at);
 assert.equal(visitStreaks(returned,at).current,3);
 assert.equal(visitStreaks(returned,at).best,7);
 const missed=nextVisit(yesterday,at+86400000);
 assert.equal(missed.visitStreak,1);assert.equal(missed.bestVisitStreak,7);
 const fresh=nextVisit({},at);
 assert.equal(visitStreaks({},at).current,0);assert.equal(visitStreaks({},at).best,0);
 assert.equal(visitStreaks(fresh,at).current,1);assert.equal(visitStreaks(fresh,at).best,1);
 const midnight=Date.parse('2026-10-28T19:00:00Z');
 assert.equal(visitStreaks({visitStreak:2,bestVisitStreak:7,lastVisitDay:today},midnight).current,0);
});
