import { execSync } from 'node:child_process';

const output = execSync('netstat -ano', { encoding: 'utf8' });
const lines = output.split('\n');
const ports = [3000, 3001, 3002];
const listeners = [];

for (const line of lines) {
  if (line.includes('LISTENING')) {
    for (const port of ports) {
      const regex = new RegExp(`:${port}\\s+.*LISTENING\\s+(\\d+)`, 'i');
      const match = line.match(regex);
      if (match) {
        listeners.push({ port, pid: match[1], line: line.trim() });
      }
    }
  }
}

console.log('--- FOUND PORT LISTENERS ---');
console.log(listeners);

for (const l of listeners) {
  try {
    const cmd = `Get-Process -Id ${l.pid} | Select-Object Id, ProcessName, Path, StartTime | Format-List`;
    const details = execSync(`powershell -NoProfile -Command "${cmd}"`, { encoding: 'utf8' });
    console.log(`\n=== Port ${l.port} (PID ${l.pid}) ===\n${details}`);
    
    const wmic = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId = ${l.pid}').CommandLine"`, { encoding: 'utf8' });
    console.log(`Command line:\n${wmic.trim()}\n`);
  } catch (err) {
    console.log(`Failed to get details for PID ${l.pid}: ${err.message}`);
  }
}
