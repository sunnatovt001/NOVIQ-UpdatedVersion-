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

test('generated quiz choices cannot duplicate each other after whitespace/case normalization', () => {
  const quiz = { title: 'Quiz', instructions: 'Choose an answer.', questions: [{ prompt: 'Choose one.', options: ['First', 'Second', 'Third'], answerIndex: 0 }] };
  assert.doesNotThrow(() => plannerActivity.validateActivityResponse('quiz', quiz));
  for (const options of [['First', 'First', 'Third'], ['First', ' first ', 'Third'], ['First', '   ', 'Third']]) {
    assert.throws(() => plannerActivity.validateActivityResponse('quiz', { ...quiz, questions: [{ ...quiz.questions[0], options }] }), /incomplete activity/);
  }
});

test('Planner timer formatting rejects invalid values and uses whole seconds', () => {
  const { formatTimer } = load('src/features/planner/plannerTimer.ts');
  for (const value of [NaN, Infinity, -Infinity, -1]) assert.equal(formatTimer(value), '00:00');
  for (const [value, expected] of [[0, '00:00'], [1.9, '00:01'], [59.9, '00:59'], [60, '01:00'], [3601, '60:01']]) assert.equal(formatTimer(value), expected);
});

test('Planner engine computes current-day state without importing persistence services', () => {
  const source = fs.readFileSync('src/features/planner/plannerEngine.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  assert.doesNotMatch(compiled, /require\(["'](?:firebase\/|@\/src\/lib\/progress["'])/);
  const math = load('src/lib/progressMath.ts');
  const engine = load('src/features/planner/plannerEngine.ts', {
    '@/src/lib/progressMath': math,
    '@/src/features/planner/plannerConfig': load('src/features/planner/plannerConfig.ts'),
  });
  const state = engine.buildInitialPlannerState();
  assert.equal(state.missionDate, math.getLocalDayKey());
  assert.equal(state.daily.dateKey, state.missionDate);
  assert.equal(state.tasks.length, 0);
  assert.equal(engine.normalizePlannerState(state).missionDate, state.missionDate);
  for (const value of [NaN, Infinity, -Infinity, -12]) {
    const progress = { ...engine.createProgress(), elapsedSeconds: value };
    assert.equal(engine.normalizeTaskProgress(progress).elapsedSeconds, 0);
    const validation = engine.getValidation({ minutes: 1 }, { type: 'timed' }, progress);
    assert.equal(validation.ok, false);
    assert.ok(validation.reasons.includes('Study timer needs 1 more min.'));
  }
  assert.equal(engine.normalizeTaskProgress({ elapsedSeconds: 1.9 }).elapsedSeconds, 1);
  const task = { minutes: 1 };
  const activity = { type: 'quiz', questions: [{ id: 'q', options: ['A', 'B'], answerIndex: 0, weaknessTag: 'reading' }] };
  for (const answer of [undefined, NaN, Infinity, -1, 2, 0.5, '0']) {
    const progress = { ...engine.createProgress(), elapsedSeconds: 60, submitted: true, quizAnswers: { q: answer } };
    const validation = engine.getValidation(task, activity, progress);
    assert.equal(validation.ok, false);
    assert.ok(validation.reasons.includes('Answer every quiz question.'));
  }
  for (const answer of [0, 1]) {
    const progress = { ...engine.createProgress(), elapsedSeconds: 60, submitted: true, quizAnswers: { q: answer } };
    const validation = engine.getValidation(task, activity, progress);
    assert.equal(validation.ok, true);
    assert.equal(validation.score, answer === 0 ? 100 : 0);
  }
});

test('Planner activity errors retain actionable categories without exposing diagnostics', () => {
  const { getPlannerActivityError } = load('src/features/planner/plannerActivityErrors.ts');
  const secret = 'private-provider-secret';
  for (const locale of ['en', 'uz', 'ru']) {
    const outputs = ['functions/unauthenticated', 'functions/resource-exhausted', 'functions/deadline-exceeded', 'invalid', 'unknown'].map(code => getPlannerActivityError({ code, message: secret }, locale));
    assert.equal(new Set(outputs).size, 5);
    for (const message of outputs) { assert.ok(message.length > 10); assert.ok(!message.includes(secret)); }
    if (locale !== 'en') assert.notEqual(outputs[0], getPlannerActivityError({ code: 'functions/unauthenticated' }, 'en'));
    assert.equal(getPlannerActivityError(new Error('Sign in before using AI.'), locale), outputs[0]);
    assert.equal(getPlannerActivityError(new Error('AI_DAILY_LIMIT'), locale), outputs[1]);
    assert.equal(getPlannerActivityError(new Error('Request timed out'), locale), outputs[2]);
    assert.equal(getPlannerActivityError(new Error('AI_EMPTY_RESPONSE'), locale), outputs[3]);
  }
});

test('Planner input labels are localized and selection controls expose their state', () => {
  const copy = load('src/features/planner/plannerCopy.ts');
  for (const locale of ['en', 'uz', 'ru']) {
    const labels = copy.getPlannerCopy(locale);
    assert.ok(labels.writingAnswer.length > 0);
    assert.ok(labels.speakingNotes.length > 0);
    if (locale !== 'en') {
      assert.notEqual(labels.writingAnswer, copy.getPlannerCopy('en').writingAnswer);
      assert.notEqual(labels.speakingNotes, copy.getPlannerCopy('en').speakingNotes);
    }
  }
  const source = fs.readFileSync('src/pages/Planner.tsx', 'utf8');
  const textActivities = fs.readFileSync('src/features/planner/PlannerTextActivities.tsx', 'utf8');
  for (const id of ['planner-writing-answer', 'planner-speaking-notes']) {
    assert.ok(textActivities.includes(`htmlFor="${id}"`));
    assert.ok(textActivities.includes(`id="${id}"`));
  }
  assert.ok(source.includes('<PlannerQuizActivity'));
  assert.ok(fs.readFileSync('src/features/planner/PlannerQuizActivity.tsx', 'utf8').includes('aria-pressed={selected}'));
  assert.ok(source.includes('<PlannerFlashcardActivity'));
  assert.ok(fs.readFileSync('src/features/planner/PlannerFlashcardActivity.tsx', 'utf8').includes('aria-pressed={reviewed}'));
});

test('pure progress math has no runtime service imports and preserves level, streak and award calculations', () => {
  const source=fs.readFileSync('src/lib/progressMath.ts','utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  assert.doesNotMatch(compiled,/require\(/);
  const math=load('src/lib/progressMath.ts');
  for(const [xp,level] of [[-5,1],[0,1],[100,2],[250,3],[500,4],[1000,5],[5000,10]])assert.equal(math.calculateLevel(xp),level);
  assert.equal(math.createInitialXpState().xp,0);
  const now=new Date('2026-10-10T12:00:00Z');
  assert.equal(math.getNextStreak(3,'2026-10-09T12:00:00Z',now),4);
  assert.equal(math.getNextStreak(3,'2026-10-10T10:00:00Z',now),3);
  assert.equal(math.getCurrentStreak(3,'2026-10-08T12:00:00Z',now),0);
  const profile={xp:100,xpAwarded:{existing:true}};
  const patch=math.buildXpAwardPatch(profile,[{key:'existing',xp:50},{key:'new',xp:20}]);
  assert.equal(patch.xp,120);assert.equal(profile.xp,100);assert.equal(profile.xpAwarded.new,undefined);
  assert.equal(math.buildXpAwardPatch(patch,[{key:'new',xp:20}]).xp,120);
});

test('Planner recovery shows saved guidance only in its recorded language', () => {
  const copy = load('src/features/planner/plannerCopy.ts');
  const {getRecoveryGuidance} = load('src/features/planner/recoveryGuidance.ts', {'./plannerCopy':copy});
  for (const locale of ['en','uz','ru']) {
    const recovery = {active:true,message:'Personalized guidance',messageLocale:locale};
    assert.equal(getRecoveryGuidance(recovery,locale),'Personalized guidance');
    for (const other of ['en','uz','ru'].filter(value => value !== locale)) assert.equal(getRecoveryGuidance(recovery,other),copy.getPlannerCopy(other).recoveryGuidance);
    assert.equal(getRecoveryGuidance({...recovery,messageLocale:undefined},locale),copy.getPlannerCopy(locale).recoveryGuidance);
    assert.equal(getRecoveryGuidance({...recovery,message:' '},locale),copy.getPlannerCopy(locale).recoveryGuidance);
  }
});

test('account recovery preserves error categories and localizes without raw diagnostics', () => {
  const errors = load('src/features/auth/accountErrors.ts');
  for (const [code, expected] of [['permission-denied','permission'], ['storage/unauthorized','upload'], ['unavailable','network'], ['deadline-exceeded','timeout']]) {
    assert.equal(errors.getAccountErrorCode({code}), expected);
  }
  for (const locale of ['en','uz','ru']) {
    for (const code of ['permission','upload','network','timeout','unknown']) assert.ok(errors.getAccountErrorMessage(code,locale));
    assert.equal(errors.getAccountErrorMessage('secret-diagnostic',locale),errors.getAccountErrorMessage('unknown',locale));
  }
});

test('all six Landing features include translated titles and descriptions', () => {
  const {getLandingFeatures} = load('src/features/auth/landingFeatures.ts');
  for (const locale of ['en', 'uz', 'ru']) {
    const features = getLandingFeatures(locale);
    assert.equal(features.length, 6);
    for (const feature of features) {
      assert.ok(feature.title.trim());
      assert.ok(feature.description.trim());
    }
  }
  assert.equal(getLandingFeatures('uz')[0].title, 'Imtihon rejasi');
  assert.equal(getLandingFeatures('ru')[0].title, 'План подготовки');
});

test('authentication errors are localized and never expose provider internals', () => {
  const auth = load('src/features/auth/authCopy.ts');
  for (const locale of ['en', 'uz', 'ru']) {
    const copy = auth.getAuthCopy(locale);
    assert.equal(auth.getAuthErrorMessage({code:'auth/wrong-password'}, locale), copy.credentials);
    assert.equal(auth.getAuthErrorMessage({code:'auth/operation-not-allowed'}, locale), copy.unavailable);
    assert.equal(auth.getAuthErrorMessage(new Error('secret-token'), locale), copy.failed);
    assert.equal(auth.getAuthErrorMessage({code:'auth/network-request-failed'}, locale), copy.network);
  }
});

test('onboarding translates all options without changing persisted profile values', () => {
  const copy = load('src/features/onboarding/onboardingCopy.ts');
  const english = copy.getOnboardingCopy('en');
  for (const locale of ['en', 'uz', 'ru']) {
    const localized = copy.getOnboardingCopy(locale);
    assert.equal(localized.titles.length, 3);
    for (let question = 0; question < 3; question++) {
      assert.equal(localized.options[question].length, english.options[question].length);
      english.options[question].forEach((value, index) => {
        assert.equal(copy.onboardingOptionValue(question, index), value);
        assert.equal(copy.onboardingOptionLabel(locale, question, value), localized.options[question][index]);
      });
    }
  }
});

test('malformed AI activities cannot silently acquire template questions or prompts', () => {
  const base = { title: 'Activity', instructions: 'Read and answer.' };
  for (const kind of ['quiz', 'flashcards', 'speaking', 'writing']) assert.throws(() => plannerActivity.validateActivityResponse(kind, base), /incomplete activity/);
  assert.throws(() => plannerActivity.validateActivityResponse('quiz', { ...base, questions: [{ prompt: 42 }] }), /incomplete activity/);
  assert.doesNotThrow(() => plannerActivity.validateActivityResponse('speaking', { ...base, speakingPrompt: 'Explain the concept.' }));
});

function handler(path, name, context) {
  context.sourceRequestRef ??= { current: false };
  context.withSingleSourceRequest ??= load('src/features/notebook/sourceBatch.ts').withSingleSourceRequest;
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

test('Planner recovery deduplicates requests and rejects stale, replaced or empty AI guidance', async () => {
  for (const scenario of ['current','new-plan','new-recovery','left-page','empty']) {
    let resolve;
    let requests = 0;
    const initial = {form:{goal:'IELTS'},weaknesses:[],tasks:[{id:'task'}],daily:{missedDays:0},lastPlanKey:'initial'};
    const context = {
      plannerState:initial, state:initial, locale:'uz',plannerLanguage:'uz-UZ',pc:{recoveryGuidance:'Localized fallback'},weakest:{name:'Writing'},
      recoveryRequestRef:{current:false},recoveryGenerationRef:{current:1},
      setSettingsOpen(){},setTimerRunning(){},setValidationMessage(){},
      setPlannerState(update){context.state=update(context.state);},
      buildSections:()=>[],buildTodayMission:()=>[{id:'new-task'}],createProgress:()=>({status:'pending'}),buildPlanKey:()=> 'recovery-plan',
      askTutor(){requests++;return new Promise(done=>{resolve=done;});},console,
    };
    const activate = handler('src/pages/Planner.tsx','activateRecoveryMode',context);
    const pending = activate();
    await activate();
    assert.equal(requests,1);
    if (scenario === 'new-plan') context.state={...context.state,lastPlanKey:'replacement'};
    if (scenario === 'new-recovery') context.state={...context.state,recoveryMode:{...context.state.recoveryMode,adjustedAt:'replacement'}};
    if (scenario === 'left-page') context.recoveryGenerationRef.current++;
    resolve(scenario === 'empty' ? ' ' : 'Personalized advice');
    await pending;
    assert.equal(context.state.recoveryMode.message,scenario === 'current' ? 'Personalized advice' : 'Localized fallback');
    if (scenario !== 'left-page') assert.equal(context.recoveryRequestRef.current,false);
  }
});

test('Planner weak-area validation stores a translated-copy key rather than English UI text', () => {
  const { getPlannerCopy } = load('src/features/planner/plannerCopy.ts');
  for (const valid of [false, true]) {
    let key, opened = false, focused = false;
    const validate = handler('src/pages/Planner.tsx', 'validateWeakAreas', {
      hasRequiredWeakTopics: () => valid,
      setPlanValidationMessage: value => { key = value; },
      setSettingsOpen: value => { opened = value; },
      focusWeakAreasInput: () => { focused = true; },
    });
    assert.equal(validate({ weakTopics: '' }), valid);
    assert.equal(key, valid ? '' : 'weakAreasRequired');
    assert.equal(opened, !valid);
    assert.equal(focused, !valid);
  }
  for (const locale of ['uz', 'ru']) assert.notEqual(getPlannerCopy(locale).weakAreasRequired, getPlannerCopy('en').weakAreasRequired);
});

test('Planner recommendation scope changes when prompt evidence changes', () => {
  const source = fs.readFileSync('src/pages/Planner.tsx', 'utf8');
  const expression = source.match(/const recommendationScope = (JSON\.stringify\([^;]+\));/)[1];
  const context = {
    user: {uid:'student'}, locale:'en',
    plannerState: {missionDate:'2026-10-10', lastPlanKey:'plan', form:{goal:'IELTS'}},
    weaknessDashboard: [{section:'writing', gap:2}],
    missionEvidence: {percent:0, total:3, completed:0},
  };
  const scope = () => vm.runInNewContext(expression, context);
  const initial = scope();
  assert.equal(scope(), initial);
  context.missionEvidence = {percent:33, total:3, completed:1};
  const completed = scope();
  assert.notEqual(completed, initial);
  context.weaknessDashboard = [{section:'writing', gap:1}];
  assert.notEqual(scope(), completed);
});

test('Planner completion save and sync guidance is translated and distinguishes outcomes', () => {
  const {getPlannerCopy}=load('src/features/planner/plannerCopy.ts');
  for(const locale of ['en','uz','ru']) {
    const copy=getPlannerCopy(locale);
    assert.ok(copy.taskSaveFailed.length>30);
    assert.ok(copy.eventSyncFailed.length>30);
    assert.notEqual(copy.taskSaveFailed,copy.eventSyncFailed);
    assert.doesNotMatch(copy.taskSaveFailed+copy.eventSyncFailed,/Firebase|permission-denied|unavailable|stack/i);
    if(locale!=='en')assert.notEqual(copy.taskSaveFailed,getPlannerCopy('en').taskSaveFailed);
  }
});

test('Planner completion rejects failed or stale server replies without progress or celebration', async () => {
  for (const scenario of ['failed','changed-plan','left-page']) {
    let resolve, reject, calls=0;
    const mutations=[];
    const context={
      completingTaskRef:{current:false},completionGenerationRef:{current:1},completionScope:'plan-A',completionScopeRef:{current:'plan-A'},
      activeTask:{id:'task',section:'writing',kind:'writing'},activeActivity:{},activeProgress:{status:'in_progress',elapsedSeconds:120},
      user:{uid:'student'},profile:{},studyReceiptsRef:{current:{task:'proof'}},
      pc:{taskSaveFailed:'Localized save failure'},
      getValidation:()=>({ok:true}),setCompletingTask(){},setValidationMessage(value){context.message=value;},
      setPlannerState(){mutations.push('progress');},setCelebration(){mutations.push('celebration');},
      persistStudySession(){calls++;return new Promise((done,fail)=>{resolve=done;reject=fail;});},
    };
    const complete=handler('src/pages/Planner.tsx','completeTask',context);
    const pending=complete();await complete();assert.equal(calls,1);
    if(scenario==='changed-plan')context.completionScopeRef.current='plan-B';
    if(scenario==='left-page')context.completionGenerationRef.current++;
    if(scenario==='failed')reject(new Error('Server unavailable'));else resolve();
    await pending;
    assert.deepEqual(mutations,[]);
    assert.equal(context.message?.copy,scenario==='failed'?'taskSaveFailed':undefined);
    if(scenario==='failed')assert.equal(context.completingTaskRef.current,false);
  }
});

test('Planner validation translates all nine requirement messages without changing quantities', () => {
  const {localizePlannerValidation}=load('src/features/planner/plannerValidationCopy.ts');
  const messages=['Open the generated activity first.','Answer every quiz question.','Submit the quiz first.','Submit the writing task.','Add short notes after speaking.','Finish the speaking exercise.','Review every flashcard.','Study timer needs 3 more min.','Write at least 90 words.'];
  for(const reason of messages){
    assert.equal(localizePlannerValidation(reason,'en'),reason);
    for(const locale of ['uz','ru'])assert.notEqual(localizePlannerValidation(reason,locale),reason);
  }
  for(const number of [0,1,999])for(const locale of ['en','uz','ru']){
    assert.ok(localizePlannerValidation(`Study timer needs ${number} more min.`,locale).includes(String(number)));
    assert.ok(localizePlannerValidation(`Write at least ${number} words.`,locale).includes(String(number)));
  }
  assert.equal(localizePlannerValidation('Future requirement','uz'),'Future requirement');
  for(const locale of ['en','uz','ru']) {
    const evidence={ok:false,reasons:messages,mistakes:['Writing depth'],score:0};
    const validate=handler('src/pages/Planner.tsx','getValidation',{
      locale,localizePlannerValidation,validatePlannerActivity:()=>evidence,
    });
    const result=validate();
    assert.equal(result.ok,evidence.ok);assert.equal(result.score,0);
    assert.equal(result.mistakes,evidence.mistakes);
    assert.deepEqual(Array.from(result.reasons),messages);
    assert.equal(evidence.reasons,messages);
  }
});

test('Planner quiz submission uses localized guidance and preserves zero scores', () => {
  const {getPlannerCopy}=load('src/features/planner/plannerCopy.ts');
  for(const locale of ['en','uz','ru'])for(const score of [undefined,0,90]){
    let patch, message;
    const copy=getPlannerCopy(locale);
    const context={activeTask:{id:'quiz'},activeActivity:{},activeProgress:{status:'in_progress'},pc:copy,
      getValidation:(task,activity,progress)=>{assert.equal(progress.submitted,true);return {score,mistakes:[]};},
      updateProgress:(id,value)=>{assert.equal(id,'quiz');patch=value;},setValidationMessage:value=>{message=value;},
      formatCopy:(template,values)=>template.replace('{score}',String(values.score)),
    };
    handler('src/pages/Planner.tsx','submitQuiz',context)();
    assert.equal(patch.submitted,true);assert.equal(patch.score,score);
    assert.equal(message.copy,score===undefined?'quizSubmitted':'quizSubmittedScore');
    if(score!==undefined)assert.equal(message.values.score,score);
  }
});

test('Planner successful completion commits once and distinguishes task from whole mission', async () => {
  for(const wholeMission of [false,true]) {
    let calls=0, resolve, celebrations=0;
    const task={id:'task',section:'writing',kind:'writing',label:'Writing',minutes:10,xp:30};
    const context={
      completingTaskRef:{current:false},completionGenerationRef:{current:1},completionScope:'plan-A',completionScopeRef:{current:'plan-A'},
      activeTask:task,activeActivity:{},activeProgress:{status:'in_progress',elapsedSeconds:600},
      plannerState:{form:{},tasks:wholeMission?[task]:[task,{...task,id:'next'}],taskProgress:{},weaknesses:[],history:[],localXp:0,daily:{xpEarned:0,minutesStudied:0,missionCompleted:false,dailyStreak:2,reflection:null}},
      user:{uid:'student'},profile:{},studyReceiptsRef:{current:{task:'proof'}},locale:'en',
      pc:{dailyMissionCompleted:'Mission complete',dailyMissionSubtitle:'Mission saved',greatJob:'Task complete',taskCompletedSubtitle:'{task} saved'},
      getValidation:()=>({ok:true,score:90,mistakes:[]}),getLocalDayKey:()=> '2026-10-10',
      buildSections:()=>[],buildReflection:()=>({recommendation:'Reflection'}),calculateNewAchievements:()=>[],
      formatCopy:(template,values)=>template.replace('{task}',values.task),localizePlannerTaskLabel:()=> 'Writing',
      setCompletingTask(){},setValidationMessage(value){context.message=value;},setTimerRunning(){},setView(value){context.view=value;},setRecommendation(){},
      setPlannerState(value){context.plannerState=value;context.activeProgress=value.taskProgress.task;},
      setCelebration(value){celebrations++;context.celebration=value;},
      persistStudySession(payload,profile,records,proof){assert.equal(payload.xpEarned,0);assert.equal(proof,'proof');calls++;return new Promise(done=>{resolve=done;});},
      trackUserEvent:()=>Promise.resolve(),console,
    };
    const complete=handler('src/pages/Planner.tsx','completeTask',context);
    const pending=complete();await complete();assert.equal(calls,1);
    assert.equal(context.plannerState.history.length,0);assert.equal(celebrations,0);
    resolve();await pending;
    assert.equal(context.plannerState.history.length,1);
    assert.equal(context.plannerState.localXp,30);
    assert.equal(context.plannerState.daily.xpEarned,30);
    assert.equal(context.plannerState.daily.minutesStudied,10);
    assert.equal(context.plannerState.daily.missionCompleted,wholeMission);
    assert.equal(context.plannerState.daily.dailyStreak,wholeMission?3:2);
    assert.equal(context.celebration.type,wholeMission?'mission':'task');
    assert.equal(context.view,'today');
    await complete();assert.equal(calls,1);assert.equal(celebrations,1);assert.equal(context.plannerState.history.length,1);
  }
});

test('Planner recommendations are scoped, deduplicated and retry failed or empty replies', async () => {
  for (const scenario of ['current','changed-scope','left-page','empty','failed']) {
    let resolve, reject, calls=0;
    const context = {
      recommendation:'',recommendationScope:'scope-A',recommendationScopeRef:{current:'scope-A'},recommendationRequestRef:{current:null},recommendationCacheRef:{current:''},recommendationGenerationRef:{current:1},
      hasPlannerActivity:true,plannerLanguage:'uz-UZ',plannerState:{form:{goal:'IELTS',currentScore:'5',targetScore:'7',examDate:'2026-12-01'}},weaknessDashboard:[],missionEvidence:{},daysUntil:()=>30,t:key=>key,
      setRecommendationsOpen(){},setRecommendation(value){context.recommendation=value;},setRecommendationLoading(){},setRecommendationFailed(value){context.failed=value;},console:{warn(){}},
      askTutor(){calls++;return new Promise((done,fail)=>{resolve=done;reject=fail;});},
    };
    const open = handler('src/pages/Planner.tsx','openRecommendations',context);
    const pending=open();await open();assert.equal(calls,1);
    if (scenario==='changed-scope') context.recommendationScopeRef.current='scope-B';
    if (scenario==='left-page') context.recommendationGenerationRef.current++;
    if (scenario==='failed') reject(new Error('Unavailable')); else resolve(scenario==='empty'?' ':'Advice');
    await pending;
    assert.equal(context.recommendation,scenario==='current'?'Advice':scenario==='empty'||scenario==='failed'?'planner.recommendationUnavailable':'');
    if (scenario==='current') {await open();assert.equal(calls,1);}
    if (scenario==='empty'||scenario==='failed') {const retry=open();assert.equal(calls,2);resolve('Retry advice');await retry;assert.equal(context.recommendation,'Retry advice');}
  }
});

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
  context.activityDay=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
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

// Flashcards v2 replaces the monolithic handlers with validated content and an idempotent attempt engine.
const flashcardsModel = load('src/features/flashcards/model.ts');
test('card normalization preserves legacy review metadata and rejects blank content', () => {
  const original={front:'Original',back:'Answer',dueAt:'2026-10-12',interval:8,easeFactor:2.8,repetition:4,lapses:1,reviewCount:9};
  const card=flashcardsModel.normalizeCard(original,'c1','d1');
  for(const field of ['dueAt','interval','easeFactor','repetition','lapses','reviewCount']) assert.equal(card[field],original[field]);
  assert.equal(flashcardsModel.cardValid({...card,front:' '}),false);
  const review=flashcardsModel.normalizeReview(undefined,card);
  assert.equal(review.reviewCount,9);assert.equal(review.interval,8);
});
test('one deck-review action cannot append duplicate attempts or award fabricated XP', () => {
  const session={id:'s',deckId:'d',mode:'type',cardIds:['c','next'],index:0,attempts:[],startedAt:'2026-10-14',activeSeconds:0,completed:false};
  const attempt={cardId:'c',mode:'type',answer:'Saved answer',correct:true,hints:0,rating:'good',at:'2026-10-14',revision:1};
  const next=flashcardsModel.appendAttempt(session,attempt,12);
  assert.equal(next.attempts.length,1);assert.equal(next.index,1);assert.equal(next.activeSeconds,12);
  assert.equal(flashcardsModel.appendAttempt(next,attempt,20),null);
  assert.equal(flashcardsModel.appendAttempt(next,{...attempt,cardId:'foreign'},20),null);
  assert.equal(next.xp,undefined);
});

function plannerContext() {
  const context = { plannerState: { activities: { saved: { title: 'Saved' } }, taskProgress: { saved: { status: 'notStarted', elapsedSeconds: 0 } } }, openingTaskRef: { current: false }, setTimerRunning() {}, setValidationMessage() {}, setActiveTaskId() {}, setView() {}, setActivityError(value) { context.error = value; }, setGeneratingTaskId(value) { context.loading = value; }, generateActivity: async () => ({ title: 'Generated' }), setPlannerState(update) { context.plannerState = update(context.plannerState); } };
  return Object.assign(context, { completionGenerationRef: { current: 1 }, completionScope: 'plan', completionScopeRef: { current: 'plan' } });
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
  context.locale = 'en';
  context.classifyPlannerActivityError = load('src/features/planner/plannerActivityErrors.ts').classifyPlannerActivityError;
  let reject;
  let calls = 0;
  context.generateActivity = () => { calls++; return new Promise((_, fail) => { reject = fail; }); };
  const open = handler('src/pages/Planner.tsx', 'openActivity', context);
  const first = open({ id: 'new' });
  await open({ id: 'new' });
  assert.equal(calls, 1);
  reject(new Error('AI unavailable')); await first;
  assert.equal(context.error, context.classifyPlannerActivityError(new Error('AI unavailable')));
  assert.equal(context.loading, null);
  assert.equal(context.plannerState.activities.new, undefined);
  assert.equal(context.plannerState.taskProgress.new, undefined);
  context.generateActivity = async () => ({ title: 'Retry result' });
  await open({ id: 'new' });
  assert.equal(context.plannerState.activities.new.title, 'Retry result');
  assert.equal(context.plannerState.taskProgress.new, undefined);
});
test('obsolete Planner activity replies cannot install content or clear newer loading state', async () => {
  for (const outcome of ['success', 'failure']) {
    const context = plannerContext();
    let resolve, reject;
    context.generateActivity = () => new Promise((yes, no) => { resolve = yes; reject = no; });
    const open = handler('src/pages/Planner.tsx', 'openActivity', context);
    const pending = open({ id: 'old' });
    context.completionGenerationRef.current++;
    context.loading = 'new-task'; context.openingTaskRef.current = true;
    if (outcome === 'success') resolve({ title: 'Old activity' });
    else reject(new Error('Old failure'));
    await pending;
    assert.equal(context.plannerState.activities.old, undefined);
    assert.equal(context.error, '');
    assert.equal(context.loading, 'new-task');
    assert.equal(context.openingTaskRef.current, true);
  }
});

test('Planner starts only after server proof, rejects a failed start and ignores a late result after leaving', async () => {
  const timerScope = { completionGenerationRef: { current: 1 }, completionScope: 'current', completionScopeRef: { current: 'current' }, pc: { timerStartFailed: 'Safe timer error', timerExpired: 'Expired timer' } };
  const context = { timerRunning: false, activeTask: { id: 'task', kind: 'speaking' }, activeActivity: {}, startingTimerRef: { current: false }, plannerState: { taskProgress: {} }, activityViewRef: { current: { taskId: 'task', view: 'activity' } }, studyReceiptsRef: { current: {} }, withDeadline: asyncRequests.withDeadline, setStartingTimer() {}, setValidationMessage() {}, setTimerRunning(value) { context.timerRunning = value; }, updateProgress(id, patch) { context.patch = patch; }, startStudySession: async () => { throw new Error('offline'); } };
  Object.assign(context, timerScope);
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
  const gemini = load('src/lib/gemini.ts', { '@/src/lib/callable': { httpsCallable: () => () => {} } });
  assert.match(gemini.getFriendlyAiError({ code: 'functions/unauthenticated' }), /Sign in/);
  assert.match(gemini.getFriendlyAiError({ code: 'functions/deadline-exceeded' }), /timed out/);
  assert.match(gemini.getFriendlyAiError({ message: 'AI_DAILY_LIMIT' }), /daily AI allowance/);
  assert.match(gemini.getFriendlyAiError({ message: 'AI_EMPTY_RESPONSE' }), /empty response/);
});

test('Tutor context treats interface language as fallback and preserves evidence and material names', () => {
  const { buildTutorRequestContext } = load('src/features/tutor/tutorRequest.ts');
  for (const [language, expected] of [['en-US', 'English'], ['uz-UZ', 'Uzbek'], ['ru-RU', 'Russian']]) {
    const context = buildTutorRequestContext(language, 'Goal: IELTS 7; weak area: listening', [{ name: 'chapter.pdf' }, { name: 'notes.docx' }]);
    assert.ok(context.startsWith(`Interface language: ${language}.`));
    assert.ok(context.includes("Match the language of the latest student question"));
    assert.ok(context.includes('Goal: IELTS 7; weak area: listening'));
    assert.ok(context.includes('chapter.pdf, notes.docx'));
    assert.ok(context.includes('Use these materials first'));
  }
  assert.ok(buildTutorRequestContext('en-US', '', []).includes('not the interface or uploaded materials'));
});

test('shared AI errors classify failures and localize without exposing diagnostics', () => {
  const { classifyAiFailure, getAiFailureMessage } = load('src/lib/aiFailure.ts');
  const secret = 'private-provider-request-secret';
  for (const [code, kind] of [['functions/unauthenticated', 'auth'], ['functions/resource-exhausted', 'quota'], ['functions/deadline-exceeded', 'timeout'], ['AI_EMPTY_RESPONSE', 'invalid'], ['unavailable', 'unknown']]) {
    assert.equal(classifyAiFailure({ code, message: secret }), kind);
    for (const locale of ['en', 'uz', 'ru']) {
      const message = getAiFailureMessage(kind, locale);
      assert.ok(message.length > 20);
      assert.ok(!message.includes(secret));
      if (locale !== 'en') assert.notEqual(message, getAiFailureMessage(kind, 'en'));
    }
  }
});

test('Tutor renders successful and failed AI responses in isolation and retry does not duplicate the user message', async () => {
  const noop = () => {};
  const context = { proTutorMode:'standard', explanationDepth:'standard',shareProContext:false, Date, user: { uid: 'test-only' }, activePro: true, tutorUsage: 0, tutorLimit: 5, aiRequestRef: { current: false }, voiceLanguage: 'en-US', profile: {}, persistedMessages: [], dayKey: '2026-10-04',
    setUpgradeOpen: noop, setInput: noop, setAttachedFiles: noop, setUploadError: noop, setLastRequest: noop, setTutorUsage: noop, saveLocalDailyUsage: noop, speak: noop,
    buildStudentTutorContext: () => '', buildTutorRequestContext: load('src/features/tutor/tutorRequest.ts').buildTutorRequestContext, trackUserEvent: async () => {}, persistMessage: async () => {}, getAppErrorMessage: error => error.message,
    classifyAiFailure: load('src/lib/aiFailure.ts').classifyAiFailure,
    messages: [], setMessages(update) { context.messages = update(context.messages); }, setAiError(value) { context.error = value; }, setIsTyping(value) { context.loading = value; }, askTutor: async () => 'Mocked answer' };
  context.ownerRef={current:'test-only'};
  context.aiGenerationRef={current:1};
  context.chat={activeId:'test-conversation',add(message){context.messages.push(message);}};
  const send = handler('src/pages/Tutor.tsx', 'submitPrompt', context);
  await send('   ', []); assert.equal(context.messages.length, 0);
  await send('Test question', []); assert.equal(context.messages.at(-1).role, 'assistant'); assert.equal(context.messages.at(-1).content, 'Mocked answer');
  context.askTutor = async () => { throw new Error('Provider unavailable'); };
  await send('Second question', []); assert.equal(context.error.kind, 'unknown'); assert.equal(context.loading, false);
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

test('Tutor rejects obsolete answers/errors and preserves a newer request lock', async () => {
  for (const reason of ['account', 'unmount', 'same-account-generation']) for (const failed of [false, true]) {
    let resolve, reject;
    const noop = () => {};
    const context = { proTutorMode:'standard', explanationDepth:'standard',shareProContext:false, user:{uid:'original'}, ownerRef:{current:'original'}, aiGenerationRef:{current:1}, aiRequestRef:{current:false}, activePro:true,
      profile:{}, persistedMessages:[], voiceLanguage:'en-US', tutorUsage:0, tutorLimit:5,
      setInput:noop,setAttachedFiles:noop,setUploadError:noop,setLastRequest:noop,setTutorUsage:noop,setUpgradeOpen:noop,
      setAiError:value=>{context.error=value;},setIsTyping:value=>{context.loading=value;},
      trackUserEvent:async()=>{},buildStudentTutorContext:()=>'',buildTutorRequestContext:()=>'',classifyAiFailure:()=> 'unknown',speak:()=>{context.spoke=true;},
      messages:[],askTutor:()=>new Promise((yes,no)=>{resolve=yes;reject=no;}) };
    context.chat={activeId:'original-conversation',add:message=>context.messages.push(message)};
    const pending=handler('src/pages/Tutor.tsx','submitPrompt',context)('Original question',[]);
    if(reason==='account')context.ownerRef.current='replacement';else context.aiGenerationRef.current++;
    context.error='newer-feedback';context.loading=true;context.aiRequestRef.current=true;
    if(failed)reject(new Error('stale private diagnostic'));else resolve('Obsolete answer');
    await pending;
    assert.equal(context.messages.length,1);
    assert.equal(context.messages[0].role,'user');
    assert.equal(context.error,'newer-feedback');
    assert.equal(context.loading,true);
    assert.equal(context.aiRequestRef.current,true);
    assert.equal(context.spoke,undefined);
  }
});

test('source request lock blocks parallel actions and releases after success/failure', async () => {
  const { withSingleSourceRequest } = load('src/features/notebook/sourceBatch.ts');
  for (const failed of [false, true]) {
    let resolve, reject, calls = 0;
    const lock = { current: false };
    const first = withSingleSourceRequest(lock, () => { calls++; return new Promise((yes, no) => { resolve = yes; reject = no; }); });
    const other = withSingleSourceRequest(lock, async () => { calls++; });
    const pending = first();
    await other(); assert.equal(calls, 1);
    if (failed) { reject(new Error('fixture failure')); await assert.rejects(pending); }
    else { resolve(); await pending; }
    assert.equal(lock.current, false);
    await other(); assert.equal(calls, 2);
  }
});

test('Notebook upload batches distinguish zero, partial and complete local additions', async () => {
  const { createSourceBatch, highlightNotebookSelection } = load('src/features/notebook/sourceBatch.ts');
  for (const added of [0, 1, 2]) {
    const batch = createSourceBatch(2);
    for (let index = 0; index < added; index++) batch.markAdded();
    assert.equal(batch.messageKey(), added === 0 ? 'notebook.sourceBatchFailed' : added === 1 ? 'notebook.sourceBatchPartial' : 'notebook.sourceBatchAdded');
    assert.equal(batch.values().added, added);
    assert.equal(batch.values().total, 2);
  }
  assert.equal(highlightNotebookSelection('hello world', 0, 5), '==hello== world');
  assert.equal(highlightNotebookSelection('hello', 2, 2), null);
  const context = { user: { uid: 'fixture' }, isReadOnlyAudit: false, profile: {}, XP_KEYS: { firstTextbookUpload: 'first' },
    setStatus: value => { context.status = value; }, setIsSourceLoading: value => { context.loading = value; },
    isTextbookUpload: () => false, MAX_SOURCE_FILE_BYTES: 10, formatBytes: () => '10 bytes', createSourceBatch,
    t: key => key };
  await handler('src/pages/Notes.tsx', 'handleUploadSources', context)([{name:'large.txt',size:11}]);
  assert.equal(context.status, 'notebook.sourceBatchFailed');
  assert.equal(context.loading, false);
});

test('Notebook real upload handler reports mixed file outcomes without false all-success', async () => {
  const { createSourceBatch } = load('src/features/notebook/sourceBatch.ts');
  for (const names of [['good.txt'], ['good.txt', 'bad.txt'], ['bad.txt'], ['large.txt', 'good.txt'], ['storage-failed.txt'], ['storage-failed.txt', 'good.txt']]) {
    const writes = [];
    const context = { Date, console: { warn() {} }, user: { uid: 'fixture' }, profile: {}, isReadOnlyAudit: false,
      XP_KEYS: { firstTextbookUpload: 'first' }, MAX_SOURCE_FILE_BYTES: 10, createSourceBatch,
      isTextbookUpload: () => false, isTextLike: () => true, formatBytes: () => '10 bytes',
      setStatus: value => { context.status = value; }, setIsSourceLoading: value => { context.loading = value; },
      t: (key, values) => ({ key, values }), sources: [], setSources: update => { context.sources = update(context.sources); },
      readAsDataUrl: async file => { if (file.name === 'bad.txt') throw new Error('private read error'); return 'data:text/plain;base64,fixture'; },
      summarizeUploadedSource: async () => 'Fixture digest', makeSyncId: () => `source-${context.sources.length}`,
      ref: () => ({}), storage: {}, uploadBytes: async (_, file) => { if (file.name === 'storage-failed.txt') throw new Error('fixture blob failure'); }, getDownloadURL: async () => 'https://example.invalid/fixture',
      debugNotebookMetricsWrite() {}, writeDocWithQueue: async request => { writes.push(request); return 'synced'; },
      setCloudSyncBlocked(value) { context.cloudBlocked = value; }, getAppErrorMessage: () => 'safe error', trackUserEvent: async () => {}, notebookStudentContext: '', notebookLanguage: 'uz-UZ' };
    const files = names.map(name => ({ name, size: name === 'large.txt' ? 11 : 1, type: 'text/plain', text: async () => 'Fixture source text' }));
    await handler('src/pages/Notes.tsx', 'handleUploadSources', context)(files);
    const added = names.filter(name => name === 'good.txt' || name === 'storage-failed.txt').length;
    assert.equal(context.sources.length, added);
    assert.equal(writes.length, added);
    assert.equal(context.status.key, added === 0 ? 'notebook.sourceBatchFailed' : added < names.length ? 'notebook.sourceBatchPartial' : 'notebook.sourceBatchAdded');
    assert.equal(context.status.values.added, added);
    assert.equal(context.status.values.total, names.length);
    assert.equal(context.loading, false);
    if (names.includes('storage-failed.txt')) {
      assert.equal(context.sources.find(source => source.fileName === 'storage-failed.txt').syncStatus, 'failed');
      assert.equal(context.sources.find(source => source.fileName === 'storage-failed.txt').downloadURL, '');
      assert.ok(context.cloudBlocked || context.sources.some(source => source.syncStatus === 'failed'));
    }
  }
});

test('Notebook website extraction restricts protocols and supplies an abort deadline', async () => {
  let calls = 0, requested, deadline;
  const signal = {};
  const context = { URL, t: (key, values) => `${key}:${values?.status || ''}`,
    AbortSignal: { timeout: ms => { deadline = ms; return signal; } },
    fetch: async (url, options) => { calls++; requested = { url, options }; return { ok: true, text: async () => '<style>hidden</style><script>private()</script><p>Source <b>evidence</b></p>' }; } };
  const extract = handler('src/pages/Notes.tsx', 'fetchWebsiteText', context);
  await assert.rejects(extract('javascript:alert(1)'), /notebook.invalidUrl/);
  assert.equal(calls, 0);
  assert.equal(await extract('https://example.invalid/source'), 'Source evidence');
  assert.equal(deadline, 15000);
  assert.equal(requested.options.signal, signal);
  assert.equal(requested.url, 'https://example.invalid/source');
  context.fetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(extract('https://example.invalid'), /notebook.fetchFailed:403/);
  context.fetch = async () => { throw new Error('aborted fixture'); };
  await assert.rejects(extract('https://example.invalid'), /aborted fixture/);
});

test('Notebook website/transcript import failures expose only localized safe guidance', async () => {
  for (const [name, expected] of [['handleAddUrlSource', 'notebook.websiteFailed'], ['handleAddYoutubeSource', 'notebook.transcriptFailed']]) {
    const context = { user: { uid: 'fixture' }, sourceUrl: 'https://example.invalid', youtubeUrl: '', youtubeTranscript: 'Fixture transcript',
      isReadOnlyAudit: false, notebookStudentContext: '', notebookLanguage: 'uz-UZ',
      setStatus: value => { context.status = value; }, setIsSourceLoading: value => { context.loading = value; },
      t: key => `localized:${key}`, fetchWebsiteText: async () => { throw new Error('private request diagnostic'); },
      askNotebook: async () => { throw new Error('private provider diagnostic'); } };
    await handler('src/pages/Notes.tsx', name, context)();
    assert.equal(context.status, `localized:${expected}`);
    assert.equal(context.loading, false);
    assert.ok(!context.status.includes('private'));
  }
});

test('Notebook source digest preserves selected language, source evidence and attachment contract', async () => {
  const calls = [];
  const { summarizeUploadedSource } = load('src/features/notebook/notebookSourceAnalysis.ts', {
    '@/src/lib/gemini': { askNotebook: async (...args) => { calls.push(args); return 'Source digest'; } },
  });
  const attachment = { name: 'chapter.txt', mimeType: 'text/plain', data: 'fixture-only' };
  for (const language of ['en-US', 'uz-UZ', 'ru-RU']) for (const text of ['', 'Source evidence', 'x'.repeat(19000)]) {
    assert.equal(await summarizeUploadedSource({ name: 'chapter.txt' }, attachment, text, 'Student goal: exam', language), 'Source digest');
    const [prompt, context, selectedLanguage, options] = calls.at(-1);
    assert.ok(prompt.includes('source'));
    assert.ok(context.includes('Student goal: exam'));
    assert.ok(context.includes('Uploaded source: chapter.txt'));
    assert.ok(context.includes('highest source priority'));
    assert.equal(selectedLanguage, language);
    assert.equal(options.attachments[0], attachment);
    assert.equal(options.retries, 2);
    if (!text) assert.ok(context.includes('attached as inline data'));
    else assert.ok(context.includes(text.slice(0, 18000)));
    assert.ok(!context.includes('x'.repeat(18001)));
  }
  assert.match(fs.readFileSync('src/pages/Notes.tsx', 'utf8'), /summarizeUploadedSource\(file, attachment, extractedText, notebookStudentContext, notebookLanguage\)/);
  const source = fs.readFileSync('src/pages/Notes.tsx', 'utf8');
  assert.equal((source.match(/"en-US"/g) || []).length, 1, 'Only the default locale mapping may use a fixed English language');
});

test('Notebook AI scope invalidates outstanding requests on owner change and cleanup', () => {
  const refs = []; let index = 0, effect, resetCount = 0;
  const { useNotebookAiScope } = load('src/features/notebook/useNotebookAiScope.ts', {
    react: { useRef: value => refs[index++] || (refs[index - 1] = { current: value }), useEffect: callback => { effect = callback; } },
  });
  const first = useNotebookAiScope('first', () => { resetCount++; });
  const cleanup = effect();
  assert.equal(first.aiGenerationRef.current, 1);
  first.aiRequestRef.current = true;
  index = 0;
  const next = useNotebookAiScope('second', () => { resetCount++; });
  assert.equal(next.aiOwnerRef.current, 'second');
  cleanup();
  assert.equal(next.aiGenerationRef.current, 2);
  const nextCleanup = effect();
  assert.equal(next.aiGenerationRef.current, 3);
  assert.equal(next.aiRequestRef.current, false);
  assert.equal(resetCount, 2);
  nextCleanup();
  assert.equal(next.aiGenerationRef.current, 4);
});

test('Notebook late AI replies cannot cross account generations or unlock a newer request', async () => {
  for (const reason of ['changed-account', 'left-page', 'same-account-new-generation']) for (const fails of [false, true]) {
    let resolve, reject;
    const writes = [];
    const noop = () => {};
    const context = { Date, user: { uid: 'original' }, aiGenerationRef: { current: 1 }, aiOwnerRef: { current: 'original' }, aiRequestRef: { current: false },
      activeNote: {}, sources: [], notebookStudentContext: '', notebookLanguage: 'en-US', messages: [], isLocalAi: false,
      setMessages(update) { context.messages = update(context.messages); }, setIsAiLoading(value) { context.loading = value; }, setAiError(value) { context.error = value; },
      setLastAiPrompt: noop, setStatus: noop, debugNotebookMetricsWrite: noop, setCloudSyncBlocked: noop, makeSyncId: () => 'fixture',
      getAppErrorMessage: error => error.message, classifyAiFailure: load('src/lib/aiFailure.ts').classifyAiFailure,
      writeDocWithQueue: async request => { writes.push(request); return 'synced'; }, trackUserEvent: async () => {}, buildNotebookContext: () => '',
      askNotebook: () => new Promise((yes, no) => { resolve = yes; reject = no; }) };
    const send = handler('src/pages/Notes.tsx', 'runNotebookAi', context);
    const pending = send('Original question');
    await Promise.resolve();
    if (reason === 'changed-account') context.aiOwnerRef.current = 'replacement';
    else context.aiGenerationRef.current++;
    context.aiRequestRef.current = true;
    context.loading = true;
    context.error = 'newer-feedback';
    if (fails) reject(new Error('private stale failure')); else resolve('Stale answer');
    await pending;
    assert.equal(context.messages.length, 1);
    assert.equal(context.messages[0].role, 'user');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.role, 'user');
    assert.equal(context.error, 'newer-feedback');
    assert.equal(context.loading, true);
    assert.equal(context.aiRequestRef.current, true);
  }
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
  context.classifyAiFailure = load('src/lib/aiFailure.ts').classifyAiFailure;
  context.aiGenerationRef = { current: 1 };
  context.aiOwnerRef = { current: context.user.uid };
  const send = handler('src/pages/Notes.tsx', 'runNotebookAi', context);
  await send('  '); assert.equal(writes.length, 0);
  let fail;
  context.askNotebook = () => new Promise((_, reject) => { fail = reject; });
  const pending = send('Test question'); await send('Duplicate');
  assert.equal(writes.filter(write => write.data.role === 'user').length, 1);
  fail(new Error('Service unavailable')); await pending;
  assert.equal(context.error, 'unknown'); assert.equal(context.loading, false);
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
