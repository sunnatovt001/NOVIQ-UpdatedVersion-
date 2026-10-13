const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
test('roadmap cards render supplied localized phases without state or services', () => {
  const exports = {};
  const source = fs.readFileSync('src/features/planner/PlannerRoadmapCards.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === '@/src/lib/utils' ? { cn: (...values) => values.filter(Boolean).join(' ') } : require(name) });
  for (const state of ['current', 'done', 'locked']) {
    const html = renderToStaticMarkup(React.createElement(exports.PlannerRoadmapCards, { phases: [{ phase:'Phase 1', title:'Localized title', status:'Localized status', state, weeks:['Week one','Week two'] }] }));
    assert.ok(html.includes('Localized title') && html.includes('Localized status'));
    assert.ok(html.includes('Week one') && html.includes('Week two'));
    assert.equal((html.match(/<article/g) || []).length, 1);
    assert.ok(html.includes('lg:grid-cols-3'));
    if (state === 'current') assert.ok(html.includes('text-[var(--noviq-on-accent)]'));
  }
  assert.ok(!/firebase|localStorage|useState|useEffect/.test(source));
  assert.match(fs.readFileSync('src/pages/Planner.tsx','utf8'), /<PlannerRoadmapCards phases=\{phases\}/);
});
