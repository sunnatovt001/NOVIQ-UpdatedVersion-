import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAdminApi } from '../src/adminApi.mjs';
test('Firestore admin notebook read parity never grants ordinary users access or exposes archive metadata',async t=>{
  let admin=false,reads=0;
  const db={collection(name){
    if(name==='auth_roles')return {findOne:async()=>({isAdmin:admin})};
    assert.equal(name,'notebook_notes');return {find(){reads++;return {sort(){return this;},limit(){return this;},maxTimeMS(){return this;},
      async toArray(){return [{_id:'["other","n1"]',userId:'other',id:'n1',title:'Note',content:'Authorized admin read',tags:[],sourceFieldsJson:'hidden archive',mutationHash:'hidden hash'}];}};}};
  }};
  const server=http.createServer(createAdminApi(db,{resolve:async token=>token==='a'.repeat(64)?{uid:'admin'}:null}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api/admin/notebook-notes`,headers={Cookie:`__Host-noviq_session=${'a'.repeat(64)}`};
  assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers})).status,403);assert.equal(reads,0);
  admin=true;const response=await fetch(url,{headers});assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.notes[0].userId,'other');assert.equal(data.notes[0].sourceFieldsJson,undefined);
  assert.equal(data.notes[0].mutationHash,undefined);
  assert.equal((await fetch(`${url}?after=invalid`,{headers})).status,400);
  assert.equal((await fetch(url,{method:'PUT',headers})).status,405);
});
