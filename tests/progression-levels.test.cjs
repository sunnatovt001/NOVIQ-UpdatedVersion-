const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const catalogue=require('../functions/xp-catalog.json');
const server=require('../functions/progression');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/levels.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,require:()=>({default:catalogue})});
test('frontend and backend agree at every threshold, including growing levels',()=>{
  for(let level=1;level<=100;level++) for(const delta of [-1,0,1]) {
    const xp=server.threshold(level)+delta;
    assert.equal(exportsObject.calculateLevel(xp),server.levelInfo(xp).level);
    assert.equal(exportsObject.calculateLevelName(xp),server.levelInfo(xp).name);
  }
});
test('1300 cumulative XP displays level 5, 300/600 progress, 50%, and 300 remaining',()=>{
  const result=exportsObject.levelProgress(1300);
  assert.equal(result.level,5);assert.equal(result.xp,1300);assert.equal(result.earned,300);
  assert.equal(result.required,600);assert.equal(result.percent,50);assert.equal(result.remaining,300);
  for(const xp of [0,99,100,4999,5000,6200,7500]) {
    const info=exportsObject.levelProgress(xp);assert.ok(info.percent>=0&&info.percent<100);assert.ok(info.remaining>0);
  }
});
