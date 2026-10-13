const { chromium } = require('playwright');
const assert = require('node:assert/strict');
async function switchFeedbackLanguages(page, feedback) {
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  for (const [currentLabel, nextLocale] of [['Language', 'uz'], ['Til', 'ru'], ['Язык', 'en']]) {
    await page.getByRole('combobox', { name: currentLabel, exact: true }).selectOption(nextLocale);
    const message = await page.evaluate(async ({ locale, feedback }) => {
      const { getPlannerCopy, formatPlannerText } = await import('/src/features/planner/plannerCopy.ts');
      const { localizePlannerValidation } = await import('/src/features/planner/plannerValidationCopy.ts');
      return feedback.requirement ? localizePlannerValidation(feedback.requirement, locale)
        : formatPlannerText(getPlannerCopy(locale)[feedback.copy], feedback.values || {});
    }, { locale: nextLocale, feedback });
    await page.getByText(message, { exact: true }).waitFor();
  }
  await page.locator('aside').getByRole('button', { name: 'Close menu', exact: true }).click();
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const theme of ['light', 'dark']) for (const locale of ['en', 'uz', 'ru']) {
      const context = await browser.newContext({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4180/?testUser=1&testTimer=1#/planner');
      await page.locator('main h1').waitFor();
      const labels = await page.evaluate(async ({ locale, theme }) => {
        const engine = await import('/src/features/planner/plannerEngine.ts');
        const { getPlannerCopy } = await import('/src/features/planner/plannerCopy.ts');
        const { localizePlannerValidation } = await import('/src/features/planner/plannerValidationCopy.ts');
        const state = engine.buildInitialPlannerState();
        for (const kind of ['quiz', 'writing', 'speaking', 'flashcards']) {
          const id = 'fixture-' + kind;
          state.tasks.push({ id, kind, label: kind, minutes: 1, xp: 10, section: 'Reading', difficulty: 'foundation', focusReason: 'Fixture', scheduledWindow: '09:00' });
          state.taskProgress[id] = engine.createProgress();
          state.activities[id] = { taskId: id, type: kind, title: 'Fixture ' + kind, instructions: 'Fixture instruction', difficulty: 'foundation', generatedAt: new Date().toISOString(), successCriteria: ['Fixture requirement'],
            questions: [{ id: 'q1', prompt: 'Fixture question', options: ['Option A', 'Option B'], answerIndex: 0, explanation: 'Fixture explanation', weaknessTag: 'reading' }],
            writingPrompt: 'Fixture writing prompt', speakingPrompt: 'Fixture speaking prompt', minWords: 3,
            flashcards: [{ id: 'c1', front: 'Fixture front', back: 'Fixture back', weaknessTag: 'reading' }] };
        }
        state.lastPlanKey = engine.buildPlanKey(state.form);
        localStorage.setItem('noviq-planner-isolated-browser-user', JSON.stringify({ state, dirty: false }));
        localStorage.setItem('noviq-locale', locale);
        localStorage.setItem('noviq-theme', theme);
        return { ...getPlannerCopy(locale), missingQuiz: localizePlannerValidation('Answer every quiz question.', locale),
          writingSubmitReason: localizePlannerValidation('Submit the writing task.', locale),
          speakingSubmitReason: localizePlannerValidation('Finish the speaking exercise.', locale) };
      }, { locale, theme });
      await page.reload();
      for (const [index, kind] of ['quiz', 'writing', 'speaking', 'flashcards'].entries()) {
        await page.getByRole('button', { name: new RegExp('^(?:' + labels.openActivity + '|' + labels.continueActivity + ')$') }).nth(index).click();
        await page.getByRole('heading', { name: 'Fixture ' + kind, exact: true }).waitFor();
        if (kind === 'quiz') {
          const expectedScore = locale === 'ru' ? 0 : 100;
          const option = page.getByRole('button', { name: expectedScore === 0 ? 'Option B' : 'Option A', exact: true });
          await page.getByRole('button', { name: labels.submitQuiz, exact: true }).click();
          await page.getByText(labels.missingQuiz, { exact: true }).waitFor();
          if (locale === 'en') await switchFeedbackLanguages(page, { requirement: 'Answer every quiz question.' });
          assert.equal(await option.isEnabled(), true);
          await option.click(); assert.equal(await option.getAttribute('aria-pressed'), 'true');
          await page.getByRole('button', { name: labels.submitQuiz, exact: true }).click();
          assert.equal(await option.isDisabled(), true);
          if (expectedScore === 0) {
            const colors = await option.evaluate(element => {
              const style = getComputedStyle(element);
              return { foreground: style.color, background: style.backgroundColor };
            });
            assert.equal(colors.foreground, theme === 'dark' ? 'rgb(255, 180, 192)' : 'rgb(163, 36, 58)');
            assert.equal(colors.background, theme === 'dark' ? 'rgb(50, 30, 43)' : 'rgb(255, 241, 243)');
          }
          await page.getByText('Fixture explanation', { exact: true }).waitFor();
          await page.getByText(labels.quizSubmittedScore.replace('{score}', String(expectedScore)), { exact: true }).waitFor();
          if (locale === 'en') {
            await switchFeedbackLanguages(page, { copy: 'quizSubmittedScore', values: { score: expectedScore } });
            assert.equal(await option.isDisabled(), true);
            assert.equal(await option.getAttribute('aria-pressed'), 'true');
            console.log(`PASS Quiz requirements/results translate live without changing submitted answers in ${theme}`);
          }
          await page.evaluate(() => { window.__timerFail = true; });
          await page.getByRole('button', { name: labels.startTimer, exact: true }).click();
          await page.getByText(labels.timerStartFailed, { exact: true }).waitFor();
          if (locale === 'en') {
            await page.getByRole('button', { name: 'Open menu', exact: true }).click();
            for (const [currentLabel, nextLocale] of [['Language', 'uz'], ['Til', 'ru'], ['Язык', 'en']]) {
              await page.getByRole('combobox', { name: currentLabel, exact: true }).selectOption(nextLocale);
              const message = await page.evaluate(async locale => {
                const { getPlannerCopy } = await import('/src/features/planner/plannerCopy.ts');
                return getPlannerCopy(locale).timerStartFailed;
              }, nextLocale);
              await page.getByText(message, { exact: true }).waitFor();
              assert.equal(await page.evaluate(() => window.__timerStarts), 1, 'Language change must not start another timer');
            }
            await page.locator('aside').getByRole('button', { name: 'Close menu', exact: true }).click();
            console.log(`PASS Timer failure translates live EN → UZ → RU → EN in ${theme}`);
          }
          await page.evaluate(() => { window.__timerFail = false; });
          await page.clock.install();
          await page.getByRole('button', { name: labels.startTimer, exact: true }).click();
          await page.getByRole('button', { name: labels.pauseTimer, exact: true }).waitFor();
          await page.clock.runFor(2200);
          const elapsed = () => page.evaluate(() => {
            const timer = [...document.querySelectorAll('main p')].find(item => /^\d+:\d+ \/ \d+:\d+$/.test(item.textContent.trim()));
            const [minutes, seconds] = timer.textContent.trim().split(' / ')[0].split(':').map(Number);
            return minutes * 60 + seconds;
          });
          assert.ok(await elapsed() >= 2);
          await page.getByRole('button', { name: labels.pauseTimer, exact: true }).click();
          const paused = await elapsed();
          await page.clock.runFor(2200); assert.equal(await elapsed(), paused);
          await page.getByRole('button', { name: labels.startTimer, exact: true }).click();
          await page.getByRole('button', { name: labels.pauseTimer, exact: true }).waitFor();
          await page.clock.runFor(1100); assert.ok(await elapsed() > paused);
          await page.getByRole('button', { name: labels.pauseTimer, exact: true }).click();
        } else if (kind === 'writing' || kind === 'speaking') {
          const input = page.getByRole('textbox', { name: kind === 'writing' ? labels.writingAnswer : labels.speakingNotes, exact: true });
          await input.fill('Fixture retained answer'); assert.equal(await input.inputValue(), 'Fixture retained answer');
          const reason = kind === 'writing' ? labels.writingSubmitReason : labels.speakingSubmitReason;
          const complete = page.getByRole('button', { name: labels.completeTask, exact: true });
          await complete.click();
          assert.ok((await page.locator('main').innerText()).includes(reason));
          await page.getByRole('button', { name: kind === 'writing' ? labels.submitWriting : labels.finishSpeaking, exact: true }).click();
          await complete.click();
          assert.ok(!(await page.locator('main').innerText()).includes(reason));
          await input.fill('Fixture edited answer');
          await complete.click();
          assert.ok((await page.locator('main').innerText()).includes(reason));
          await input.fill('Fixture retained answer');
        } else {
          await page.getByRole('button', { name: /Fixture front/ }).click();
          assert.equal(await page.getByRole('button', { name: /Fixture back/ }).getAttribute('aria-pressed'), 'true');
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.getByRole('button', { name: labels.backToday, exact: true }).click();
        await page.getByRole('button', { name: new RegExp('^(?:' + labels.openActivity + '|' + labels.continueActivity + ')$') }).nth(index).click();
        if (kind === 'writing' || kind === 'speaking') {
          assert.equal(await page.getByRole('textbox', { name: kind === 'writing' ? labels.writingAnswer : labels.speakingNotes, exact: true }).inputValue(), 'Fixture retained answer');
        } else if (kind === 'quiz') {
          assert.equal(await page.getByRole('button', { name: 'Option A', exact: true }).isDisabled(), true);
        } else {
          assert.equal(await page.getByRole('button', { name: /Fixture back/ }).getAttribute('aria-pressed'), 'true');
        }
        await page.setViewportSize({ width: 740, height: 320 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.setViewportSize({ width: 320, height: 740 });
        await page.getByRole('button', { name: labels.backToday, exact: true }).click();
      }
      assert.equal(await page.evaluate(() => window.__unexpectedWrites || 0), 0);
      await page.getByRole('button', { name: labels.continueActivity, exact: true }).click();
      await page.getByRole('button', { name: labels.startTimer, exact: true }).click();
      await page.getByRole('button', { name: labels.pauseTimer, exact: true }).waitFor();
      await page.clock.runFor(61000);
      await page.getByRole('button', { name: labels.timeReached, exact: true }).waitFor();
      await page.evaluate(() => { window.__completionFail = true; });
      await page.getByRole('button', { name: labels.completeTask, exact: true }).click();
      await page.getByText(labels.taskSaveFailed, { exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.evaluate(() => { window.__completionFail = false; });
      await page.getByRole('button', { name: labels.completeTask, exact: true }).evaluate(button => { button.click(); button.click(); });
      await page.locator('#planner-completion-title').waitFor();
      assert.equal(await page.evaluate(() => window.__completionCalls), 2);
      const payload = await page.evaluate(() => window.__completionPayload);
      assert.equal(payload[0].duration, 60); assert.equal(payload[3], 'fixture-receipt');
      await page.getByRole('button', { name: labels.continue, exact: true }).click();
      assert.equal(await page.getByRole('button', { name: labels.completed, exact: true }).isDisabled(), true);
      console.log(`PASS Planner failed completion/retry/double-click guard ${theme}/${locale}, mocked server only`);
      await page.getByRole('button', { name: labels.viewRoadmap, exact: true }).click();
      await page.getByText(labels.adaptiveRoadmap, { exact: true }).waitFor();
      assert.equal(await page.locator('main article').count(), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.setViewportSize({ width: 740, height: 320 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole('button', { name: labels.backToday, exact: true }).click();
      await page.setViewportSize({ width: 320, height: 740 });
      console.log(`PASS Roadmap cards/back navigation ${theme}/${locale}, narrow and landscape`);
      if (locale === 'en' && theme === 'light') {
        const expectedError = await page.evaluate(async () => {
          const key = 'noviq-planner-isolated-browser-user';
          const cached = JSON.parse(localStorage.getItem(key));
          delete cached.state.activities['fixture-flashcards'];
          localStorage.setItem(key, JSON.stringify(cached));
          const { getPlannerActivityError } = await import('/src/features/planner/plannerActivityErrors.ts');
          return getPlannerActivityError(new Error('Injected AI unavailable'), 'en');
        });
        await page.goto('http://127.0.0.1:4180/?testUser=1&testAI=unavailable#/planner');
        await page.getByRole('button', { name: labels.openActivity, exact: true }).nth(3).click();
        await page.getByRole('alert').filter({ hasText: expectedError }).waitFor();
        await page.getByRole('button', { name: 'Open menu', exact: true }).click();
        for (const [currentLabel, nextLocale] of [['Language', 'uz'], ['Til', 'ru'], ['Язык', 'en']]) {
          await page.getByRole('combobox', { name: currentLabel, exact: true }).selectOption(nextLocale);
          const localizedError = await page.evaluate(async locale => {
            const { getPlannerActivityError } = await import('/src/features/planner/plannerActivityErrors.ts');
            return getPlannerActivityError(new Error('Injected AI unavailable'), locale);
          }, nextLocale);
          await page.getByRole('alert').filter({ hasText: localizedError }).waitFor();
          assert.equal(await page.evaluate(() => window.__tutorRequests), 1, 'Changing language must not regenerate the activity');
        }
        await page.locator('aside').getByRole('button', { name: 'Close menu', exact: true }).click();
        console.log('PASS Existing Planner AI error translates live EN → UZ → RU → EN without another AI request');
        assert.equal(await page.evaluate(() => window.__tutorRequests), 1);
        assert.equal(await page.getByRole('heading', { name: 'Fixture flashcards', exact: true }).count(), 0);
        await page.getByRole('button', { name: labels.retryActivity, exact: true }).click();
        await page.waitForFunction(() => window.__tutorRequests === 2);
        await page.getByRole('button', { name: labels.retryActivity, exact: true }).waitFor({ state: 'visible' });
        assert.equal(await page.getByRole('heading', { name: 'Fixture flashcards', exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => window.__unexpectedWrites || 0), 0);
        console.log('PASS Planner generation failure and retry use safe guidance without fabricated activity');
        await page.evaluate(() => history.replaceState(null, '', '?testUser=1&testAI=planner-valid#/planner'));
        await page.getByRole('button', { name: labels.retryActivity, exact: true }).click();
        await page.getByRole('heading', { name: 'Generated fixture flashcards', exact: true }).waitFor();
        await page.getByText(labels.aiGenerated, { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.__tutorRequests), 3);
        await page.getByRole('button', { name: /Generated fixture front/ }).click();
        assert.equal(await page.getByRole('button', { name: /Generated fixture back/ }).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => window.__unexpectedWrites || 0), 0);
        console.log('PASS Planner retry accepts validated AI JSON, marks origin and reviews generated cards');
      }
      console.log(`PASS populated Planner ${theme}/${locale}, retained input/submission, portrait/landscape, no cloud writes`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
