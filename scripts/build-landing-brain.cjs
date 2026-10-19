// Reuses original NOVIQ footage from Git; no network, credentials or source resets.
const {execFileSync} = require('node:child_process');
const {mkdirSync, writeFileSync} = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'artifacts', 'landing-redesign', 'original-brain.mp4');
mkdirSync(path.dirname(source), {recursive:true});
writeFileSync(source, execFileSync('git', ['show','f043c99:public/noviq-landing-background.mp4'], {cwd:root,maxBuffer:100*1024*1024}));
const ffmpeg = process.env.NOVIQ_FFMPEG;
if (!ffmpeg) throw new Error('Set NOVIQ_FFMPEG to a locally installed ffmpeg executable.');
execFileSync(ffmpeg, ['-hide_banner','-loglevel','error','-y','-i',source,'-an','-vf','scale=640:-2,fps=24','-c:v','libx264','-preset','slow','-crf','34','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'public','noviq-brain-loop.mp4')], {stdio:'inherit'});
console.log('Optimized original NOVIQ brain loop created.');
