const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('src/pages/Planner.tsx', 'utf8');
const tree = ts.createSourceFile('Planner.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes('const savedOnDevice')) effect = node.arguments[0].getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
function harness(saved) {
  const messages = []; let timer, reject;
  const context = { exports: {}, hydrated: true, loadBlocked: false, isReadOnlyAudit: false, user: { uid: 'fixture' },
    plannerState: { answer: 'retained' }, lastCloudPlannerStateRef: { current: '' }, plannerDirtyRef: { current: false }, cloudSaveRef: { current: undefined },
    saveLocalData: () => saved, setValidationMessage: value => messages.push(value),
    pc: { storageUnavailable: 'storage failed', cloudRetrySaved: 'saved locally', cloudRetryUnsaved: 'not confirmed saved' },
    window: { setTimeout: callback => { timer = callback; return 1; }, clearTimeout() {} },
    writeDocWithQueue: () => new Promise((_, no) => { reject = no; }), console: { warn() {} }, Date, JSON };
  context.plannerCopyRef = { current: context.pc };
  vm.runInNewContext(ts.transpileModule(`exports.effect = ${effect}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const cleanup = context.exports.effect();
  return { context, messages, cleanup, fail: async () => { timer(); reject(new Error('sync failed')); await Promise.resolve(); }, start: () => timer(), reject: async () => { reject(new Error('late failure')); await Promise.resolve(); } };
}
test('failed device and cloud saves never claim the plan is saved locally', async () => {
  const h = harness(false); await h.fail();
  assert.deepEqual(h.messages.map(message => message.copy), ['storageUnavailable', 'cloudRetryUnsaved']);
});
test('confirmed local save remains distinguished from failed cloud sync', async () => {
  const h = harness(true); await h.fail(); assert.deepEqual(h.messages.map(message => message.copy), ['cloudRetrySaved']);
});
test('obsolete save failures cannot overwrite current UI feedback', async () => {
  const h = harness(true); h.start(); h.cleanup(); await h.reject(); assert.deepEqual(h.messages, []);
});
test('cloud save failure stores a locale-independent key after a locale change', async () => {
  const h = harness(true); h.start();
  h.context.plannerCopyRef.current = { cloudRetrySaved: 'new-language guidance' };
  await h.reject(); assert.deepEqual(h.messages.map(message => message.copy), ['cloudRetrySaved']);
});

test('already-visible feedback follows current locale without another save or timer request', () => {
  let renderExpression;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'validationMessage') renderExpression = node.initializer.getText(tree);
    ts.forEachChild(node, find);
  }
  find(tree);
  assert.ok(renderExpression);
  const copyModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/planner/plannerCopy.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, copyModule);
  const validationModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/planner/plannerValidationCopy.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, validationModule);
  const context = { exports: {}, pc: copyModule.exports.getPlannerCopy('en'), validationFeedback: '', locale: 'en',
    formatCopy: copyModule.exports.formatPlannerText, localizePlannerValidation: validationModule.exports.localizePlannerValidation,
    t: key => `${context.locale}:${key}` };
  vm.runInNewContext(ts.transpileModule(`exports.render = () => (${renderExpression});`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  for (const key of ['cloudSavedOffline', 'storageUnavailable', 'cloudRetrySaved', 'cloudRetryUnsaved', 'timerExpired', 'timerStartFailed', 'taskSaveFailed', 'eventSyncFailed']) {
    context.validationFeedback = { copy: key };
    for (const locale of ['en', 'uz', 'ru', 'en']) {
      context.pc = copyModule.exports.getPlannerCopy(locale);
      context.locale = locale;
      assert.equal(context.exports.render(), context.pc[key]);
      if (locale !== 'en') assert.notEqual(context.exports.render(), copyModule.exports.getPlannerCopy('en')[key]);
    }
  }
  for (const score of [0, 100]) {
    context.validationFeedback = { copy: 'quizSubmittedScore', values: { score } };
    for (const locale of ['en', 'uz', 'ru']) {
      context.pc = copyModule.exports.getPlannerCopy(locale);
      assert.equal(context.exports.render(), context.pc.quizSubmittedScore.replace('{score}', String(score)));
    }
  }
  const reasons = ['Answer every quiz question.', 'Study timer needs 3 more min.', 'Write at least 90 words.'];
  context.validationFeedback = { requirements: reasons };
  for (const locale of ['en', 'uz', 'ru', 'en']) {
    context.locale = locale;
    assert.equal(context.exports.render(), reasons.map(reason => context.localizePlannerValidation(reason, locale)).join(' '));
    assert.deepEqual(context.validationFeedback.requirements, reasons);
  }
  context.validationFeedback = { loadError: true };
  context.locale = 'ru';
  assert.equal(context.exports.render(), 'ru:planner.loadErrorBody');
  context.validationFeedback = '';
  assert.equal(context.exports.render(), '');
});
