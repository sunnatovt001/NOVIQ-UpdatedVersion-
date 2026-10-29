import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFirebaseIdentity } from '../src/firebaseIdentity.mjs';
import { legacyProject } from '../src/googleBridge.mjs';
import { createAuthApi } from '../src/authApi.mjs';
import { studyHarness } from './helpers/studyHarness.mjs';
const timestamp=1800000000, token='synthetic'.repeat(20);
const claims=()=>({uid:'owner',sub:'owner',aud:legacyProject,iss:`https://securetoken.google.com/${legacyProject}`,
  iat:timestamp,exp:timestamp+3600,firebase:{sign_in_provider:'password'},email:'Owner@example.invalid',email_verified:true,name:'Owner',admin:true});
test('Firebase Auth bridge supports existing providers and returns identity without trusting role claims as account fields',async()=>{
  const result=await verifyFirebaseIdentity(token,{verify:async()=>claims(),now:()=>timestamp*1000});
  assert.deepEqual(result,{uid:'owner',project:legacyProject,email:'owner@example.invalid',emailVerified:true,displayName:'Owner'});
  for(const provider of ['google.com','password','custom'])assert.ok(await verifyFirebaseIdentity(token,{verify:async()=>({...claims(),firebase:{sign_in_provider:provider}}),now:()=>timestamp*1000}));
  for(const patch of [{sub:'other'},{aud:'other'},{iss:'fake'},{exp:timestamp},{iat:timestamp-3601},{iat:timestamp+31},{firebase:{}}])
    assert.equal(await verifyFirebaseIdentity(token,{verify:async()=>({...claims(),...patch}),now:()=>timestamp*1000}),null);
  assert.equal(await verifyFirebaseIdentity(token,{verify:async()=>{throw new Error('revoked');}}),null);
});
test('session exchange is opt-in, origin-bound, preserves UID and rejects disabled accounts and submitted identity fields',async t=>{
  let calls=0,issuedUid,requestedLifetime;
  const h=await studyHarness(t,(db,sessions,options)=>{
    sessions.create=async(uid,remember,lifetime)=>{issuedUid=uid;requestedLifetime=lifetime;return {token:'c'.repeat(64)};};
    sessions.revoke=async()=>{};
    sessions.resolve=async()=>issuedUid?{uid:issuedUid,email:'owner@example.invalid',displayName:'Owner',emailVerified:true}:null;
    return createAuthApi(db,sessions,{...options,firebaseIdentityEnabled:true,firebaseVerify:async value=>{
      calls++;return value===token?{uid:'owner',project:legacyProject,email:'owner@example.invalid',displayName:'Owner',emailVerified:true}:null;
    }});
  });
  assert.equal((await h.request('POST','/api/auth/firebase',{idToken:token},'','https://evil.invalid')).status,403);
  assert.equal(calls,0);
  assert.equal((await h.request('POST','/api/auth/firebase',{idToken:token,uid:'other'})).status,400);
  assert.equal((await h.request('POST','/api/auth/firebase',{idToken:'invalid'})).status,401);
  const response=await h.request('POST','/api/auth/firebase',{idToken:token});
  assert.equal(response.status,200);assert.equal((await response.json()).user.uid,'owner');
  assert.equal(requestedLifetime,3600000);
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  assert.equal(h.table('auth_accounts').size,1);assert.equal(h.table('auth_roles').size,0);
  for (const path of ['login','google','telegram']) assert.equal((await h.request('POST',`/api/auth/${path}`,{email:'owner@example.invalid',password:'archived-password'})).status,404);
  h.table('auth_accounts').get('owner').disabled=true;
  assert.equal((await h.request('POST','/api/auth/firebase',{idToken:token})).status,401);
  const disabled=await studyHarness(t,createAuthApi);
  assert.equal((await disabled.request('POST','/api/auth/firebase',{idToken:token})).status,404);
});
