import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createMongoFilesApi} from '../src/mongoFiles.mjs';
import {canonicalMemory} from './helpers/canonicalMemory.mjs';
test('chunked files preserve byte integrity, owner policy, private download capability and recoverable deletion',async t=>{
  const f=canonicalMemory(),handler=createMongoFilesApi({getDatabase:async()=>f.db,transaction:f.transaction,
    origins:['https://app.invalid'],key:Buffer.alloc(32,7),verify:async token=>token==='a'?{uid:'a'}:token==='b'?{uid:'b'}:null});
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(body,token='a')=>fetch(base,{method:'POST',headers:{Origin:'https://app.invalid',Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await call({action:'begin',path:'users/b/notebookSources/file',size:5,contentType:'application/pdf'})).status,400);
  assert.equal((await call({action:'begin',path:'users/a/avatars/file',size:8*1024*1024,contentType:'image/png'})).status,400);
  const begin=await (await call({action:'begin',path:'users/a/notebookSources/file',size:5,contentType:'application/pdf'})).json();
  assert.ok(begin.id);assert.equal(begin.chunkSize,512*1024);
  assert.equal((await call({action:'complete',id:begin.id})).status,409);
  assert.equal((await call({action:'chunk',id:begin.id,index:0,base64:Buffer.from('hello').toString('base64')},'b')).status,404);
  assert.equal((await call({action:'chunk',id:begin.id,index:0,base64:Buffer.from('hello').toString('base64')})).status,200);
  assert.equal((await call({action:'chunk',id:begin.id,index:0,base64:Buffer.from('hello').toString('base64')})).status,200);
  assert.equal((await call({action:'chunk',id:begin.id,index:0,base64:Buffer.from('wrong').toString('base64')})).status,409);
  const complete=await (await call({action:'complete',id:begin.id})).json();assert.ok(complete.url);
  const downloaded=await fetch(base+complete.url);assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),'hello');
  assert.match(downloaded.headers.get('content-security-policy'),/sandbox/);
  assert.equal((await fetch(base+complete.url.replace(/token=.*/,'token='+'0'.repeat(64)))).status,403);
  assert.equal((await call({action:'delete',id:begin.id},'b')).status,404);
  assert.equal((await call({action:'delete',id:begin.id})).status,200);
  assert.equal((await fetch(base+complete.url)).status,404);
  assert.equal(f.table('mongo_file_chunks').size,1);
});
