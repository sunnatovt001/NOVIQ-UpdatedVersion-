const test=require('node:test'),assert=require('node:assert/strict');
const {backendConfiguration}=require('./backendConfig.cjs');
test('deployments reject misspelled or mismatched data authorities',()=>{
  assert.deepEqual(backendConfiguration({}, {match:true}),{client:'firestore',server:'firestore'});
  assert.deepEqual(backendConfiguration({VITE_DATA_BACKEND:'mongodb',NOVIQ_DATA_BACKEND:'mongodb'},{match:true}),{client:'mongodb',server:'mongodb'});
  assert.throws(()=>backendConfiguration({VITE_DATA_BACKEND:'mongodb'},{match:true}),/same data authority/);
  assert.throws(()=>backendConfiguration({NOVIQ_DATA_BACKEND:'mongo'}),/firestore or mongodb/);
});
