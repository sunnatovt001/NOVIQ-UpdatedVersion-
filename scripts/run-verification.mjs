import {spawnSync} from 'node:child_process';
const npm=process.platform==='win32'?'npm.cmd':'npm';
const compile=spawnSync(process.execPath,['scripts/build-mongo-runtime.mjs'],{stdio:'inherit',windowsHide:true});
if(compile.status!==0)process.exit(compile.status||1);
const checks=[['run','lint'],['--prefix','functions','run','lint'],['test'],['--prefix','server','test'],['run','build']];
for(const args of checks){
  const build=args[0]==='run'&&args[1]==='build';
  // Unit/fixture tests must never inherit a production database switch. The
  // final frontend build still receives its real deployment build settings.
  const env=build?process.env:{...process.env,NODE_ENV:'test',NOVIQ_DATA_BACKEND:'firestore',NOVIQ_FIREBASE_MIRROR:'false'};
  if(!build)for(const name of ['MONGODB_URI','MONGODB_DATABASE','FIREBASE_SERVICE_ACCOUNT_JSON','TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET','CRON_SECRET','GEMINI_API_KEY','PAYMENT_WEBHOOK_SECRET','PAYMENT_CHECKOUT_SECRET',
    'MONGO_FILE_SIGNING_KEY','FIREBASE_MIRROR_ENCRYPTION_KEY'])delete env[name];
  const result=spawnSync(npm,args,{stdio:'inherit',env,shell:process.platform==='win32',windowsHide:true});
  if(result.status!==0)process.exit(result.status||1);
}
