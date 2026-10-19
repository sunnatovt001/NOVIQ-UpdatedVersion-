const {spawnSync}=require('node:child_process');
for(const [suite,env] of [['tests/core-ai-browser.cjs',{}],['tests/browser-check.cjs',{NOVIQ_AUTH_ONLY:'1'}]]){
 const result=spawnSync(process.execPath,[suite],{stdio:'inherit',env:{...process.env,...env}});
 if(result.status!==0)process.exit(result.status||1);
}
