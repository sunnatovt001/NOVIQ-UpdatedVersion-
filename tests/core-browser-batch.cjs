// One isolated fixture server, independent browser contexts in each child.
const { spawn } = require('node:child_process');
const suites = ['tests/browser-check.cjs', 'tests/core-ai-browser.cjs', 'tests/planner-populated-browser.cjs'];
const children = [];
const checks = suites.map(suite => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [suite], { stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve(suite) : reject(new Error(`${suite} exited with ${code}`)));
}));
Promise.all(checks).then(passed => {
  console.log(`PASS core browser batch: ${passed.join(', ')}`);
}).catch(error => {
  console.error(error);
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = 1;
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exit(1);
});
