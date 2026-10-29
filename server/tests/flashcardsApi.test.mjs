import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlashcardsApi,validFlashcardRecord} from '../src/flashcardsApi.mjs';
import {studyHarness} from './helpers/studyHarness.mjs';
const write=(data,baseRevision=0,mutationId='save1')=>({data,baseRevision,mutationId});
const deck={id:'d1',title:'Vocabulary'},card={id:'c1',deckId:'d1',front:'Hello',back:'Salom'};
test('flashcards owner-only CRUD, deck boundaries, retry and concurrent revision protections',async t=>{
  const f=await studyHarness(t,createFlashcardsApi);
  const decks='/api/flashcards/decks',cards=`${decks}/d1/cards`;
  assert.equal((await f.request('GET',decks,undefined,'')).status,401);assert.equal(f.reads(),0);
  assert.equal((await f.request('PUT',`${decks}/d1`,write(deck),'a','https://evil.invalid')).status,403);
  assert.equal((await f.request('PUT',`${decks}/d1`,write({...deck,xp:500}))).status,400);
  assert.equal((await f.request('PUT',`${cards}/c1`,write(card))).status,404);
  assert.equal((await f.request('PUT',`${decks}/d1`,write(deck))).status,201);
  assert.equal((await f.request('PUT',`${cards}/c1`,write(card))).status,201);
  assert.equal((await f.request('PUT',`${cards}/c1`,write(card))).status,200);
  assert.equal((await f.request('GET',`${cards}/c1`,undefined,'b')).status,404);
  assert.equal((await f.request('PUT',`${cards}/c1`,write({...card,deckId:'foreign'},1,'save2'))).status,400);
  const results=await Promise.all([f.request('PUT',`${cards}/c1`,write({...card,front:'Hi'},1,'save2')),f.request('PUT',`${cards}/c1`,write({...card,front:'Hey'},1,'save3'))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const page=await(await f.request('GET',cards)).json();assert.equal(page.records.length,1);assert.equal(page.records[0].userId,undefined);
  assert.equal((await f.request('GET',`${cards}?userId=other`)).status,400);
  assert.equal((await f.request('DELETE',`${decks}/d1`,{baseRevision:1,mutationId:'deleteDeck'})).status,200);
  assert.equal((await f.request('GET',cards)).status,404);
  assert.equal([...f.table('flashcard_records').values()].some(r=>r.kind==='cards'&&r.data.back==='Salom'),true);
});
test('review/session parity: IDs, 200 attempt/card limit, valid attempts and no trusted rewards fields',()=>{
  assert.equal(validFlashcardRecord('reviews',{id:'c1',dueAt:'2026-10-29',reviewCount:0},'c1','d1'),true);
  assert.equal(validFlashcardRecord('reviews',{id:'c2',dueAt:'2026-10-29',reviewCount:0},'c1','d1'),false);
  assert.equal(validFlashcardRecord('reviews',{id:'c1',dueAt:'2026-10-29',reviewCount:-1},'c1','d1'),false);
  const session={id:'s1',deckId:'d1',mode:'classic',cardIds:['c1'],index:0,attempts:[],startedAt:'2026-10-29T00:00:00Z',activeSeconds:0,completed:false};
  assert.equal(validFlashcardRecord('sessions',session,'s1',''),true);
  for(const patch of [{activeSeconds:-1},{xpEarned:500},{cardIds:Array.from({length:201},(_,i)=>`c${i}`)},{cardIds:['c1','c1']},{attempts:[{cardId:'foreign'}]}])
    assert.equal(validFlashcardRecord('sessions',{...session,...patch},'s1',''),false);
});
