const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const exportsModule={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/planner/smartSchedule.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsModule});
const {proposeSchedule}=exportsModule;
const minute=60000;
const task=(id,minutes=30,extra={})=>({id,subjectId:id,title:id,minutes,priority:1,...extra});
const input=(extra={})=>({now:0,windows:[{start:0,end:180*minute}],protectedEvents:[],tasks:[task('ielts'),task('physics')],existing:[],sessionMinutes:30,breakMinutes:5,...extra});
test('multiple independent subjects get nonoverlapping sessions and breaks',()=>{
 const result=proposeSchedule(input()); assert.equal(result.warnings.length,0);
 assert.equal(result.sessions.length,2);assert.equal(result.sessions[1].start-result.sessions[0].end,5*minute);
});
test('protected events and locked blocks are never moved or overlapped',()=>{
 const locked={taskId:'ielts',start:60*minute,end:90*minute,locked:true};
 const result=proposeSchedule(input({protectedEvents:[{start:0,end:60*minute}],existing:[locked]}));
 assert.equal(result.sessions.find(block=>block.locked).start,locked.start);
 assert.equal(result.sessions.find(block=>block.taskId==='physics').start,95*minute);
});
test('insufficient deadline capacity is explicit and never scheduled in past',()=>{
 const result=proposeSchedule(input({now:20*minute,tasks:[task('sat',120,{deadline:40*minute})]}));
 assert.equal(result.warnings[0].remainingMinutes,100);
 assert.ok(result.sessions.every(block=>block.start>=20*minute&&block.end<=40*minute));
});
test('dependencies are ordered and cycles are reported',()=>{
 const result=proposeSchedule(input({tasks:[task('b',30,{dependsOn:['a']}),task('a')]}));
 assert.equal(result.sessions[0].taskId,'a');
 assert.equal(proposeSchedule(input({tasks:[task('a',30,{dependsOn:['b']}),task('b',30,{dependsOn:['a']})]})).warnings.length,2);
});
test('no availability is recoverable; preview leaves inputs intact',()=>{
 const source=input({windows:[]});const before=JSON.stringify(source);
 assert.equal(proposeSchedule(source).warnings.length,2);assert.equal(JSON.stringify(source),before);
});
test('duplicate IDs and malformed constraints fail safely',()=>{
 assert.throws(()=>proposeSchedule(input({tasks:[task('a'),task('a')]})));
 assert.throws(()=>proposeSchedule(input({breakMinutes:-1})));
});
