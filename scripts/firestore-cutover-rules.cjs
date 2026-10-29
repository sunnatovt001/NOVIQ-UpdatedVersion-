const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
  const mode=process.argv[2],cloud=await require('./cloud-client.cjs')(process.argv[3]);await cloud.db.terminate();
  const {config,cli}=cloud,rules=require(path.join(cli,'lib/gcp/rules.js'));
  const name=`projects/${config.projectId}/releases/cloud.firestore/${config.firestoreDatabaseId}`;
  const releases=await rules.listAllReleases(config.projectId),release=releases.find(r=>r.name===name);
  if(!release)throw new Error('Exact database rules release not found.');
  const files=await rules.getRulesetContent(release.rulesetName);
  if(!Array.isArray(files)||files.length!==1)throw new Error('Unexpected rules source layout.');
  const hash=text=>crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n').trim()).digest('hex');
  fs.mkdirSync('.runtime/cutover',{recursive:true});
  const receipt='.runtime/cutover/rules-original.json';
  if(mode==='inspect'){
    console.log(JSON.stringify({release:name,matchesRepository:hash(files[0].content)===hash(fs.readFileSync('firestore.rules','utf8')),ruleset:release.rulesetName}));return;
  }
  if(mode==='freeze'){
    if(fs.existsSync(receipt))throw new Error('Existing cutover receipt requires inspection before another freeze.');
    if(hash(files[0].content)!==hash(fs.readFileSync('firestore.rules','utf8')))throw new Error('Live rules differ from the tested policy.');
    const content=files[0].content.replace(/allow\s+([a-z,\s]+):\s*if\s+([^;]*);/g,(_match,verbs,condition)=>{
      const actions=verbs.split(',').map(v=>v.trim()),read=actions.filter(v=>['read','get','list'].includes(v));
      return `${read.length?`allow ${read.join(', ')}: if ${condition};\n`:''}allow create, update, delete: if false;`;
    });
    const validation=await rules.testRuleset(config.projectId,[{name:'firestore.rules',content}]);
    if(validation.body.issues?.some(issue=>issue.severity==='ERROR'))throw new Error('Read-only rules validation failed.');
    fs.writeFileSync(receipt,JSON.stringify({release,files,frozenAt:new Date().toISOString()},null,2),{flag:'wx'});
    const ruleset=await rules.createRuleset(config.projectId,[{name:'firestore.rules',content}]);
    await rules.updateRelease(config.projectId,ruleset,`cloud.firestore/${config.firestoreDatabaseId}`);
    fs.writeFileSync('.runtime/cutover/rules-frozen.json',JSON.stringify({ruleset,frozenAt:new Date().toISOString()}));
    console.log(JSON.stringify({sourceClientWritesFrozen:true,readsPreserved:true,authUnchanged:true,sourceRecordsDeleted:0}));return;
  }
  if(mode==='restore'){
    const original=JSON.parse(fs.readFileSync(receipt,'utf8'));if(original.release.name!==name)throw new Error('Restore target mismatch.');
    await rules.updateRelease(config.projectId,original.release.rulesetName,`cloud.firestore/${config.firestoreDatabaseId}`);
    console.log('Original source rules restored.');return;
  }
  if(mode==='refreeze'){
    const original=JSON.parse(fs.readFileSync(receipt,'utf8')),frozen=JSON.parse(fs.readFileSync('.runtime/cutover/rules-frozen.json','utf8'));
    if(original.release.name!==name||release.rulesetName!==original.release.rulesetName||!frozen.ruleset.startsWith(`projects/${config.projectId}/rulesets/`))throw new Error('Previously verified rules target mismatch.');
    await rules.updateRelease(config.projectId,frozen.ruleset,`cloud.firestore/${config.firestoreDatabaseId}`);
    console.log(JSON.stringify({sourceClientWritesFrozen:true,sourceRecordsPreserved:true,authUnchanged:true}));return;
  }
  throw new Error('Use inspect, freeze, or restore.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
