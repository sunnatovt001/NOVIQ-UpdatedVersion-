const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');
function load(file,dependencies={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>dependencies[name],crypto:require('node:crypto').webcrypto,Intl,Date,Map,Set});return exports;}
const engine=load('src/features/planner/smartSchedule.ts');const m=load('src/features/planner/smartPlannerModel.ts',{'./smartSchedule':engine});
const now=m.localInstant('2026-10-14','09:00','Asia/Tashkent');
const task=(id,extra={})=>({id,subjectId:'ielts',title:id,minutes:30,priority:2,description:'',type:'Practice',resource:'',repeat:'none',repeatUntil:'',flexibility:'flexible',createdAt:now,...extra});
const plan=(extra={})=>({...m.initialSmartPlan('u1'),timezone:'Asia/Tashkent',subjects:[{...m.newSubject('IELTS'),id:'ielts'},{...m.newSubject('SAT'),id:'sat'}],tasks:[task('a'),task('b',{subjectId:'sat'})],...extra});
test('timezone conversion round trips, including fractional offsets',()=>{
 assert.equal(new Date(m.localInstant('2026-10-14','10:30','Asia/Tashkent')).toISOString(),'2026-10-14T05:30:00.000Z');
 assert.equal(new Date(m.localInstant('2026-10-14','10:30','Asia/Kathmandu')).toISOString(),'2026-10-14T04:45:00.000Z');
});
test('DST gap rejects; repeated hour selects earliest instant',()=>{
 assert.throws(()=>m.localInstant('2026-03-08','02:30','America/New_York'));
 assert.equal(new Date(m.localInstant('2026-11-01','01:30','America/New_York')).toISOString(),'2026-11-01T05:30:00.000Z');
});
test('invalid dates and zones reject safely',()=>{
 assert.throws(()=>m.localInstant('2026-02-30','09:00','Asia/Tashkent'));assert.throws(()=>m.localInstant('2026-01-01','24:00','Asia/Tashkent'));assert.throws(()=>m.localInstant('2026-01-01','09:00','Wrong/Zone'));
});
test('recurring commitments, overnight sleep and dated exceptions expand correctly',()=>{
 const recurring={id:'sleep',label:'Sleep',days:[0,1,2,3,4,5,6],start:'23:00',end:'07:00'};
 const ranges=m.expandWeekly([recurring], 'Asia/Tashkent','2026-10-14',2);
 assert.equal(ranges.length,3);assert.equal((ranges[0].end-ranges[0].start)/3600000,8);
 const once=m.expandWeekly([{...recurring,date:'2026-10-15'}], 'Asia/Tashkent','2026-10-14',2);assert.equal(once.length,1);
});
test('overlapping availability is merged and protected time subtracted',()=>{
 const ranges=m.availableRanges([{start:0,end:100},{start:50,end:150}],[{start:60,end:90}],10);
 assert.equal(JSON.stringify(ranges),JSON.stringify([{start:10,end:60},{start:90,end:150}]));
});
test('multiple subjects and self-study need no teacher, score or date',()=>{
 const result=m.buildSmartPreview(plan(),[],now);assert.equal(result.warnings.length,0);assert.equal(new Set(result.sessions.map(s=>s.taskId)).size,2);
});
test('no windows or fully blocked windows produce honest capacity warnings',()=>{
 assert.equal(m.buildSmartPreview(plan({windows:[]}),[],now).warnings.length,2);
 const all={id:'busy',label:'Unavailable',days:[0,1,2,3,4,5,6],start:'00:00',end:'00:00'};
 assert.equal(m.buildSmartPreview(plan({commitments:[all]}),[],now).sessions.length,0);
});
test('30 minute days and breaks respect capacity',()=>{
 const p=plan({windows:[{id:'w',label:'',days:[0,1,2,3,4,5,6],start:'17:00',end:'17:30'}]});
 const result=m.buildSmartPreview(p,[],now);for(const s of result.sessions)assert.ok(s.end-s.start<=30*60000);
});
test('impossible deadline keeps missing effort explicit',()=>{
 const result=m.buildSmartPreview(plan({tasks:[task('urgent',{minutes:300,deadline:now+60000})]}),[],now);
 assert.equal(result.warnings[0].reason,'capacity');assert.equal(result.sessions.length,0);
});
test('recurring task occurrences are stable and never duplicate completed work',()=>{
 const p=plan({tasks:[task('a',{repeat:'daily',repeatUntil:'2026-10-17'})]});const first=m.expandTasks(p,'2026-10-14');
 assert.equal(first.length,4);const second=m.expandTasks({...p,tasks:first},'2026-10-14');assert.equal(second.length,4);
 assert.ok(first.slice(1).every(t=>t.id.includes('@') && t.deadline>t.createdAt));
});
test('future recurring assignments never start before their occurrence',()=>{
 const p=plan({tasks:[task('a',{repeat:'daily',repeatUntil:'2026-10-17'})]});const result=m.buildSmartPreview(p,[],now);
 for(const s of result.sessions)assert.ok(s.start>=result.tasks.find(t=>t.id===s.taskId).createdAt);
});
test('pause excludes only that subject; completed prerequisite still works',()=>{
 const p=plan();p.subjects[0].paused=true;p.tasks[1].dependsOn=['a'];p.tasks[0].completed=true;
 const r=m.buildSmartPreview(p,[],now);assert.equal(r.sessions.length,2);assert.ok(r.sessions.every(s=>s.taskId==='b'));
});
test('recorded focus is deducted without treating time as task completion',()=>{
 const result=m.buildSmartPreview(plan({tasks:[task('a'),task('b',{dependsOn:['a']})]}),[{id:'r',taskId:'a',seconds:1800,timestamp:now,verified:false}],now);
 assert.equal(result.warnings.find(w=>w.taskId==='a').reason,'review-estimate');assert.equal(result.warnings.find(w=>w.taskId==='b').reason,'dependency');
});
test('locked conflicts are reported without moving protected sessions',()=>{
 const lock={taskId:'a',start:now,end:now+30*60000,locked:true};const result=m.buildSmartPreview(plan({sessions:[lock]}),[],now);
 assert.ok(result.warnings.some(w=>w.reason==='locked-conflict'));assert.equal(result.sessions.find(s=>s.locked).start,now);
});
test('feasible existing schedule remains stable on trivial edits',()=>{
 const p=plan();const initial=m.buildSmartPreview(p,[],now);const result=m.buildSmartPreview({...p,sessions:initial.sessions},[],now);
 assert.equal(JSON.stringify(result.sessions),JSON.stringify(initial.sessions));
});
test('unbroken assignments are not partially scheduled',()=>{
 const p=plan({tasks:[task('a',{minutes:180,flexibility:'fixed'})],dailyLimit:120});const result=m.buildSmartPreview(p,[],now);
 assert.equal(result.sessions.length,0);assert.equal(result.warnings[0].remainingMinutes,180);
});
test('daily load cap applies across overlapping windows',()=>{
 const p=plan({dailyLimit:30});const result=m.buildSmartPreview(p,[],now);const totals=new Map();
 for(const s of result.sessions){const key=m.dateKey(s.start,p.timezone);totals.set(key,(totals.get(key)||0)+(s.end-s.start)/60000);}
 assert.ok([...totals.values()].every(minutes=>minutes<=30));
});
test('history-based estimates require multiple comparable completed assignments',()=>{
 const t=task('next');const historical=[1,2,3].map(i=>task('h'+i,{completed:true}));const receipts=historical.map(t=>({id:t.id,taskId:t.id,seconds:3600,timestamp:now,verified:false}));
 assert.equal(m.estimateSuggestion(t,historical.slice(0,2),receipts),null);assert.equal(m.estimateSuggestion(t,historical,receipts).minutes,36);
});
test('private planner documents reject another owner',()=>{
 assert.equal(m.validSmartPlan(plan(),'u2'),false);assert.equal(m.validSmartPlan(plan(),'u1'),true);
});
test('manual placement validates commitments, breaks, deadlines and daily cap',()=>{
 const p=plan({tasks:[task('a')],dailyLimit:120});const result=m.buildSmartPreview(p,[],now);p.sessions=result.sessions;
 const block=p.sessions[0];const good=m.localInstant('2026-10-14','19:00',p.timezone);
 const moved=m.moveStudyBlock(p,block,good,[],now);assert.equal(moved.sessions[0].start,good);assert.equal(moved.sessions[0].locked,true);assert.equal(p.sessions[0].start,block.start);
 assert.throws(()=>m.moveStudyBlock(p,block,m.localInstant('2026-10-14','23:30',p.timezone),[],now));
 assert.throws(()=>m.moveStudyBlock(p,block,now-1,[],now));
 assert.throws(()=>m.moveStudyBlock({...p,dailyLimit:5},block,good,[],now));
});
test('manual placement cannot move a prerequisite behind its dependent',()=>{
 const p=plan({tasks:[task('a'),task('b',{dependsOn:['a']})]});p.sessions=m.buildSmartPreview(p,[],now).sessions;
 const block=p.sessions.find(s=>s.taskId==='a');assert.throws(()=>m.moveStudyBlock(p,block,m.localInstant('2026-10-16','19:00',p.timezone),[],now));
});

test('optimization honors explicit not-before times',()=>{const start=m.localInstant('2026-10-14','18:00','Asia/Tashkent');const p=plan({tasks:[task('a',{notBefore:start})]});const result=m.buildSmartPreview(p,[],now);assert.ok(result.sessions.length);assert.ok(result.sessions.every(s=>s.start>=start));});
test('paused subjects retain locked sessions during a reviewed optimization',()=>{const p=plan({subjects:[{...m.newSubject('IELTS'),id:'ielts',paused:true}],tasks:[task('a')],sessions:[{id:'locked-a',taskId:'a',start:m.localInstant('2026-10-14','18:00','Asia/Tashkent'),end:m.localInstant('2026-10-14','18:30','Asia/Tashkent'),locked:true}]});const result=m.buildSmartPreview(p,[],now);assert.ok(result.sessions.some(s=>s.taskId==='a' && s.start===p.sessions[0].start && s.locked));});
const calendar=load('src/features/planner/calendarModel.ts',{'./smartPlannerModel':m});
test('calendar resize rejects locked sessions and protected time without mutating the plan',()=>{const s={id:'s',taskId:'a',start:m.localInstant('2026-10-14','18:00','Asia/Tashkent'),end:m.localInstant('2026-10-14','18:30','Asia/Tashkent')};const p=plan({tasks:[task('a',{minutes:120})],sessions:[s],commitments:[{id:'busy',label:'Lesson',days:[3],start:'19:00',end:'20:00'}]});const before=JSON.stringify(p);assert.throws(()=>calendar.moveOrResize(p,{...s,locked:true},s.start,45,[],now));assert.throws(()=>calendar.moveOrResize(p,s,s.start,90,[],now));const moved=calendar.moveOrResize(p,s,s.start,45,[],now);assert.equal((moved.sessions[0].end-s.start)/60000,45);assert.equal(moved.sessions[0].locked,true);assert.equal(JSON.stringify(p),before);});
