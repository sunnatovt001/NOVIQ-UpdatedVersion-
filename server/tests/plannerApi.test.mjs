import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPlannerApi, validMongoPlan } from '../src/plannerApi.mjs';
const plan = (revision='rev1', uid='owner') => ({ version:2,userId:uid,revision,updatedAt:0,startedAt:1,step:0,ready:true,
  statuses:[],timezone:'Asia/Tashkent',subjects:[],windows:[],commitments:[],sessionMinutes:25,breakMinutes:5,dailyLimit:120,
  split:true,mode:'hybrid',preference:'evening',tasks:[],sessions:[],history:[] });

test('Planner validator preserves owner/timezone/range constraints and rejects forged top-level claims', () => {
  assert.equal(validMongoPlan(plan(),'owner'),true);
  for (const patch of [{userId:'other'},{xp:100},{timezone:'invalid'},{revision:''},{tasks:[{id:'x'}]},{windows:[{id:'x',label:'',days:[9],start:'17:00',end:'18:00'}]}])
    assert.equal(validMongoPlan({...plan(),...patch},'owner'),false);
});

test('Planner HTTP is owner-only, CAS-safe and preserves immutable history beyond the response window', async t => {
  const rows = new Map(); let reads = 0;
  const db = { collection(name) {
    assert.equal(name,'planner_plans');
    return {
      async findOne(query) { reads++; return structuredClone(rows.get(query._id)); },
      async insertOne(row) { if(rows.has(row._id))throw Object.assign(new Error(),{code:11000});rows.set(row._id,structuredClone(row)); },
      async replaceOne(query,row) { if(rows.get(query._id)?.plan.revision!==query['plan.revision'])return {modifiedCount:0};rows.set(row._id,structuredClone(row));return {modifiedCount:1}; },
    };
  } };
  const sessions = { resolve:async token=>token==='a'.repeat(64)?{uid:'owner'}:token==='b'.repeat(64)?{uid:'other'}:null };
  const server = http.createServer(createPlannerApi(db,sessions,{origin:'https://app.invalid',now:()=>5000}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request = (method,body,identity='a',origin='https://app.invalid',path='/api/planner/plan')=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{
    method,headers:{...(identity?{Cookie:`__Host-noviq_session=${identity.repeat(64)}`} :{}),Origin:origin,'Content-Type':'application/json'},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}) });
  const body = (revision,baseRevision)=>({plan:plan(revision),baseRevision,description:'Update'});
  assert.equal((await request('GET',undefined,'')).status,401);assert.equal(reads,0);
  assert.equal((await request('PUT',body('rev1',null),'a','https://evil.invalid')).status,403);
  assert.equal((await request('PUT',{...body('rev1',null),plan:plan('rev1','other')})).status,400);
  assert.equal((await request('PUT',body('rev1',null))).status,201);
  assert.equal(rows.get('owner').plan.sequence,1);
  assert.equal(rows.get('owner').plan.persistenceVersion,3);
  assert.equal(rows.get('owner').plan.previousRevision,null);
  assert.equal((await request('PUT',body('rev1',null))).status,200);
  assert.equal((await request('PUT',{...body('rev1',null),description:'Reused revision'})).status,409);
  const concurrent=await Promise.all([request('PUT',body('rev2','rev1')),request('PUT',body('rev3','rev1'))]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  assert.equal((await (await request('GET',undefined,'b')).json()).plan,null);
  assert.equal((await request('DELETE')).status,405);
  for(let i=4;i<19;i++) {
    assert.equal((await request('PUT',body(`rev${i}`,rows.get('owner').plan.revision))).status,200);
  }
  assert.equal(rows.get('owner').history.length,16);
  const history=await (await request('GET',undefined,'a','https://app.invalid','/api/planner/history')).json();
  assert.equal(history.revisions.length,12);
  assert.equal(history.revisions[0].plan.revision,'rev17');
  assert.equal((await request('PUT',body('rev4',rows.get('owner').plan.revision))).status,409);
  assert.equal((await request('PUT',{},'a','https://app.invalid','/api/planner/history')).status,405);
  assert.equal((await request('GET',undefined,'a','https://app.invalid','/api/planner/plan?userId=other')).status,400);
});
