const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const read=path=>fs.readFileSync(path,'utf8');
const loadCopy=()=>{
 const module={exports:{}};
 const code=ts.transpileModule(read('src/features/landing/landingContent.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports});
 return module.exports;
};
test('public landing copy has complete, factual EN/UZ/RU content and six supported routes',()=>{
 const {getPublicLandingCopy,landingFeatureRoutes}=loadCopy();
 const en=getPublicLandingCopy('en');
 assert.deepEqual(Array.from(landingFeatureRoutes),['planner','flashcards','focus','analytics','tutor','notes']);
 for(const locale of ['en','uz','ru']){
  const copy=getPublicLandingCopy(locale);
  assert.deepEqual(Object.keys(copy).sort(),Object.keys(en).sort());
  assert.equal(copy.featureCards.length,6);
  assert.equal(copy.benefits.length,3);
  assert.equal(copy.headline.length,2);
  assert.doesNotMatch(JSON.stringify(copy),/100,?000|100\+ schools|4\.[89]\s*\/\s*5|24\/7|millions|thousands of learners/i);
 }
 assert.deepEqual(Array.from(en.headline),['Make exam prep','make sense.']);
});
test('landing reuses deferred auth without changing services and has no fake demo destination',()=>{
 const page=read('src/pages/Landing.tsx');
 assert.match(page,/<DeferredAuthDialog/);
 assert.match(page,/openAuth\("signup"\)/);
 assert.match(page,/openAuth\("login"\)/);
 assert.doesNotMatch(page,/firebase\/|mongoAuthApi|localStorage\.setItem|fetch\(/);
 assert.doesNotMatch(page,/Watch demo|href="#"|LandingReference\.css/);
 assert.match(page,/className="nl-feature-card" onClick/);
});
test('student hero preserves the supplied illustration and respects motion preferences',()=>{
 const source=read('src/features/landing/LandingStudents.tsx');
 for(const expected of ['IntersectionObserver','visibilitychange','prefers-reduced-motion','prefers-reduced-data','saveData','data-running','onError']) assert.ok(source.includes(expected),expected);
 assert.doesNotMatch(source,/<video|noviq-brain/);
 assert.ok(fs.statSync('public/landing/noviq-students.webp').size<200*1024);
 const css=read('src/pages/Landing.css');
 assert.match(css,/var\(--noviq-text/);
 assert.match(css,/var\(--noviq-accent/);
 assert.doesNotMatch(css,/(^|\n)\s*(body|html|:root|\.noviq-app)[\s:{]/);
});
