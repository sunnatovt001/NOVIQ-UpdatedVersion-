const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>deps[name],Date,Intl});return exports;}
const dates=load('src/lib/recordDate.ts'),summary=load('src/features/pro/activitySummary.ts',{'@/src/lib/recordDate':dates});
test('actual time uses seconds/minutes without fabricated hours and counts each owned record exactly once',()=>{
 const now=Date.parse('2026-10-18T12:00:00Z'),row={id:'one',userId:'owner',duration:60,timestamp:new Date(now-1000).toISOString(),category:'focus'};
 assert.equal(summary.actualDuration(60),'1 min');assert.equal(summary.actualDuration(1),'1 s');assert.equal(summary.actualDuration(3599),'59 min');assert.equal(summary.actualDuration(3600),'1 h');
 const rows=summary.actualSessions([row,row,{...row,id:'other',userId:'other'},{...row,id:'break',category:'break'},{...row,id:'paused',status:'pending'},{...row,id:'future',timestamp:new Date(now+1).toISOString()}],'owner',now);
 assert.equal(rows.length,1);assert.equal(rows.reduce((sum,r)=>sum+r.duration,0),60);
 assert.equal(summary.actualSessions([],'owner',now).length,0);
});
test('study timezone day boundaries do not depend on host timezone',()=>{
 assert.equal(summary.activityDay(Date.parse('2026-10-17T19:01:00Z'),'Asia/Tashkent'),'2026-10-18');
 assert.equal(summary.activityDay(Date.parse('2026-10-17T18:59:00Z'),'Asia/Tashkent'),'2026-10-17');
});
test('Notebook draft identity prevents another user or note from inheriting saved text',()=>{
 const model=load('src/features/pro/notebookDraft.ts'),draft={uid:'a',noteId:'one',title:'Saved',content:'My draft',baseUpdatedAt:'',dirty:true};
 assert.equal(model.validNotebookDraft(draft,'a','one'),true);assert.equal(model.validNotebookDraft(draft,'b','one'),false);assert.equal(model.validNotebookDraft(draft,'a','two'),false);assert.notEqual(model.notebookDraftKey('a','one'),model.notebookDraftKey('b','one'));
});
