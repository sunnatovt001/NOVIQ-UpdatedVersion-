import { execSync } from 'node:child_process';

try {
  const script = `
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | Select-Object ProcessId, CommandLine | ForEach-Object {
  Write-Host "PID: $($_.ProcessId)"
  Write-Host "CMD: $($_.CommandLine)"
  Write-Host "--------------------------------"
}
`;
  const output = execSync(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, { encoding: 'utf8' });
  console.log(output);
} catch (e) {
  console.error(e.message);
}
