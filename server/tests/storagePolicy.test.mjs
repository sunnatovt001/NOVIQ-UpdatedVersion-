import test from 'node:test';
import assert from 'node:assert/strict';
import { allowStorageOperation as allow } from '../src/storagePolicy.mjs';
test('Storage parity: owner-only paths and strict upload byte boundaries', () => {
  for (const path of ['users/a/avatars/photo','users/a/flashcards/deck/photo','users/a/notebookSources/book']) {
    assert.equal(allow({ uid:'a', path, action:'read' }),true);
    assert.equal(allow({ uid:'b', path, action:'read' }),false);
    assert.equal(allow({ uid:'a', path, action:'delete' }),true);
    const limit = (path.includes('notebookSources') ? 25 : 8) * 1024 * 1024;
    assert.equal(allow({ uid:'a', path, action:'create', size:limit-1, contentType:'image/png' }),true);
    assert.equal(allow({ uid:'a', path, action:'create', size:limit, contentType:'image/png' }),false);
  }
  assert.equal(allow({ uid:'a', path:'users/a/avatars/photo',action:'create',size:100,contentType:'text/html' }),false);
  assert.equal(allow({ uid:'a', path:'users/a/notebookSources/book',action:'create',size:100,contentType:'application/pdf' }),true);
  for (const path of ['public/image','users/a/other/file','users/a/avatars/../secret','users/a/avatars/file/extra'])
    assert.equal(allow({ uid:'a',path,action:'read' }),false);
});
