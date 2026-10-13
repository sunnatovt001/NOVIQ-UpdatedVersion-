const { spawn } = require('node:child_process');
const children = [];
Promise.all(['tests/browser-check.cjs', 'tests/navigation-timing.cjs'].map(suite => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [suite], { stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${suite} exited with ${code}`)));
}))).then(() => console.log('PASS navigation cache recovery and timing batch')).catch(error => {
  console.error(error);
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = 1;
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exit(1);
});
