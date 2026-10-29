import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const git=(...args)=>{
  const result=spawnSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,...args],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error('Git operation failed.');return result.stdout;
};
const candidates=git('ls-files','-m','-o','--exclude-standard','-z').split('\0').filter(Boolean);
const selected=candidates.filter(path=>!path.startsWith('artifacts/')&&!path.startsWith('output/')&&!path.startsWith('.playwright-cli/')&&
  !path.startsWith('.runtime/')&&!path.startsWith('backups/')&&(!/(^|\/)\.env/.test(path)||path.endsWith('.env.example')));
const secrets=[];
for(const path of ['.env','.env.local','server/.env'])if(fs.existsSync(path)){
  for(const line of fs.readFileSync(path,'utf8').split(/\r?\n/)){
    const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if(!match||!/(KEY|TOKEN|SECRET|PASSWORD|URI)$/.test(match[1]))continue;
    const value=match[2].replace(/^(['"])(.*)\1$/,'$2');
    if(value.length>=16&&!/REPLACE_|placeholder|your_|example|<db_password>/i.test(value))secrets.push(value);
  }
}
const rejected=[];
for(const path of selected){
  if(!fs.existsSync(path)||!fs.statSync(path).isFile())continue;
  const content=fs.readFileSync(path,'utf8');
  if(secrets.some(value=>content.includes(value))||/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/]{20}/.test(content))rejected.push(path);
}
if(rejected.length){console.error(JSON.stringify({secretScanFailed:rejected}));process.exitCode=1;}
else{
  fs.writeFileSync('.runtime/source-push-files.json',JSON.stringify(selected,null,2));
  console.log(JSON.stringify({sourceFiles:selected.length,excludedLocalArtifacts:candidates.length-selected.length,secretMatches:0}));
  if(process.argv.includes('--stage')){
    for(let offset=0;offset<selected.length;offset+=50)git('add','--',...selected.slice(offset,offset+50));
    console.log('Selected source files staged.');
  }
}
