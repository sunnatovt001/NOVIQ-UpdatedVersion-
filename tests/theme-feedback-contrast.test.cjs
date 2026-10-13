const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('src/index.css', 'utf8');
const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(channel => parseInt(channel, 16));
const luminance = channels => {
  const linear = channels.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};
const ratio = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
for (const [theme, pattern] of [['light', /:root\s*\{([^}]+)\}/], ['dark', /(?:^|\n)\.dark\s*\{([^}]+)\}/]]) {
  test(`${theme} feedback token pairs retain normal-text contrast`, () => {
    const block = css.match(pattern)?.[1];
    assert.ok(block);
    const color = key => {
      const value = block.match(new RegExp(`--noviq-${key}:\\s*(#[a-f\\d]{6})`, 'i'))?.[1];
      assert.ok(value, `Missing ${key} token`);
      return rgb(value.slice(1));
    };
    for (const role of ['danger', 'warning']) {
      const foreground = color(role), background = color(`${role}-bg`);
      assert.ok(ratio(foreground, background) >= 4.5, `${role} contrast ${ratio(foreground, background)}`);
    }
    for (const surface of ['accent', 'accent-hover']) {
      assert.ok(ratio(color('on-accent'), color(surface)) >= 4.5, `${surface} foreground contrast`);
    }
    const foreground = color('danger'), background = color('danger-bg');
    assert.match(css, /color-mix\(in srgb, var\(--noviq-danger-bg\) 85%, var\(--noviq-danger\) 15%\)/);
    const hover = background.map((channel, index) => channel * 0.85 + foreground[index] * 0.15);
    assert.ok(ratio(foreground, hover) >= 4.5, `Danger hover contrast ${ratio(foreground, hover)}`);
  });
}
