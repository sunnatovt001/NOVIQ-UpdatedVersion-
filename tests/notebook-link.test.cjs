const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function reader(response = 'Extracted source text') {
  const source = fs.readFileSync('src/lib/gemini.ts', 'utf8');
  const fn = source.slice(source.indexOf('export async function readNotebookLink('), source.indexOf('export async function askNotebook('));
  const exports = {}, requests = [];
  vm.runInNewContext(ts.transpileModule(fn, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, URL, generateWithFallback: async payload => { requests.push(payload); return response; },
  });
  return { read: exports.readNotebookLink, requests };
}

test('website extraction requests authenticated server reading with URL context compatibility', async () => {
  const { read, requests } = reader();
  assert.equal(await read(' https://example.org/article '), 'Extracted source text');
  assert.equal(requests[0].feature, 'notebook');
  assert.equal(requests[0].config.sourceUrl, 'https://example.org/article');
  assert.ok(requests[0].config.tools[0].urlContext);
  assert.match(requests[0].contents[0].parts[0].text, /https:\/\/example.org\/article/);
});

test('YouTube imports send video content and request faithful transcription', async () => {
  const { read, requests } = reader();
  await read('https://youtu.be/abcdefghijk', true);
  assert.equal(requests[0].contents[0].parts[0].fileData.fileUri, 'https://youtu.be/abcdefghijk');
  assert.equal(requests[0].config.tools, undefined);
  assert.match(requests[0].contents[0].parts[1].text, /Transcribe/);
});

test('invalid links and inaccessible content never become saved source text', async () => {
  const { read, requests } = reader();
  for (const url of ['javascript:alert(1)', 'file:///private', 'https://user:secret@example.org']) await assert.rejects(read(url));
  await assert.rejects(read('https://example.org/video', true));
  assert.equal(requests.length, 0);
  await assert.rejects(reader('SOURCE_UNAVAILABLE').read('https://example.org'));
  await assert.rejects(reader(' ').read('https://example.org'));
});
