const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function harness(start = 'https://noviqq.uz/') {
  const events = {}, clicks = {}, writes = [];
  let current = new URL(start);
  const window = { get location() { return current; }, history: {
    pushState: (_, __, url) => { writes.push(['push', url]); current = new URL(url, current); },
    replaceState: (_, __, url) => { writes.push(['replace', url]); current = new URL(url, current); },
  }, addEventListener: (name, cb) => { events[name] = cb; }, dispatchEvent: event => events[event.type]?.(event) };
  class Element { constructor(link) { this.link = link; } closest() { return this.link; } }
  const context = { exports: {}, URL, Element, PopStateEvent: class { constructor(type) { this.type = type; } }, window,
    document: { addEventListener: (name, cb) => { clicks[name] = cb; } } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/navigation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const api = context.exports;
  api.installPageNavigation();
  return { api, writes, window, click(href, options = {}) {
    let prevented = false;
    const event = { button: 0, target: new Element({ href, target: '', hasAttribute: () => false }), preventDefault: () => { prevented = true; }, ...options };
    clicks.click(event);
    return prevented;
  } };
}

test('legacy links migrate without losing invitation query or adding history entries', () => {
  const h = harness('https://noviqq.uz/?invite=token#/community');
  assert.deepEqual(h.writes, [['replace', '/community?invite=token']]);
});
test('programmatic routes use clean URLs, notify the app, and deduplicate history', () => {
  const h = harness(); let calls = 0;
  h.window.addEventListener('popstate', () => calls++);
  h.api.navigateToPage('/planner'); h.api.navigateToPage('planner');
  assert.equal(h.window.location.pathname, '/planner');
  assert.equal(h.window.location.hash, '');
  assert.equal(h.writes.length, 1); assert.equal(calls, 2);
});
test('internal links use client navigation while modified, external and section links stay native', () => {
  const h = harness();
  assert.equal(h.click('https://noviqq.uz/notes'), true);
  assert.equal(h.window.location.pathname, '/notes');
  assert.equal(h.click('https://noviqq.uz/planner', { ctrlKey: true }), false);
  assert.equal(h.click('https://example.com/notes'), false);
  assert.equal(h.click('https://noviqq.uz/#features'), false);
});
test('landing section hashes are preserved', () => {
  const h = harness('https://noviqq.uz/#features');
  assert.equal(h.writes.length, 0);
});
