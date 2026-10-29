import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFirestoreValue as decode,prepareStudyImport,stageStudyImport } from '../src/studyImport.mjs';
const snapshot = () => ({ version:1,project:'source',database:'named',readTime:'2026-10-28T12:00:00Z',documents:[
  {path:'users/original/notebookNotes/n1',fields:{title:{stringValue:'Saved note'},content:{stringValue:'Keep me'},
    tags:{arrayValue:{values:[{stringValue:'tag'}]}},updatedAt:{timestampValue:'2026-10-28T12:00:00.123456789Z'}}},
  {path:'users/original/trusted/progress',fields:{xp:{integerValue:'999'}}},
] });
test('native decoding preserves timestamp precision and refuses unsafe numeric conversion',()=>{
  assert.equal(decode({timestampValue:'2026-10-28T12:00:00.123456789Z'}),'2026-10-28T12:00:00.123456789Z');
  assert.throws(()=>decode({integerValue:'9223372036854775807'}));
  assert.throws(()=>decode({doubleValue:'NaN'}));
  assert.throws(()=>decode({bytesValue:'AQID'}));
});
test('study preparation retains UID and raw fields, excludes trusted records and rejects wrong source',()=>{
  const source=snapshot(),prepared=prepareStudyImport(source,{project:'source',database:'named'});
  assert.equal(prepared.notes.length,1);assert.equal(prepared.plans.length,0);
  assert.equal(prepared.notes[0].userId,'original');
  assert.deepEqual(JSON.parse(prepared.notes[0].sourceFieldsJson),source.documents[0].fields);
  assert.equal(prepared.notes[0].updatedAt,'2026-10-28T12:00:00.123456789Z');
  assert.throws(()=>prepareStudyImport(source,{project:'wrong',database:'named'}));
  source.documents.push(source.documents[0]);assert.throws(()=>prepareStudyImport(source,{project:'source',database:'named'}));
});
test('study staging is idempotent, snapshot-isolated, detects conflicts and never writes active collections',async()=>{
  const prepared=prepareStudyImport(snapshot(),{project:'source',database:'named'}),rows=new Map();
  const db={collection(name){assert.equal(name,'migration_study_previews');return {
    async insertOne(row){if(rows.has(row._id))throw Object.assign(new Error(),{code:11000});rows.set(row._id,structuredClone(row));},
    async findOne(q){return rows.get(q._id);}
  };}};
  const result=await stageStudyImport(db,prepared);assert.equal(result.applicationWrites,0);assert.equal(result.cutover,false);
  assert.deepEqual(await stageStudyImport(db,prepared),result);
  [...rows.values()][0].payloadJson='{}';await assert.rejects(stageStudyImport(db,prepared),/mismatch/);
});
test('profile and legacy card preparation preserve source identity and reject mismatched IDs',()=>{
  const source=snapshot();
  source.documents.push({path:'users/original',fields:{uid:{stringValue:'original'},xp:{integerValue:'77'}}});
  source.documents.push({path:'users/original/decks/d1/cards/c1',fields:{question:{stringValue:'Hello'},answer:{stringValue:'Salom'}}});
  const prepared=prepareStudyImport(source,{project:'source',database:'named'});
  assert.equal(prepared.profiles[0].data.xp,77);
  assert.equal(prepared.flashcards[0].data.front,'Hello');
  assert.equal(prepared.flashcards[0].data.deckId,'d1');
  assert.deepEqual(JSON.parse(prepared.flashcards[0].sourceFieldsJson),source.documents.at(-1).fields);
  source.documents.at(-1).fields.id={stringValue:'wrong-id'};
  assert.throws(()=>prepareStudyImport(source,{project:'source',database:'named'}));
});

const native = value => value === null ? {nullValue:null} : Array.isArray(value)
  ? {arrayValue:{values:value.map(native)}} : typeof value==='object'
    ? {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,native(v)]))}}
    : typeof value==='string' ? {stringValue:value} : typeof value==='boolean' ? {booleanValue:value}
      : {integerValue:String(value)};
const fields = object => native(object).mapValue.fields;
test('real-source metadata and complete planner history survive preparation; incomplete records are retained for recovery',()=>{
  const source=snapshot();
  const plan={version:2,userId:'original',revision:'rev2',updatedAt:2,startedAt:1,step:0,ready:true,
    statuses:[],timezone:'Asia/Tashkent',subjects:[],windows:[],commitments:[],sessionMinutes:25,breakMinutes:5,dailyLimit:120,
    split:true,mode:'hybrid',preference:'evening',tasks:[],sessions:[],history:[],syncStatus:'synced',syncedAt:'2026-10-29'};
  source.documents.push(
    {path:'users/original/planner/smart-v2',fields:fields(plan)},
    {path:'users/original/plannerHistory/rev2',fields:fields({id:'rev2',userId:'original',createdAt:2,description:'Previous plan',plan:{...plan,revision:'rev1'}})},
    {path:'users/original/decks/partial',fields:fields({syncStatus:'synced'})},
    {path:'users/original/decks/d1/cards/partial',fields:fields({reviewCount:1})},
    {path:'users/original/decks/d1',fields:fields({title:'Deck',color:'blue',icon:'book'})},
    {path:'users/original/decks/d1/cards/c1',fields:fields({front:'Front',back:'Back',language:'en',lastReviewedAt:'2026-10-29'})},
  );
  const prepared=prepareStudyImport(source,{project:'source',database:'named'});
  assert.equal(prepared.plans[0].history.length,1);
  assert.equal(prepared.plans[0].history[0].plan.revision,'rev1');
  assert.equal(prepared.plans[0].plan.syncStatus,undefined);
  assert.equal(JSON.parse(prepared.plans[0].sourceFieldsJson).syncStatus.stringValue,'synced');
  assert.equal(prepared.flashcards.length,2);
  assert.equal(prepared.flashcards[1].data.language,'en');
  assert.equal(prepared.recovery.length,2);
  assert.ok(prepared.recovery.every(row=>row.sourceFieldsJson));
  source.documents.find(row=>row.path.includes('plannerHistory')).fields.userId={stringValue:'other'};
  assert.throws(()=>prepareStudyImport(source,{project:'source',database:'named'}));
});
