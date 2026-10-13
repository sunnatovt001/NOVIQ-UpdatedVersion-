const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
    await page.goto('http://127.0.0.1:4180/?testUser=1#/tutor');
    await page.locator('textarea').waitFor();
    await page.evaluate(() => {
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      localStorage.setItem(`noviq:isolated-browser-user:usage:aiTutor:${date}`, '5');
    });
    await page.reload();
    await page.locator('textarea').fill('Explain gravity');
    await page.locator('textarea').press('Enter');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('heading').textContent(), "You have used today's free AI tutor messages.");
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close upgrade prompt');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Keep Free');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
    await page.locator('textarea').press('Enter');
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(15, 23, 42)');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.evaluate(() => localStorage.setItem('noviq-locale', 'uz'));
    await page.reload();
    await page.locator('textarea').fill('Savol');
    assert.equal(await page.getByText('0 ta bepul xabar qoldi', { exact: true }).count(), 1);
    await page.locator('textarea').press('Enter');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Bepul qolish', exact: true }).count(), 1);
    console.log('PASS Upgrade limit, keyboard trap, Escape, 320px, dark theme and Uzbek');
    await page.goto('http://127.0.0.1:4180/tests/route-recovery.html?case=import');
    await page.getByRole('heading', { name: 'Sahifani yuklab bo‘lmadi', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Qayta urinish', exact: true }).click();
    await page.getByText('Recovered page', { exact: true }).waitFor();
    console.log('PASS Localized route failure recovers after retry');
    await page.goto('http://127.0.0.1:4180/tests/community-dialog.html');
    const members = page.getByRole('dialog');
    await members.waitFor();
    assert.equal(await page.locator('[data-page-scroll]').evaluate(element => element.style.overflow), 'hidden');
    assert.equal(await members.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(15, 23, 42)');
    assert.equal(await members.evaluate(element => getComputedStyle(element).color), 'rgb(255, 255, 255)');
    await members.getByRole('textbox').fill('alex');
    assert.equal(await members.locator('li').count(), 1);
    await page.keyboard.press('Escape');
    await page.getByText('Dialog closed', { exact:true }).waitFor();
    assert.equal(await page.locator('[data-page-scroll]').evaluate(element => element.style.overflow), 'auto');
    console.log('PASS Community member dialog dark colors, search and Escape');
    await page.goto('http://127.0.0.1:4180/?testUser=1#/planner');
    await page.evaluate(async () => {
      localStorage.setItem('noviq-locale', 'en');
      const { normalizePlannerState } = await import('/src/features/planner/plannerEngine.ts');
      let state = normalizePlannerState(null);
      state.form.weakTopics = 'essay structure';
      state = normalizePlannerState({...state, lastPlanKey:'fixture-plan'});
      state.tasks = [{id:'writing-fixture',label:'Writing practice',minutes:10,xp:10,section:'Writing',kind:'writing',difficulty:'foundation',focusReason:'Essay structure',scheduledWindow:'Today'}];
      state.activities = {'writing-fixture':{taskId:'writing-fixture',type:'writing',title:'Essay structure practice',instructions:'Write a clear introduction.',difficulty:'foundation',generatedAt:new Date().toISOString(),successCriteria:['Clear thesis'],writingPrompt:'Explain why students benefit from planning.',minWords:20}};
      localStorage.setItem('noviq-planner-isolated-browser-user', JSON.stringify({state,dirty:false}));
    });
    await page.reload();
    await page.getByRole('button', { name:'Open activity', exact:true }).click();
    await page.getByText('Explain why students benefit from planning.', {exact:true}).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    console.log('PASS Populated Planner writing activity opens at 320px');
    for (const [locale, guidance] of [
      ['uz','O‘qishdagi tanaffusdan keyin rejangiz moslashtirildi. Bugun qisqaroq vazifadan davom eting; maqsadingizga hali erishish mumkin.'],
      ['ru','После перерыва в занятиях план скорректирован. Начните сегодня с более короткого задания; цель всё ещё достижима.'],
    ]) {
      await page.goto('http://127.0.0.1:4180/tests/community-dialog.html');
      await page.evaluate(value => {
        localStorage.setItem('noviq-locale',value);
        const cached = JSON.parse(localStorage.getItem('noviq-planner-isolated-browser-user'));
        cached.state.recoveryMode = {active:true,missedDays:3,message:'Legacy English recovery message',adjustedAt:new Date().toISOString()};
        localStorage.setItem('noviq-planner-isolated-browser-user',JSON.stringify(cached));
      },locale);
      await page.goto('http://127.0.0.1:4180/?testUser=1#/planner');
      await page.getByText(guidance,{exact:true}).first().waitFor();
      assert.equal(await page.getByText('Legacy English recovery message',{exact:true}).count(),0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    }
    console.log('PASS Planner recovery guidance retains missed-study meaning in Uzbek and Russian');
    for (const [locale, options, error] of [
      ['uz', ['IELTSga tayyorlanish', 'Maktab o‘quvchisi', 'Muntazam o‘qish'], 'Profilni sozlab bo‘lmadi. Qayta urinib ko‘ring.'],
      ['ru', ['Подготовка к IELTS', 'Школьник', 'Регулярность занятий'], 'Не удалось настроить профиль. Попробуйте снова.'],
    ]) {
      for (const theme of ['light','dark']) {
      await page.evaluate(({locale,theme}) => {
        localStorage.setItem('noviq-locale',locale);
        localStorage.setItem('noviq-theme',theme);
      }, {locale,theme});
      await page.goto('http://127.0.0.1:4180/tests/onboarding.html');
      const onboarding = page.locator('[data-onboarding]');
      await onboarding.waitFor();
      const firstOption = await onboarding.getByRole('button').first().boundingBox();
      assert.ok(firstOption && firstOption.y >= 0 && firstOption.y + firstOption.height <= 740, 'first onboarding option is visible without scrolling');
      if (locale==='uz') await page.screenshot({path:`artifacts/production-audit/onboarding-initial-${theme}-320.png`});
      assert.equal(await onboarding.evaluate(element=>getComputedStyle(element).backgroundColor),theme==='dark'?'rgb(11, 18, 32)':'rgb(247, 248, 246)');
      assert.equal(await onboarding.locator('section').last().evaluate(element=>getComputedStyle(element).backgroundColor),theme==='dark'?'rgb(19, 29, 46)':'rgb(255, 255, 255)');
      for (const [index, option] of options.entries()) {
        await page.getByRole('button', {name:option,exact:true}).click();
        if (index < options.length - 1) {
          assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H2');
        }
      }
      await page.getByText(error, {exact:true}).waitFor();
      assert.deepEqual(await page.evaluate(() => window.fixtureAnswers), {
        mainGoal:'Prepare for IELTS', userType:'High school student', struggle:'Staying consistent',
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (locale==='uz') await page.screenshot({path:`artifacts/production-audit/onboarding-${theme}-320.png`,fullPage:true});
      }
    }
    console.log('PASS Uzbek/Russian onboarding preserves profile values and shows localized save errors at 320px');
    for (const [locale, title, submit, validation] of [
      ['uz', 'O‘qish uchun hisob yarating', 'Hisob yaratish', 'To‘liq ismingizni kiriting.'],
      ['ru', 'Создайте учебный аккаунт', 'Создать аккаунт', 'Введите полное имя.'],
    ]) {
      await page.goto('http://127.0.0.1:4180/');
      await page.evaluate(value => localStorage.setItem('noviq-locale', value), locale);
      await page.reload();
      await page.getByRole('combobox').selectOption('en');
      await page.getByRole('heading', {name:'Exam Planning',exact:true}).waitFor();
      await page.getByRole('combobox', {name:'Language',exact:true}).selectOption(locale);
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      await page.getByRole('heading', {name:locale === 'uz' ? 'Imtihon rejasi' : 'План подготовки',exact:true}).waitFor();
      assert.equal(await page.locator('article h3').count(), 6);
      await page.getByRole('button', {name:locale === 'uz' ? 'Bepul ro‘yxatdan o‘tish' : 'Бесплатная регистрация',exact:true}).click();
      const authDialog = page.getByRole('dialog', {name:title,exact:true});
      await authDialog.waitFor();
      assert.equal(await authDialog.locator('#auth-dialog-title').innerText(), title);
      await authDialog.locator('button[type="submit"]').click();
      await authDialog.getByText(validation, {exact:true}).waitFor();
      assert.equal(await authDialog.locator('button[type="submit"]').innerText(), submit);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.keyboard.press('Escape');
      await page.goto('http://127.0.0.1:4180/?invite=fixture');
      await page.getByText(locale === 'uz'
        ? 'Sizga do‘stlik taklifi kelgan. Qabul qilish uchun taklif yuborilgan email bilan kiring.'
        : 'У вас есть приглашение в друзья. Войдите с приглашённым адресом email, чтобы принять его.', {exact:true}).waitFor();
    }
    console.log('PASS Uzbek/Russian auth titles, required fields and submit labels at 320px');
    for (const [locale, heading, retry] of [
      ['uz','Hisobga kirishda muammo bor','Qayta urinish'],
      ['ru','Проблема с доступом к аккаунту','Попробовать снова'],
    ]) {
      await page.evaluate(value => localStorage.setItem('noviq-locale',value),locale);
      for (const category of ['permission','network','timeout']) {
        await page.goto(`http://127.0.0.1:4180/?testUser=1&testAccountError=${category}`);
        await page.getByRole('heading',{name:heading,exact:true}).waitFor();
        assert.equal(await page.locator('html').getAttribute('lang'),locale);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
        assert.equal(await page.locator('body').innerText().then(value => /deploy|Firebase|secret-diagnostic/.test(value)),false);
        const beforeReload = await page.evaluate(() => performance.timeOrigin);
        await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.getByRole('button',{name:retry,exact:true}).click()]);
        await page.getByRole('heading',{name:heading,exact:true}).waitFor();
        assert.notEqual(await page.evaluate(() => performance.timeOrigin),beforeReload);
      }
    }
    console.log('PASS Uzbek/Russian account permission, network and timeout recovery screens reload safely at 320px');
    await page.goto('http://127.0.0.1:4180/tests/community-dialog.html');
    await page.evaluate(() => {localStorage.setItem('noviq-locale','en');localStorage.setItem('noviq-theme','dark');});
    await page.goto('http://127.0.0.1:4180/?testUser=1&testUid=recommendations-fixture#/planner');
    const recommendationTrigger = page.getByRole('button',{name:'Recommendations',exact:true});
    await recommendationTrigger.click();
    const recommendationDialog = page.getByRole('dialog',{name:'Exam recommendations',exact:true});
    await recommendationDialog.waitFor();
    assert.equal(await recommendationDialog.locator('button').evaluate(element => element === document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await recommendationDialog.locator('button').evaluate(element => element === document.activeElement),true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    assert.equal(await recommendationDialog.evaluate(element => getComputedStyle(element).backgroundColor),'rgb(19, 29, 46)');
    await page.keyboard.press('Escape');
    await recommendationDialog.waitFor({state:'detached'});
    assert.equal(await recommendationTrigger.evaluate(element => element === document.activeElement),true);
    console.log('PASS Planner recommendations dark mobile dialog, focus containment, Escape and focus restoration');
    await page.goto('http://127.0.0.1:4180/tests/community-dialog.html');
    await page.evaluate(() => {
      const saved = localStorage.getItem('noviq-planner-isolated-browser-user');
      localStorage.setItem('noviq-planner-recommendations-retry-fixture',saved);
    });
    await page.goto('http://127.0.0.1:4180/?testUser=1&testUid=recommendations-retry-fixture&testAI=unavailable#/planner');
    await page.getByRole('button',{name:'Recommendations',exact:true}).click();
    const retryDialog = page.getByRole('dialog',{name:'Exam recommendations',exact:true});
    await retryDialog.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.__tutorRequests),1);
    await page.evaluate(() => history.replaceState(null,'','?testUser=1&testUid=recommendations-retry-fixture&testAI=ready#/planner'));
    await retryDialog.getByRole('button',{name:'Try again',exact:true}).click();
    await retryDialog.getByText(/Verified fixture answer:/).waitFor();
    assert.equal(await page.evaluate(() => window.__tutorRequests),2);
    assert.equal(await retryDialog.getByRole('alert').count(),0);
    assert.equal(await retryDialog.getByRole('button',{name:'Try again',exact:true}).count(),0);
    await page.keyboard.press('Escape');
    await retryDialog.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Recommendations',exact:true}).click();
    await retryDialog.getByText(/Verified fixture answer:/).waitFor();
    assert.equal(await page.evaluate(() => window.__tutorRequests),2);
    assert.equal(await page.evaluate(() => window.__unexpectedWrites || 0),0);
    await page.keyboard.press('Escape');
    console.log('PASS Real Planner recommendation handler recovers via dialog retry and caches success without extra AI calls');
    const restricted = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await restricted.addInitScript(() => {
      const read = Storage.prototype.getItem;
      const write = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        if (['noviq-locale', 'noviq-theme', 'noviq-sidebar'].includes(key)) throw new DOMException('Blocked', 'SecurityError');
        return read.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (['noviq-locale', 'noviq-theme', 'noviq-sidebar'].includes(key)) throw new DOMException('Full', 'QuotaExceededError');
        return write.call(this, key, value);
      };
    });
    await restricted.goto('http://127.0.0.1:4180/?testUser=1#/tutor');
    await restricted.locator('textarea').waitFor();
    const assertNavigationPalette = async () => {
      await restricted.waitForFunction(() => {
        const element = document.querySelector('.mobile-bottom-nav [aria-current="page"]');
        if (!element) return false;
        const probe = document.createElement('span');
        probe.style.color = 'var(--noviq-accent)';
        element.append(probe);
        const matches = getComputedStyle(element).color === getComputedStyle(probe).color;
        probe.remove();
        return matches;
      });
    };
    await assertNavigationPalette();
    await restricted.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('button', { name: 'Today', exact: true }).click();
    assert.equal(await restricted.evaluate(() => document.activeElement.tagName), 'MAIN');
    await restricted.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('button', { name: 'Tutor', exact: true }).click();
    await restricted.locator('textarea').waitFor();
    await restricted.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
    assert.equal(await restricted.locator('.noviq-app').evaluate(element => element.classList.contains('dark')), true);
    await assertNavigationPalette();
    await restricted.getByRole('combobox', { name: 'Tutor language', exact: true }).selectOption('ru-RU');
    await restricted.getByText(/Здравствуйте!/).waitFor();
    assert.equal(await restricted.locator('html').getAttribute('lang'), 'ru');
    await restricted.close();
    console.log('PASS Locale read/write failures preserve app startup and session language changes');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
