const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('src/pages/Planner.tsx', 'utf8');
const tree = ts.createSourceFile('Planner.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'toggleTaskTimer') handler = node.initializer.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
function harness() {
  let resolve, reject, expired, calls = 0;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const patches = [], messages = [], running = [], starting = [];
  const context = { exports: {}, timerRunning: false, activeTask: { id: 'task', kind: 'quiz' }, activeActivity: {},
    startingTimerRef: { current: false }, completionGenerationRef: { current: 1 }, completionScope: 'plan', completionScopeRef: { current: 'plan' },
    activityViewRef: { current: { taskId: 'task', view: 'activity' } }, studyReceiptsRef: { current: {} },
    plannerState: { taskProgress: { task: { elapsedSeconds: 12 } } }, pc: { timerExpired: 'expired-safe', timerStartFailed: 'failed-safe' },
    setStartingTimer: value => starting.push(value), setValidationMessage: value => messages.push(value),
    setTimerRunning: value => running.push(value), updateProgress: (...args) => patches.push(args), withDeadline: promise => promise,
    startStudySession: (_, __, ___, callback) => { calls++; expired = callback; return pending; } };
  vm.runInNewContext(ts.transpileModule(`exports.run = ${handler}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { context, patches, messages, running, starting, resolve, reject, expire: () => expired(), calls: () => calls, run: context.exports.run };
}
test('timer start is deduplicated and starts only after a receipt arrives', async () => {
  const h = harness(); const first = h.run(); await h.run();
  assert.equal(h.calls(), 1); assert.equal(h.running.length, 0);
  h.resolve('receipt'); await first;
  assert.equal(h.context.studyReceiptsRef.current.task, 'receipt'); assert.equal(h.running.at(-1), true);
  assert.equal(h.context.startingTimerRef.current, false);
});
test('stale timer start cannot install a receipt or mutate progress', async () => {
  const h = harness(); const first = h.run(); h.context.completionGenerationRef.current++;
  h.expire(); h.resolve('stale'); await first;
  assert.equal(h.patches.length, 0); assert.equal(h.running.length, 0);
  assert.equal(h.context.studyReceiptsRef.current.task, undefined);
});
test('timer failure uses safe copy and leaves saved answers untouched', async () => {
  const h = harness(); const first = h.run(); h.reject(new Error('provider secret')); await first;
  assert.equal(h.messages.at(-1).copy, 'timerStartFailed'); assert.equal(h.patches.length, 0);
  assert.equal(h.context.startingTimerRef.current, false);
});
test('late timer failure after leaving activity is ignored', async () => {
  const h = harness(); const first = h.run(); h.context.activityViewRef.current.view = 'today';
  h.expire(); h.reject(new Error('late')); await first;
  assert.equal(h.messages.at(-1), ''); assert.equal(h.patches.length, 0);
});
test('expired timer resets elapsed time only, keeping answer fields', async () => {
  const h = harness(); const first = h.run(); h.expire(); h.resolve('new'); await first;
  assert.deepEqual(Object.keys(h.patches[0][1]), ['elapsedSeconds']);
  assert.equal(h.patches[0][1].elapsedSeconds, 0); assert.ok(h.messages.some(message => message.copy === 'timerExpired'));
});
