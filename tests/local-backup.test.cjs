const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {encrypt,decrypt,restoreLocal}=require('../scripts/local-backup.cjs');
test('encrypted backups preserve Firestore value types and reject tampering/wrong keys',()=>{
  const original={version:1,documents:[{path:'users/test',fields:{privateText:{stringValue:'private fixture content'},stamp:{timestampValue:'2026-01-02T01:02:03.123456Z'},integer:{integerValue:'9223372036854775807'},nested:{mapValue:{fields:{flag:{booleanValue:true}}}}}}]};
  const key=randomBytes(32),encrypted=encrypt(original,key);
  assert.ok(!encrypted.includes('private fixture content'));
  assert.deepEqual(decrypt(encrypted,key),original);
  assert.throws(()=>decrypt(encrypted,randomBytes(32)));
  const broken=JSON.parse(encrypted);broken.tag=randomBytes(16).toString('base64');
  assert.throws(()=>decrypt(JSON.stringify(broken),key));
});
test('restore tool refuses production and all destinations except the fixed local emulator',async()=>{
  const previous=process.env.FIRESTORE_EMULATOR_HOST;
  process.env.FIRESTORE_EMULATOR_HOST='firestore.googleapis.com';
  try{await assert.rejects(restoreLocal({documents:[]}),/isolated local emulator/);}
  finally{if(previous===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=previous;}
});
