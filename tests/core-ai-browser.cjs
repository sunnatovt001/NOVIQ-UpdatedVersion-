const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const copy = {
  en: { tutorRetry: 'Retry answer', create: 'Create note', send: 'Send', ask: 'Ask Notebook AI', panel: 'Notebook AI panel', retry: 'Retry AI response' },
  uz: { tutorRetry: 'Javobni qayta olish', create: 'Qayd yaratish', send: 'Yuborish', ask: 'Notebook AIdan so‘rash', panel: 'Notebook AI paneli', retry: 'AI javobini qayta olish' },
  ru: { tutorRetry: 'Повторить ответ', create: 'Создать заметку', send: 'Отправить', ask: 'Спросить Notebook AI', panel: 'Панель Notebook AI', retry: 'Повторить ответ AI' },
};
(async () => {
  const browser = await chromium.launch({ ...(process.env.NOVIQ_BROWSER_CHANNEL === 'chromium' ? {} : {channel: 'chrome'}), headless: true });
  try {
    for (const theme of ['light', 'dark']) for (const locale of ['en', 'uz', 'ru']) {
      const context = await browser.newContext({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
      await context.addInitScript(({ theme, locale }) => {
        localStorage.setItem('noviq-theme', theme);
        localStorage.setItem('noviq-locale', locale);
        localStorage.setItem('noviq:isolated-browser-user:notebookSources', JSON.stringify([{
          id:'restored-failed-source',type:'file',title:'Failed cached source',fileName:'chapter.pdf',
          downloadURL:'',syncStatus:'failed',extractedText:'Fixture cached source',summary:'Fixture cache summary',
        }]));
      }, { theme, locale });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of ['tutor', 'notes']) {
        await page.goto(`http://127.0.0.1:4180/?testUser=1&testAI=success#/${route}`);
        let input, send, scope;
        if (route === 'tutor') {
          const messageLabel = { en: 'Message Noviq Tutor', uz: 'Noviq Tutor’ga xabar yozish', ru: 'Написать Noviq Tutor' }[locale];
          input = page.getByRole('textbox', { name: messageLabel, exact: true });
          send = page.getByRole('button', { name: copy[locale].send, exact: true });
          scope = page.locator('.tutor-messages');
        } else {
          await page.getByRole('button', { name: copy[locale].create, exact: true }).click();
          const warning = {
            en:'The server has not confirmed these changes. Keep this page open and retry saving.',
            uz:'Server bu o‘zgarishlarni tasdiqlamadi. Sahifani ochiq saqlang va qayta saqlab ko‘ring.',
            ru:'Сервер не подтвердил изменения. Не закрывайте страницу и повторите сохранение.',
          }[locale];
          await page.getByText(warning, { exact:true }).waitFor();
          await page.getByRole('button', { name: 'AI', exact: true }).click();
          scope = page.getByRole('complementary', { name: copy[locale].panel, exact: true });
          input = scope.locator('textarea');
          send = scope.getByRole('button', { name: copy[locale].ask, exact: true });
        }
        await input.waitFor();
        const requestBaseline = await page.evaluate(() => window.__tutorRequests || 0);
        await input.fill('   ');
        assert.equal(await send.isDisabled(), true);
        assert.equal(await page.evaluate(() => window.__tutorRequests || 0), requestBaseline);
        const question = `${route} fixture question ${locale} ${theme}`;
        await input.fill(question);
        await send.click();
        await scope.getByText(`Verified fixture answer: ${question}`, { exact: true }).waitFor();
        assert.equal(await scope.getByText(question, { exact: true }).count(), 1);
        await page.evaluate(route => history.replaceState(null, '', `?testUser=1&testAI=unavailable#/${route}`), route);
        const failedQuestion = `${route} failed fixture ${locale} ${theme}`;
        await input.fill(failedQuestion);
        await send.click();
        const retry = page.getByRole('button', { name: route === 'tutor' ? copy[locale].tutorRetry : copy[locale].retry, exact: true });
        await retry.waitFor();
        const safeMessage = await page.evaluate(async locale => {
          const { getAiFailureMessage } = await import('/src/lib/aiFailure.ts');
          return getAiFailureMessage('unknown', locale);
        }, locale);
        await page.getByText(safeMessage, { exact: true }).waitFor();
        const errorColors = await page.getByRole('alert').filter({ hasText: safeMessage }).first().evaluate(element => ({
          foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
        }));
        assert.equal(errorColors.foreground, theme === 'dark' ? 'rgb(255, 180, 192)' : 'rgb(163, 36, 58)');
        assert.equal(errorColors.background, theme === 'dark' ? 'rgb(50, 30, 43)' : 'rgb(255, 241, 243)');
        assert.equal(await page.getByText('Injected AI unavailable', { exact: true }).count(), 0);
        assert.equal(await scope.getByText(failedQuestion, { exact: true }).count(), 1);
        await page.evaluate(route => history.replaceState(null, '', `?testUser=1&testAI=success#/${route}`), route);
        await retry.click();
        await scope.getByText(`Verified fixture answer: ${failedQuestion}`, { exact: true }).waitFor();
        assert.equal(await scope.getByText(failedQuestion, { exact: true }).count(), 1);
        assert.equal(await page.evaluate(() => window.__tutorRequests), requestBaseline + 3);
        assert.equal(await page.evaluate(() => window.__unexpectedWrites || 0), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        console.log(`PASS ${route} ${theme}/${locale}: whitespace blocked, success, failed response/retry, no duplicate question or cloud writes`);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
