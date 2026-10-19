// Restore only the original branded media, without reverting any source changes.
const {execFileSync} = require('node:child_process');
const {writeFileSync} = require('node:fs');
const bytes = execFileSync('git', ['show', 'f043c99:public/noviq-landing-background.mp4'], {maxBuffer: 250 * 1024 * 1024});
writeFileSync('public/noviq-landing-background.mp4', bytes);
console.log(`Restored original brain media: ${bytes.length} bytes`);
