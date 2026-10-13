const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const luminance = color => {
  const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const theme of ['light', 'dark']) for (const locale of ['en', 'uz', 'ru']) {
      const context = await browser.newContext({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
      await context.addInitScript(({ theme, locale }) => {
        localStorage.setItem('noviq-theme', theme);
        localStorage.setItem('noviq-locale', locale);
      }, { theme, locale });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4180/?testUser=1#/planner');
      await page.locator('main section').first().waitFor();
      const result = await page.evaluate(() => {
        const panels = [...document.querySelectorAll('main section')];
        return { fits: document.documentElement.scrollWidth <= innerWidth,
          backgrounds: panels.filter(panel => panel.className.includes('bg-[var(--noviq-card)]')).map(panel => getComputedStyle(panel).backgroundColor),
          text: getComputedStyle(document.querySelector('main h1')).color };
      });
      assert.equal(result.fits, true);
      assert.ok(result.backgrounds.length >= 2);
      assert.ok(result.backgrounds.every(color => color === (theme === 'dark' ? 'rgb(19, 29, 46)' : 'rgb(255, 255, 255)')));
      assert.equal(result.text, theme === 'dark' ? 'rgb(248, 250, 252)' : 'rgb(20, 33, 61)');
      const primary = page.locator('main button').filter({ visible: true });
      const colors = await primary.evaluateAll(buttons => buttons.filter(button => !button.disabled && button.className.includes('bg-[var(--noviq-accent)]')).map(button => {
        const style = getComputedStyle(button);
        return { foreground: style.color, background: style.backgroundColor, label: button.textContent,
          childColors: [...button.querySelectorAll('span, svg')].map(child => getComputedStyle(child).color) };
      }));
      assert.ok(colors.length > 0, 'At least one real enabled Planner accent button is checked');
      for (const color of colors) {
        assert.ok(contrast(color.foreground, color.background) >= 4.5, `${theme}/${locale}: ${color.label} contrast is ${contrast(color.foreground, color.background).toFixed(2)}`);
        assert.ok(color.childColors.every(foreground => contrast(foreground, color.background) >= 4.5), 'Nested labels/icons retain accent contrast');
      }
      const hoverButton = page.locator('main button[class*="bg-[var(--noviq-accent)]"]:enabled').first();
      await hoverButton.hover();
      await page.waitForFunction(expected => {
        const button = [...document.querySelectorAll('main button')].find(button => !button.disabled && button.className.includes('bg-[var(--noviq-accent)]'));
        return getComputedStyle(button).backgroundColor === expected;
      }, theme === 'dark' ? 'rgb(189, 201, 255)' : 'rgb(31, 47, 82)');
      const hoverColors = await hoverButton.evaluate(button => ({ foreground: getComputedStyle(button).color, background: getComputedStyle(button).backgroundColor }));
      assert.ok(contrast(hoverColors.foreground, hoverColors.background) >= 4.5, 'Hover retains readable text');
      assert.equal(await page.evaluate(() => window.__unexpectedWrites || 0), 0);
      if (theme === 'dark' && locale === 'en') await page.screenshot({ path: 'artifacts/production-audit/planner-semantic-dark-320.png' });
      console.log(`PASS Planner semantic palette ${theme}/${locale}, 320px`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
