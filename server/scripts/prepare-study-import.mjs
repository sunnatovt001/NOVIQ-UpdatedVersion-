import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createDatabaseConnection,readDatabaseConfig } from '../src/database.mjs';
import { prepareStudyImport,stageStudyImport } from '../src/studyImport.mjs';
const { decrypt }=createRequire(import.meta.url)('../../scripts/local-backup.cjs');
let connection;
try {
  const file=process.argv[2];
  if(!file?.endsWith('.noviq-backup'))throw new Error('Encrypted Firestore backup required.');
  const config=JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json',import.meta.url),'utf8'));
  const key=Buffer.from(fs.readFileSync(`${file}.key`,'utf8').trim(),'hex');
  if(key.length!==32)throw new Error('Invalid key.');
  const prepared=prepareStudyImport(decrypt(fs.readFileSync(file,'utf8'),key),{project:config.projectId,database:config.firestoreDatabaseId});
  if(process.argv.includes('--execute')) {
    const target=readDatabaseConfig();
    if(!target.database.endsWith('_staging'))throw new Error('Staging required.');
    connection=createDatabaseConnection(target);
    console.log(JSON.stringify(await stageStudyImport(await connection.getDatabase(),prepared)));
  } else console.log(JSON.stringify({mode:'preview',snapshotId:prepared.snapshotId,readTime:prepared.readTime,
    notes:prepared.notes.length,plans:prepared.plans.length,profiles:prepared.profiles.length,
    flashcards:prepared.flashcards.length,recoveryRecords:prepared.recovery.length,
    historyRecords:prepared.plans.reduce((n,row)=>n+row.history.length,0),applicationWrites:0,cutover:false}));
} catch {
  console.error('Study import preparation failed; source data, account details and keys are not printed.');process.exitCode=1;
} finally {if(connection)await connection.close();}
