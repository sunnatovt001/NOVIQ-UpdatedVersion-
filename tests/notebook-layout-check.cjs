const { chromium } = require('playwright');
const assert = require('node:assert/strict');
// Run against tests/real-account-fixture-server.mjs (port 4184).
const origin = 'http://127.0.0.1:4184';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const plan of ['pro', 'free']) for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      await context.addInitScript(plan => {
        localStorage.setItem('noviq-theme', plan === 'free' ? 'dark' : 'light');
        localStorage.setItem('noviq-pro-theme', 'light');
      }, plan);
      const page = await context.newPage();
      const uid = 'notebook-layout', scope = `notebook-${plan}-${width}-${Date.now()}`;
      await context.request.post(origin + '/__planner_fixture', { data: { uid, scope, action: 'seed', records: {
        [`users/${uid}`]: { displayName: 'Notebook test', onboarded: true, onboardingAnswers: {mainGoal:'Science', userType:'student', struggle:'focus'}, settings:{}, subscription:{plan, status:'active', currentPeriodEnd:new Date(Date.now()+864000000).toISOString()} },
        [`users/${uid}/proExperience/onboarding`]: {completed:true},
        ...Object.fromEntries(Array.from({length:4},(_,i)=>[`users/${uid}/notebookSources/source-${i}`,{type:'file',title:`Study material ${i+1}.pdf`,summary:'A source preview describing the main concepts and evidence used in this study material.',extractedText:'Source evidence',createdAt:new Date().toISOString()}])),
      } } });
      await page.goto(`${origin}/?testUser=1&testUid=${uid}&fixtureScope=${scope}#/notes`);
      await page.getByRole('button', { name:'Create note', exact:true }).click();
      if (width < 1280) await page.getByRole('button', { name:'AI', exact:true }).click();
      const panel = page.locator('.notebook-ai-panel:visible');
      await panel.waitFor();
      if (plan === 'pro' && width >= 1280) {
        const rail=page.locator('.notebook-source-list');
        assert.ok(await rail.evaluate(el=>el.clientHeight>=450),'source list must show several cards');
        assert.equal(await rail.locator('article').count(),4);
        assert.ok(await rail.evaluate(el=>{const bounds=el.getBoundingClientRect();return [...el.querySelectorAll('article')].filter(card=>{const r=card.getBoundingClientRect();return r.top>=bounds.top && r.bottom<=bounds.bottom;}).length>=3;}),'at least three source cards fit in the source pane');
        assert.ok(await page.locator('[data-page-scroll]').evaluate(el=>el.scrollHeight>el.clientHeight),'larger workspace scrolls down the page');
      }
      await panel.locator('.notebook-ai-composer').scrollIntoViewIfNeeded();
      const geometry = await panel.evaluate(el => {
        const messages = el.querySelector('.notebook-ai-messages');
        const send = el.querySelector('.notebook-ai-composer button').getBoundingClientRect();
        return { messageHeight:messages.clientHeight, noOverflow:messages.scrollWidth<=messages.clientWidth,
          sendBottom:send.bottom, unobstructed:el.contains(document.elementFromPoint(send.x+10,send.y+10)) };
      });
      assert.ok(geometry.messageHeight >= 55, JSON.stringify(geometry));
      assert.ok(geometry.noOverflow);
      assert.ok(geometry.unobstructed, 'send button must remain clickable');
      assert.ok(geometry.sendBottom <= height);
      if (width === 1280) {
        await panel.locator('textarea').fill('Explain this source');
        await panel.getByRole('button', {name:'Ask Notebook AI',exact:true}).click();
        await panel.getByText('A fixture coaching response grounded in the supplied learning evidence.', {exact:true}).waitFor();
        const trigger = page.locator('[data-notification-trigger]:visible').first();
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const notices = page.locator('[data-notification-panel]');
        await notices.waitFor();
        await notices.getByRole('button', {name:'Mark all read',exact:true}).click();
        assert.ok(await notices.isVisible(), 'inside interaction keeps notifications open');
        await page.locator(plan === 'pro' ? '.liquid-library-heading h1' : '.fl-heading h1').click();
        await notices.waitFor({state:'hidden'});
        await trigger.click(); await notices.waitFor();
        await page.keyboard.press('Escape'); await notices.waitFor({state:'hidden'});
        await trigger.click(); await notices.waitFor();
        await trigger.click(); await notices.waitFor({state:'hidden'});
        await page.locator('[data-page-scroll]').evaluate(el=>el.scrollTop=0);
        await page.screenshot({path:`artifacts/notebook-fix-${plan}-${width}.png`});
      }
      console.log(`PASS ${plan} ${width}x${height}: readable chat and accessible composer`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
