const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mammothRequire = createRequire(require.resolve('mammoth'));
const JSZip = mammothRequire('jszip');
const mammoth = require('mammoth');

test('DOCX extraction and CLI conversion work with the secure argument parser override', async () => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>NOVIQ study notes — O‘qish — Учёба</w:t></w:r></w:p><w:p><w:r><w:t>Keep &amp; review &lt;ideas&gt;.</w:t></w:r></w:p></w:body></w:document>');
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const result = await mammoth.extractRawText({ buffer });
  assert.equal(result.value, 'NOVIQ study notes — O‘qish — Учёба\n\nKeep & review <ideas>.\n\n');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'noviq-docx-test-'));
  try {
    const input = path.join(directory, 'notes.docx');
    fs.writeFileSync(input, buffer);
    const cli = path.join(path.dirname(require.resolve('mammoth/package.json')), 'bin/mammoth');
    const converted = spawnSync(process.execPath, [cli, input, '--output-format', 'html'], { encoding: 'utf8' });
    assert.equal(converted.status, 0, converted.stderr);
    assert.match(converted.stdout, /<p>NOVIQ study notes — O‘qish — Учёба<\/p>/);
    assert.match(converted.stdout, /Keep &amp; review &lt;ideas&gt;/);
    const rejected = spawnSync(process.execPath, [cli, input, '--output-format', 'invalid'], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /invalid choice/);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
