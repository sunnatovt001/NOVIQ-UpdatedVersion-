const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

test('Free and Pro Tutor send the latest question unchanged under a question-first language policy', async () => {
  const requests = [];
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync('src/lib/gemini.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, console, TextEncoder, URL, require: name => name.endsWith('/callable') ? {
    httpsCallable: () => async request => { requests.push(request); return { data: { text: 'Isolated answer' } }; },
  } : name.endsWith('/firebase') ? { auth: {}, functions: {} } : {} });
  for (const question of ['Explain Newton’s second law.', 'Объясни второй закон Ньютона.', 'Ньютоннинг иккинчи қонунини тушунтир.', 'Newton law ni oddiy qilib tushuntir', 'Please answer in Russian: what is force?']) {
    for (const premium of [false, true]) {
      await exports.askTutor(question, 'Interface language: uz-UZ', 'uz-UZ', { ...(premium ? { premiumMode: 'coach' } : {}), history: [{ role: 'user', content: 'Old English conversation' }] });
      const request = requests.at(-1);
      assert.ok(request.contents.endsWith(`Student question:\n${question}`));
      assert.ok(request.config.systemInstruction.includes('explicit request to answer in a particular language takes priority'));
      assert.ok(request.config.systemInstruction.includes('Uzbek written in Cyrillic is Uzbek, not Russian'));
      assert.ok(!request.config.systemInstruction.includes('Answer fluently in Uzbek'));
      assert.ok(!request.contents.startsWith('Language: Uzbek'));
      assert.equal(request.feature, premium ? 'intelligence' : 'tutor');
    }
  }
  await exports.askTutor('Explain https://example.com and https://youtu.be/abc123', '', 'uz-UZ', { attachments: [{ name: 'voice.webm', mimeType: 'audio/webm', data: 'YXVkaW8=' }] });
  const media = requests.at(-1);
  assert.equal(media.contents[0].parts.find(part => part.inlineData).inlineData.mimeType, 'audio/webm');
  assert.equal(media.contents[0].parts.find(part => part.fileData).fileData.fileUri, 'https://youtu.be/abc123');
  assert.equal(media.config.tools[0].urlContext !== undefined, true);
  const count = requests.length;
  await assert.rejects(exports.askTutor('Read this', '', 'uz-UZ', { attachments: [{ name: 'large.png', mimeType: 'image/png', data: 'A'.repeat(8 * 1024 * 1024) }] }), /too large/);
  assert.equal(requests.length, count, 'Oversized media must be rejected before a paid request');
});
