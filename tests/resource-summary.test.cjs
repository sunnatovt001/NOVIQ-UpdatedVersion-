const test = require('node:test');
const assert = require('node:assert/strict');
test('startup resources distinguish repeated observations from unique encoded assets', async () => {
  const { summarizeResources } = await import('../scripts/resource-summary.mjs');
  assert.deepEqual(summarizeResources([{name:'logo',bytes:50},{name:'logo',bytes:50},{name:'logo',bytes:0},{name:'app-v1',bytes:100},{name:'app-v2',bytes:90}]), {
    observedEncodedBodyBytes: 290, uniqueEncodedBodyBytes: 240, repeatedResourceEntries: 2,
  });
  assert.deepEqual(summarizeResources([]), { observedEncodedBodyBytes:0, uniqueEncodedBodyBytes:0, repeatedResourceEntries:0 });
  assert.equal(summarizeResources([{name:'bad',bytes:NaN},{name:'negative',bytes:-1}]).uniqueEncodedBodyBytes,0);
});
