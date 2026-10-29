const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const cache=new Map();
function load(path){if(cache.has(path))return cache.get(path);const exports={};cache.set(path,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Intl,Map,Set,crypto:require('node:crypto'),require:name=>load(name.startsWith('@/')?name.slice(2)+'.ts':'src/features/planner/'+name.slice(2)+'.ts')});return exports;}
const {dashboardDay}=load('src/features/pro/dashboardDay.ts');
const stamp=Date.parse;
const task=(id,patch={})=>({id,subjectId:'english',title:id,minutes:25,priority:2,repeat:'none',repeatUntil:'',createdAt:stamp('2026-10-25T06:00:00Z'),completed:false,...patch});
const plan=tasks=>({userId:'test',timezone:'Asia/Tashkent',subjects:[],tasks,sessions:[]});
test('old Focus minutes and completions never become today’s totals',()=>{
 const saved=plan([task('old-English',{completed:true,completedAt:stamp('2026-10-26T10:00:00Z')}),task('today',{completed:true,completedAt:stamp('2026-10-28T07:00:00Z')}),task('pending')]);
 const records=[{id:'old',category:'focus',duration:1500,timestamp:'2026-10-25T10:00:00Z'},{id:'today',category:'focus',duration:300,timestamp:'2026-10-28T07:00:00Z'}];
 const before=JSON.stringify(saved),view=dashboardDay(saved,records,stamp('2026-10-28T12:00:00Z'));
 assert.equal(view.focusMinutes,5);assert.equal(view.completed,1);assert.equal(view.tasks.some(t=>t.id==='old-English'),false);assert.equal(view.tasks.length,2);assert.equal(JSON.stringify(saved),before);
});
test('midnight opens a new recurring occurrence and retains yesterday’s history',()=>{
 const saved=plan([task('english',{repeat:'daily',completed:true,completedAt:stamp('2026-10-25T10:00:00Z')})]);
 const records=[{id:'focus',category:'focus',duration:1500,timestamp:'2026-10-28T12:00:00Z'}];
 const before=dashboardDay(saved,records,stamp('2026-10-28T18:59:59Z')),after=dashboardDay(saved,records,stamp('2026-10-28T19:00:00Z'));
 assert.equal(before.focusMinutes,25);assert.equal(after.focusMinutes,0);assert.equal(before.tasks[0].id,'english@2026-10-28');assert.equal(after.tasks[0].id,'english@2026-10-29');assert.equal(after.tasks[0].completed,false);assert.equal(saved.tasks[0].completed,true);assert.equal(records.length,1);
});
test('daily tasks include later-today sessions but exclude tomorrow’s tasks and future completions',()=>{
 const saved=plan([task('tonight',{notBefore:stamp('2026-10-28T13:00:00Z')}),task('tomorrow'),task('future-done',{completed:true,completedAt:stamp('2026-10-28T17:00:00Z')})]);
 saved.sessions=[{taskId:'tonight',start:stamp('2026-10-28T13:00:00Z'),end:stamp('2026-10-28T13:25:00Z')},{taskId:'tomorrow',start:stamp('2026-10-29T10:00:00Z'),end:stamp('2026-10-29T10:25:00Z')}];
 const view=dashboardDay(saved,[],stamp('2026-10-28T08:00:00Z'));
 assert.equal(view.tasks.length,1);assert.equal(view.tasks[0].id,'tonight');assert.equal(view.rows.length,1);assert.equal(view.completed,0);
});
