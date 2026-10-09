const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalize,dateMillis}=require('./metrics');
test('legacy dates normalize without modifying originals or inventing missing evidence',()=>{
  const original={dueAt:{seconds:1700000000},createdAt:'2026-01-02T00:00:00Z',reviewCount:'2',front:'Private content'};
  const before=JSON.stringify(original);
  const projected=normalize('card',original,'users/u/decks/d/cards/c','d');
  assert.equal(projected.dueMillis,1700000000000);assert.equal(projected.reviewed,true);
  assert.equal(JSON.stringify(original),before);assert.equal(projected.front,undefined);
  assert.equal(dateMillis('invalid'),null);
  assert.equal(normalize('card',{dueAt:'invalid'},'x','d').dueMillis,Number.MAX_SAFE_INTEGER);
});
test('session projections preserve valid legacy focus and exclude unfinished sessions',()=>{
  const source={duration:180,category:'focus',timestamp:'2026-01-02T00:00:00Z',xpEarned:3};
  assert.equal(normalize('session',source,'x').focusSeconds,180);
  for (const patch of [{duration:0},{duration:NaN},{timestamp:'invalid'},{status:'pending'},{status:'cancelled'}]) assert.equal(normalize('session',{...source,...patch},'x').focusSeconds,0);
  assert.equal(normalize('session',source,'x').xp,3);
});
test('task and message projections use actual completion and author evidence',()=>{
  assert.equal(normalize('task',{status:'DONE',updatedAt:'2026-01-02'},'x').completed,true);
  assert.equal(normalize('task',{status:'pending'},'x').completed,false);
  assert.equal(normalize('tutorMessage',{role:'user'},'x').roleUser,true);
  assert.equal(normalize('tutorMessage',{role:'assistant'},'x').roleUser,false);
});
