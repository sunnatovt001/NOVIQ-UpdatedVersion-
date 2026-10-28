const {test} = require('node:test');
const assert = require('node:assert/strict');
const {evaluate,freshDay,levelInfo,threshold,catalogue,dayKey} = require('./progression');
const at='2026-10-26T10:00:00.000Z';
const event=(source,extra={})=>({id:'fixture',source,at,dayKey:'2026-10-26',...extra});

test('every level threshold, intermediate level, multi-level award and level 11+ formula',()=>{
  for(const item of catalogue.levels) {
    assert.equal(levelInfo(item.minXp).level,item.level);
    assert.equal(levelInfo(item.minXp).name,item.name);
    if(item.level>1) assert.equal(levelInfo(item.minXp-1).level,item.level-1);
  }
  for(const [level,xp] of [[11,6200],[12,7500],[13,8900],[15,12000],[20,21500]]) {
    assert.equal(threshold(level),xp);assert.equal(levelInfo(xp).level,level);assert.equal(levelInfo(xp-1).level,level-1);
  }
  assert.equal(levelInfo(NaN).level,1);assert.equal(levelInfo(Infinity).level,1);assert.equal(levelInfo(-100).level,1);
  const result=evaluate({xp:249,counters:{focusSeconds:17999}},freshDay('2026-10-26',30),event('focus',{duration:1500}));
  assert.equal(result.state.xp,359);assert.equal(result.state.level,3);
});
test('Focus 4:59, 5:00, 25:00, 55:00; caps preserve every study second',()=>{
  for(const [duration,xp] of [[299,0],[300,5],[1500,20],[3300,20]]) {
    const result=evaluate({xp:0},freshDay('2026-10-26',480),event('focus',{duration}));
    assert.equal(result.result.sourceXp,xp);assert.equal(result.day.focusSeconds,duration);
    assert.equal(result.state.counters.focusSeconds,duration);
  }
  let state={xp:0},day=freshDay('2026-10-26',480);
  for(let i=0;i<5;i++) {
    const result=evaluate(state,day,event('focus',{id:`focus-${i}`,duration:1500}));
    assert.equal(result.result.sourceXp,i<4?20:0);state=result.state;day=result.day;
  }
  assert.equal(day.focusXp,80);assert.equal(day.focusSeconds,7500);assert.equal(state.counters.focusSeconds,7500);
});
test('ordinary cap excludes achievement bonuses and never loses verified duration',()=>{
  const day={...freshDay('2026-10-26',480),ordinaryXp:178};
  const result=evaluate({xp:1000},day,event('focus',{duration:1500}));
  assert.equal(result.result.ordinaryXp,2);assert.equal(result.result.bonusXp,40);
  assert.equal(result.result.sourceXp,2);assert.equal(result.state.xp,1042);
  assert.equal(result.day.focusSeconds,1500);assert.equal(result.day.ordinaryXp,180);
});
test('10 distinct recall cards per block; two paid blocks, lifetime progress continues',()=>{
  let state={xp:0},day=freshDay('2026-10-26',30),sourceXp=0;
  for(let i=0;i<35;i++) {
    const result=evaluate(state,day,event('recall',{id:`card-${i}`,newCards:1,newLifetimeCards:1}));
    if(i===8) assert.equal(result.day.recallXp,0);
    state=result.state;day=result.day;sourceXp+=result.result.sourceXp;
  }
  assert.equal(sourceXp,30);assert.equal(day.recallCards,35);assert.equal(state.counters.uniqueRecallCards,35);
  assert.ok(state.achievements.A01);assert.ok(state.achievements.A07);assert.equal(day.bonusXp,40);
});
test('login-only days never advance streak; milestones are one-time rewards',()=>{
  let state={xp:0},last;
  for(let i=1;i<=30;i++) {
    const key=`2026-10-${String(i).padStart(2,'0')}`;
    let result=evaluate(state,freshDay(key,480),event('login',{id:`login-${i}`,dayKey:key}));
    if(i===1) assert.equal(result.state.streak,undefined);
    result=evaluate(result.state,result.day,event('focus',{id:`focus-${i}`,dayKey:key,duration:600}));
    state=result.state;last=result;
    if(i===7) assert.equal(result.result.bonusXp,50);
    if(i===30) { assert.equal(result.state.achievements.A12.xp,150); assert.equal(result.result.unlocked.filter(id=>id==='A12').length,1); }
  }
  assert.equal(state.streak,30);assert.ok(state.achievements.A11);assert.ok(state.achievements.A12);
  const repeated=evaluate(state,last.day,event('focus',{duration:600}));
  assert.equal(repeated.state.streak,30);assert.equal(repeated.result.bonusXp,0);
  const broken=evaluate(state,freshDay('2026-11-02',480),event('focus',{dayKey:'2026-11-02',duration:600}));
  assert.equal(broken.state.streak,1);assert.ok(broken.state.xp>=state.xp);
});
test('every achievement exact threshold and once-only reward; legacy streak bonus never repeats',()=>{
  for(const item of catalogue.achievements) {
    const progress={xp:100,counters:{[item.metric]:item.target-1}};
    const day=freshDay('2026-10-26',480);
    let result=evaluate(progress,day,event('none'));
    assert.equal(result.state.achievements[item.id],undefined,item.id);
    progress.counters[item.metric]=item.target;
    result=evaluate(progress,day,event('none'));
    assert.equal(result.state.achievements[item.id].xp,item.xp,item.id);
    assert.equal(result.state.achievements[item.id].unlockedAt,at);
    const again=evaluate(result.state,result.day,event('none',{id:'replay'}));
    assert.equal(again.result.bonusXp,0);assert.equal(again.state.xp,result.state.xp);
  }
  const result=evaluate({xp:500,counters:{bestStreak:30}},freshDay('2026-10-26',30),event('none',{legacyStreak7:true,legacyStreak30:true}));
  assert.equal(result.result.bonusXp,0);assert.ok(result.state.achievements.A12);
});
test('daily goal requires the snapshot and >=20 minutes; capped Focus still meets goal',()=>{
  let day={...freshDay('2026-10-26',5),focusSeconds:1199,focusXp:80};
  let result=evaluate({xp:0},day,event('focus',{duration:1}));
  assert.equal(result.day.goalAwarded,true);assert.equal(result.result.ordinaryXp,20);
  day={...freshDay('2026-10-26',60),focusSeconds:1800,focusXp:80};
  result=evaluate({xp:100},day,event('focus',{duration:1500}));assert.equal(result.day.goalAwarded,false);
  result=evaluate(result.state,result.day,event('focus',{duration:300}));assert.equal(result.day.goalAwarded,true);assert.equal(result.result.sourceXp,0);
});
test('balanced achievement needs both activities on ten different days',()=>{
  let state={xp:0};
  for(let i=1;i<=10;i++) {
    const key=`2026-10-${String(i).padStart(2,'0')}`;
    let result=evaluate(state,freshDay(key,480),event('focus',{dayKey:key,duration:600}));
    result=evaluate(result.state,result.day,event('recall',{dayKey:key,newCards:10,newLifetimeCards:10}));
    assert.equal(result.state.counters.balancedDays,i);
    result=evaluate(result.state,result.day,event('recall',{dayKey:key,newCards:10,newLifetimeCards:10}));
    assert.equal(result.state.counters.balancedDays,i);state=result.state;
  }
  assert.equal(state.achievements.A16.xp,80);
});
test('Free and PRO have identical rewards; Tashkent rollover is exact',()=>{
  const day=freshDay('2026-10-26',30),focus=event('focus',{duration:1500});
  const free=evaluate({xp:0,subscription:'free'},day,focus),pro=evaluate({xp:0,subscription:'pro'},day,focus);
  assert.deepEqual(free.result,pro.result);
  assert.equal(dayKey(new Date('2026-10-26T18:59:59.999Z')),'2026-10-26');
  assert.equal(dayKey(new Date('2026-10-26T19:00:00.000Z')),'2026-10-27');
});
