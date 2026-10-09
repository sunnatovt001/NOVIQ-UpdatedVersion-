const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => dependencies[name] || {}, Date, setTimeout, clearTimeout, Map });
  return exports;
}
const evidence = load('src/lib/activityEvidence.ts', { './recordDate': load('src/lib/recordDate.ts') });
const asyncRequests = load('src/lib/asyncRequest.ts');
const plannerActivity = load('src/lib/plannerActivity.ts');

test('malformed AI activities cannot silently acquire template questions or prompts', () => {
  const base = { title: 'Activity', instructions: 'Read and answer.' };
  for (const kind of ['quiz', 'flashcards', 'speaking', 'writing']) assert.throws(() => plannerActivity.validateActivityResponse(kind, base), /incomplete activity/);
  assert.throws(() => plannerActivity.validateActivityResponse('quiz', { ...base, questions: [{ prompt: 42 }] }), /incomplete activity/);
  assert.doesNotThrow(() => plannerActivity.validateActivityResponse('speaking', { ...base, speakingPrompt: 'Explain the concept.' }));
});

function handler(path, name, context) {
  context.Error = Error;
  context.isLocalAi ??= false;
  context.localProvider ??= context.isLocalAi;
  const source = fs.readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) body = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(body, name);
  vm.runInNewContext(ts.transpileModule(`globalThis.handler = ${body}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.handler;
}

test('mission completion distinguishes missing evidence from actual zero and is shared', () => {
  assert.equal(evidence.missionCompletion(0, 0), null);
  assert.equal(evidence.missionCompletion(5, 0), 0);
  assert.equal(evidence.missionCompletion(5, 2), 40);
  assert.equal(evidence.missionCompletion(5, 8), 100);
});
test('zero, incomplete, invalid and negative sessions cannot generate completed-study advice', () => {
  for (const duration of [0, -60, 59, NaN, Infinity]) assert.equal(evidence.isMeaningfulSession({ duration, timestamp: '2026-10-04' }), false);
  assert.equal(evidence.isMeaningfulSession({ duration: 60, timestamp: 'bad' }), false);
  assert.equal(evidence.isMeaningfulSession({ duration: 60, timestamp: '2026-10-04', status: 'pending' }), false);
  assert.equal(evidence.isMeaningfulSession({ duration: 60, timestamp: '2026-10-04' }), true);
});
test('all-deck due counts use real due dates and review records, not task completion', () => {
  const cards = [{ dueAt: '2026-10-03', reviewCount: 1 }, { dueAt: '2026-10-04', reviewCount: 0 }, { dueAt: '2026-10-05', reviewCount: 2 }, { dueAt: 'bad' }];
  const result = evidence.summarizeCards(cards, new Date('2026-10-04T12:00:00Z').getTime());
  assert.deepEqual({ ...result }, { total: 4, due: 2, reviewed: 2 });
  assert.match(evidence.reviewGuidance(0, 0, 0), /start reviewing/);
  assert.match(evidence.reviewGuidance(7, 0, 7), /No card reviews/);
  assert.doesNotMatch(evidence.reviewGuidance(7, 7, 0), /solid|lagging/);
});
test('missing or legacy message authors have readable names', () => {
  assert.equal(evidence.messageAuthor({ displayName: ' ' }), 'Former or unnamed member');
  assert.equal(evidence.messageAuthor({ authorName: 'Member' }), 'Member');
  assert.equal(evidence.resolveMessageAuthor({}, 'Existing member', 'ready'), 'Existing member');
  assert.equal(evidence.resolveMessageAuthor({}, null, 'ready'), 'Former or unnamed member');
  assert.equal(evidence.resolveMessageAuthor({}, undefined, 'error'), 'Member name unavailable');
  assert.equal(evidence.resolveMessageAuthor({}, undefined, 'loading'), 'Loading member name…');
});
test('request deadlines settle loading and concurrent retries share one request', async () => {
  await assert.rejects(asyncRequests.withDeadline(new Promise(() => {}), 5), /timed out/);
  let calls = 0;
  const run = asyncRequests.createSingleFlight();
  const operation = () => { calls++; return new Promise(resolve => setTimeout(() => resolve('answer'), 5)); };
  assert.deepEqual(await Promise.all([run('activity', operation), run('activity', operation)]), ['answer', 'answer']);
  assert.equal(calls, 1);
});

test('Metrics current and previous weeks use distinct Monday–Sunday windows and real hours', () => {
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-04T12:00:00'])); } }
  const context = { Date: FixedDate, DAY_LABELS: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], getLocalDayKey: (value) => { const d = new Date(value); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; } };
  context.getWeekStart = handler('src/pages/Analytics.tsx', 'getWeekStart', context);
  const build = handler('src/pages/Analytics.tsx', 'buildWeeklyData', context);
  const sessions = [{timestamp:'2026-09-28T12:00:00',duration:3600},{timestamp:'2026-09-21T12:00:00',duration:1800}];
  assert.equal(build(sessions,0)[0].hours,1);
  assert.equal(build(sessions,-1)[0].hours,0.5);
  assert.equal(build([],0).every(day => day.hours === 0),true);
});

test('charts wait for positive container dimensions, resize and disconnect their observer', () => {
  let bounds={width:0,height:0},size={width:0,height:0},effect,resize,disconnected=false,clones=0;
  const element={getBoundingClientRect:()=>bounds};
  const react={useRef:()=>({current:element}),useState:()=>[size,(update)=>{size=update(size);}],useLayoutEffect(callback){effect=callback;},cloneElement(child,props){clones++;return{...child,props};}};
  class Observer { constructor(callback){resize=callback;} observe(){} disconnect(){disconnected=true;} }
  const exports={};
  const code=ts.transpileModule(fs.readFileSync('src/components/MeasuredChart.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,ResizeObserver:Observer,Math,require:(name)=>name==='react'?{default:react,...react}:{jsx:(type,props)=>({type,props})}});
  const render=()=>exports.MeasuredChart({children:{type:'chart'}});
  assert.equal(render().props.children.type,'span'); const cleanup=effect();
  assert.equal(clones,0);
  bounds={width:299.9,height:250.7};resize();const chart=render().props.children;
  assert.equal(chart.type,'chart');assert.equal(chart.props.width,299);assert.equal(chart.props.height,250);
  bounds={width:0,height:250};resize();assert.equal(render().props.children.type,'span');
  cleanup();assert.equal(disconnected,true);
});

test('card edits preserve due dates and review history, reject blank content and duplicate saves', async () => {
  const original = {id:'c1',front:'Original',back:'Answer',dueAt:'2026-10-12',interval:8,easeFactor:2.8,repetition:4,lapses:1,reviewCount:9};
  let resolve;
  const calls = [];
  const context = {user:{uid:'isolated'},selectedDeck:{id:'d1'},cardForm:{front:' Revised ',back:' Answer ',imageUrl:''},editingCardId:'c1',cardImageFile:null,isReadOnlyAudit:false,saveRequestRef:{current:false},state:{d1:[original]},deckCards:()=>context.state.d1,setIsSaving(){},setStatus(){},setCardsByDeck(update){context.state=update(context.state);},isLocalId:()=>false,writeDocWithQueue(operation){calls.push(operation); return calls.length===1 ? new Promise(done=>{resolve=done;}) : Promise.resolve('synced');},resetCardForm(){},setCloudSyncBlocked(){},getAppErrorMessage:String,console};
  const save = handler('src/pages/Flashcards.tsx','handleSaveCard',context);
  context.cardForm.front=' '; await save(); assert.equal(calls.length,0);
  context.cardForm.front=' Revised '; const first=save(); await save(); assert.equal(calls.length,1);
  for(const field of ['dueAt','interval','easeFactor','repetition','lapses','reviewCount']) assert.equal(context.state.d1[0][field],original[field]);
  assert.equal(context.state.d1[0].front,'Revised');
  assert.equal(calls[0].data.reviewCount,undefined);
  resolve('synced'); await first; assert.equal(context.saveRequestRef.current,false);
  context.isReadOnlyAudit=true; await save(); assert.equal(calls.length,2);
});

test('one deck-review action cannot grade a card or award progress twice', async () => {
  let resolve, writes=0, awards=0;
  const card={id:'card',reviewCount:3};
  const context={user:{uid:'isolated'},selectedDeck:{id:'deck'},currentPracticeCard:card,gradeRequestRef:{current:false},lastGradedCardRef:{current:null},isReadOnlyAudit:false,setIsGrading(){},nextSchedule:()=>({interval:2}),state:{deck:[card]},setCardsByDeck(update){context.state=update(context.state);},writeDocWithQueue(){writes++;return new Promise(done=>{resolve=done;});},setReviewedCount(update){context.reviewed=update(context.reviewed||0);},setIsFlipped(){},updateLocalProfile(){awards++;},buildXpAwardPatch:()=>({}),profile:{},NOVIQ_XP:{memory:{revision:5}},persistXpAwards:async()=>{},trackUserEvent:async()=>{},practiceIndex:0,practiceQueue:[card],window:{setTimeout(){}},setCloudSyncBlocked(){},getAppErrorMessage:String,console};
  const grade=handler('src/pages/Flashcards.tsx','gradeCurrentCard',context);
  const first=grade('easy'); await grade('easy'); assert.equal(writes,1);
  resolve('synced'); await first; await grade('easy');
  assert.equal(writes,1);assert.equal(awards,1);assert.equal(context.reviewed,1);assert.equal(context.state.deck[0].reviewCount,4);
});

function plannerContext() {
  const context = { plannerState: { activities: { saved: { title: 'Saved' } }, taskProgress: { saved: { status: 'notStarted', elapsedSeconds: 0 } } }, openingTaskRef: { current: false }, setTimerRunning() {}, setValidationMessage() {}, setActiveTaskId() {}, setView() {}, setActivityError(value) { context.error = value; }, setGeneratingTaskId(value) { context.loading = value; }, generateActivity: async () => ({ title: 'Generated' }), setPlannerState(update) { context.plannerState = update(context.plannerState); } };
  return context;
}
test('opening and reopening a saved Planner activity cannot change status, time or start a proof', async () => {
  const context = plannerContext();
  context.startStudySession = () => { throw new Error('Opening must not start a session'); };
  const open = handler('src/pages/Planner.tsx', 'openActivity', context);
  const before = JSON.stringify(context.plannerState);
  await open({ id: 'saved' }); await open({ id: 'saved' });
  assert.equal(JSON.stringify(context.plannerState), before);
  assert.equal(context.openingTaskRef.current, false);
});
test('Planner generation failure exposes an error, clears loading and allows a single retry without progress mutation', async () => {
  const context = plannerContext();
  let reject;
  let calls = 0;
  context.generateActivity = () => { calls++; return new Promise((_, fail) => { reject = fail; }); };
  const open = handler('src/pages/Planner.tsx', 'openActivity', context);
  const first = open({ id: 'new' });
  await open({ id: 'new' });
  assert.equal(calls, 1);
  reject(new Error('AI unavailable')); await first;
  assert.equal(context.error, 'AI unavailable');
  assert.equal(context.loading, null);
  assert.equal(context.plannerState.activities.new, undefined);
  assert.equal(context.plannerState.taskProgress.new, undefined);
  context.generateActivity = async () => ({ title: 'Retry result' });
  await open({ id: 'new' });
  assert.equal(context.plannerState.activities.new.title, 'Retry result');
  assert.equal(context.plannerState.taskProgress.new, undefined);
});
test('Planner starts only after server proof, rejects a failed start and ignores a late result after leaving', async () => {
  const context = { timerRunning: false, activeTask: { id: 'task', kind: 'speaking' }, activeActivity: {}, startingTimerRef: { current: false }, plannerState: { taskProgress: {} }, activityViewRef: { current: { taskId: 'task', view: 'activity' } }, studyReceiptsRef: { current: {} }, withDeadline: asyncRequests.withDeadline, setStartingTimer() {}, setValidationMessage() {}, setTimerRunning(value) { context.timerRunning = value; }, updateProgress(id, patch) { context.patch = patch; }, startStudySession: async () => { throw new Error('offline'); } };
  const start = handler('src/pages/Planner.tsx', 'toggleTaskTimer', context);
  await start();
  assert.equal(context.patch, undefined); assert.equal(context.timerRunning, false);
  context.startStudySession = async () => 'proof';
  context.activityViewRef.current.view = 'today';
  await start(); assert.equal(context.patch, undefined);
  context.activityViewRef.current.view = 'activity';
  await start(); assert.equal(context.patch.status, 'inProgress'); assert.equal(context.timerRunning, true);
  await start(); assert.equal(context.timerRunning, false);
});

test('AI callable errors provide auth, quota, timeout and malformed-response guidance without keys', () => {
  const gemini = load('src/lib/gemini.ts', { 'firebase/functions': { httpsCallable: () => () => {} } });
  assert.match(gemini.getFriendlyAiError({ code: 'functions/unauthenticated' }), /Sign in/);
  assert.match(gemini.getFriendlyAiError({ code: 'functions/deadline-exceeded' }), /timed out/);
  assert.match(gemini.getFriendlyAiError({ message: 'AI_DAILY_LIMIT' }), /daily AI allowance/);
  assert.match(gemini.getFriendlyAiError({ message: 'AI_EMPTY_RESPONSE' }), /empty response/);
});

test('Tutor renders successful and failed AI responses in isolation and retry does not duplicate the user message', async () => {
  const noop = () => {};
  const context = { Date, user: { uid: 'test-only' }, activePro: true, tutorUsage: 0, tutorLimit: 5, aiRequestRef: { current: false }, voiceLanguage: 'en-US', profile: {}, persistedMessages: [], dayKey: '2026-10-04',
    setUpgradeOpen: noop, setInput: noop, setAttachedFiles: noop, setUploadError: noop, setLastRequest: noop, setTutorUsage: noop, saveLocalDailyUsage: noop, speak: noop,
    buildStudentTutorContext: () => '', trackUserEvent: async () => {}, persistMessage: async () => {}, getAppErrorMessage: error => error.message,
    messages: [], setMessages(update) { context.messages = update(context.messages); }, setAiError(value) { context.error = value; }, setIsTyping(value) { context.loading = value; }, askTutor: async () => 'Mocked answer' };
  context.ownerRef={current:'test-only'};
  context.chat={activeId:'test-conversation',add(message){context.messages.push(message);}};
  const send = handler('src/pages/Tutor.tsx', 'submitPrompt', context);
  await send('   ', []); assert.equal(context.messages.length, 0);
  await send('Test question', []); assert.equal(context.messages.at(-1).role, 'assistant'); assert.equal(context.messages.at(-1).content, 'Mocked answer');
  context.askTutor = async () => { throw new Error('Provider unavailable'); };
  await send('Second question', []); assert.equal(context.error, 'Provider unavailable'); assert.equal(context.loading, false);
  const userCount = context.messages.filter(message => message.role === 'user').length;
  context.askTutor = async () => 'Retry answer';
  await send('Second question', [], true);
  assert.equal(context.messages.filter(message => message.role === 'user').length, userCount);
  assert.equal(context.messages.at(-1).content, 'Retry answer');
  context.activePro=false;context.tutorUsage=0;
  context.saveLocalDailyUsage=()=>{throw new Error('Device storage full');};
  await send('Question with unavailable device storage',[]);
  assert.equal(context.messages.at(-1).content,'Retry answer');
  assert.equal(context.aiRequestRef.current,false);assert.equal(context.loading,false);
});

test('Notebook AI renders real handler output, blocks whitespace and parallel submits, and retries without duplicate user records', async () => {
  const noop = () => {};
  let id = 0;
  const writes = [];
  const context = { Date, user: { uid: 'test-only' }, aiRequestRef: { current: false }, activeNote: {}, sources: [], notebookStudentContext: '', notebookLanguage: 'en-US', messages: [],
    setMessages(update) { context.messages = update(context.messages); }, setIsAiLoading(value) { context.loading = value; }, setAiError(value) { context.error = value; },
    setLastAiPrompt: noop, setStatus: noop, debugNotebookMetricsWrite: noop, setCloudSyncBlocked: noop, makeSyncId: () => `test-${++id}`, getAppErrorMessage: error => error.message,
    t: key => key === 'notebook.engineFailed' ? 'Notebook engine failed. Please retry.' : key,
    writeDocWithQueue: async request => { writes.push(request); return 'synced'; }, trackUserEvent: async () => {}, buildNotebookContext: () => '', askNotebook: async () => 'Source-grounded answer' };
  const send = handler('src/pages/Notes.tsx', 'runNotebookAi', context);
  await send('  '); assert.equal(writes.length, 0);
  let fail;
  context.askNotebook = () => new Promise((_, reject) => { fail = reject; });
  const pending = send('Test question'); await send('Duplicate');
  assert.equal(writes.filter(write => write.data.role === 'user').length, 1);
  fail(new Error('Service unavailable')); await pending;
  assert.equal(context.error, 'Service unavailable'); assert.equal(context.loading, false);
  context.askNotebook = async () => 'Source-grounded answer';
  await send('Test question', false);
  assert.equal(writes.filter(write => write.data.role === 'user').length, 1);
  assert.equal(context.messages.at(-1).content, 'Source-grounded answer');
  assert.equal(context.messages.at(-1).role, 'assistant');
  context.isLocalAi = true;
  const previousWrites = writes.length;
  await send('Local preview question');
  assert.equal(writes.length, previousWrites);
  assert.equal(context.messages.at(-1).content, 'Source-grounded answer');
});
