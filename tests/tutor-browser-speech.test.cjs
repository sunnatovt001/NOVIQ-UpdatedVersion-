const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(window){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/tutor/browserSpeech.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,window});return exports;}
test('blocked Chrome voice APIs cannot crash text Tutor initialization or cleanup',()=>{
 const window={get speechSynthesis(){throw new Error('Policy blocked');},SpeechRecognition:class {constructor(){throw new Error('Policy blocked');}}};
 const speech=load(window);
 assert.equal(speech.getTutorSpeechSynthesis(),null);
 assert.equal(speech.createTutorRecognition('en-US'),null);
 assert.doesNotThrow(()=>speech.stopTutorRecognition({stop(){throw new Error('Already stopped');}}));
 assert.doesNotThrow(()=>speech.cancelTutorSpeech({cancel(){throw new Error('Disabled');}}));
});
test('available Chrome recognition retains language and single-result settings',()=>{
 const speech=load({webkitSpeechRecognition:class {}}),recognition=speech.createTutorRecognition('uz-UZ');
 assert.equal(recognition.lang,'uz-UZ');assert.equal(recognition.continuous,false);assert.equal(recognition.interimResults,false);
});
