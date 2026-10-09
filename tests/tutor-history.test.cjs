const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const exportsForTest={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/useTutorHistory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsForTest,require:()=>({}),Date,Map,Number});
test('cloud echoes merge by stable ID without discarding newer pending questions or answers',()=>{
 const {mergeChatMessages}=exportsForTest;
 const pending=[{id:'user-1',role:'user',content:'A question',createdAt:1},{id:'answer-1',role:'assistant',content:'An answer',createdAt:2}];
 const cloud=[{...pending[0],conversationId:'exam'}];
 const merged=mergeChatMessages(pending,cloud);
 assert.equal(merged.length,2);assert.equal(merged[0].conversationId,'exam');assert.equal(merged[1].content,'An answer');
 assert.equal(mergeChatMessages(merged,cloud).length,2);
 assert.equal(mergeChatMessages([{id:'invalid',role:'system',content:'Invalid injected role'}]).length,0);
});
test('old chat timestamps normalize without inventing current timestamps',()=>{
 const {chatTime}=exportsForTest;
 assert.equal(chatTime('2026-01-01T00:00:00Z'),1767225600000);
 assert.equal(chatTime({seconds:1767225600}),1767225600000);
 assert.equal(chatTime({toMillis:()=>42}),42);assert.equal(chatTime(undefined),0);assert.equal(chatTime('invalid'),0);
});

test('late cloud acknowledgment clears pending chat state only for the matching private record',()=>{
 const {reconcileTutorSync}=exportsForTest;
 const messages=[{id:'tutor-message-1',role:'user',content:'Question',conversationId:'chat-1',pendingCloud:true},{id:'tutor-message-2',role:'assistant',content:'Answer',conversationId:'chat-1',pendingCloud:true}];
 const operation={userId:'user-1',path:['users','user-1','tutorMessages','tutor-message-1'],status:'synced',data:{role:'user',content:'Question',conversationId:'chat-1'}};
 const confirmed=reconcileTutorSync(messages,[operation],'user-1');assert.equal(confirmed[0].pendingCloud,false);assert.equal(confirmed[1].pendingCloud,true);assert.equal(messages[0].pendingCloud,true);
 for(const invalid of [{...operation,status:'pending'},{...operation,userId:'other'},{...operation,data:{...operation.data,content:'Older question'}},{...operation,path:['users','other','tutorMessages','tutor-message-1']}])assert.equal(reconcileTutorSync(messages,[invalid],'user-1'),messages);
});
