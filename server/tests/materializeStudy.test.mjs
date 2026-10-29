import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeStudy } from '../src/materializeStudy.mjs';
function fixture() {
  let tables=new Map();const session={};
  const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
  const db={collection(name){return {
    async findOne(q,options){assert.equal(options.session,session);return table(name).get(q._id);},
    async insertOne(row,options){assert.equal(options.session,session);table(name).set(row._id,structuredClone(row));},
  };}};
  return {db,table,transaction:async work=>{const copy=structuredClone(tables);try{return await work(session);}catch(error){tables=copy;throw error;}}};
}
const prepared=()=>({snapshotId:'snapshot',readTime:'2026-10-29T07:25:07Z',recovery:[{reason:'incomplete-source-card'}],
  profiles:[{_id:'owner',data:{uid:'owner',xp:70},revision:1,sourceSnapshot:'snapshot'}],
  notes:[{_id:'owner:note',userId:'owner',content:'Preserve',revision:1,sourceSnapshot:'snapshot'}],
  plans:[{_id:'owner',plan:{revision:'current'},history:[{id:'old'}],sourceSnapshot:'snapshot'}],flashcards:[]});
test('staging materialization preserves all validated records/history and is retry-safe without approving cutover',async()=>{
  const f=fixture(),p=prepared();f.table('auth_accounts').set('owner',{_id:'owner'});
  const result=await materializeStudy(f.db,p,f.transaction);
  assert.equal(result.counts.user_profiles,1);assert.equal(result.historyRecords,1);
  assert.equal(result.recoveryRecords,1);assert.equal(result.applicationCutover,false);
  assert.equal(f.table('planner_plans').get('owner').history.length,1);
  assert.deepEqual(await materializeStudy(f.db,p,f.transaction),result);
});
test('existing application conflicts roll back other insertions and never overwrite content',async()=>{
  const f=fixture(),p=prepared();f.table('auth_accounts').set('owner',{_id:'owner'});
  f.table('user_profiles').set('owner',{_id:'owner',data:{xp:99}});
  await assert.rejects(materializeStudy(f.db,p,f.transaction));
  assert.equal(f.table('notebook_notes').size,0);
  assert.equal(f.table('planner_plans').size,0);
  assert.equal(f.table('user_profiles').get('owner').data.xp,99);
  assert.equal(f.table('migration_study_materializations').size,0);
});
test('missing or cross-owner account mappings are rejected before activation',async()=>{
  const f=fixture(),p=prepared();await assert.rejects(materializeStudy(f.db,p,f.transaction));
  f.table('auth_accounts').set('owner',{_id:'owner'});p.notes[0].userId='other';
  await assert.rejects(materializeStudy(f.db,p,f.transaction));assert.equal(f.table('notebook_notes').size,0);
});
