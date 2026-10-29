import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createDatabaseConnection,readDatabaseConfig } from '../src/database.mjs';
import { prepareStudyImport } from '../src/studyImport.mjs';
import { verifyStoredArchive } from '../src/migrationArchive.mjs';
import { materializeStudy } from '../src/materializeStudy.mjs';
const {decrypt}=createRequire(import.meta.url)('../../scripts/local-backup.cjs');
let connection;
try {
  const file=process.argv[2];if(!file?.endsWith('.noviq-backup'))throw new Error();
  const config=JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json',import.meta.url),'utf8'));
  const source={project:config.projectId,database:config.firestoreDatabaseId};
  const snapshot=decrypt(fs.readFileSync(file,'utf8'),Buffer.from(fs.readFileSync(`${file}.key`,'utf8').trim(),'hex'));
  const prepared=prepareStudyImport(snapshot,source);
  if(!process.argv.includes('--execute'))console.log(JSON.stringify({mode:'preview',snapshotId:prepared.snapshotId,
    profiles:prepared.profiles.length,plans:prepared.plans.length,notes:prepared.notes.length,flashcards:prepared.flashcards.length,cutover:false}));
  else {
    const target=readDatabaseConfig();if(!target.database.endsWith('_staging'))throw new Error();
    connection=createDatabaseConnection(target);const db=await connection.getDatabase();
    const manifest=await db.collection('migration_manifests').findOne({_id:prepared.snapshotId});
    await verifyStoredArchive(db,manifest,source);
    console.log(JSON.stringify(await materializeStudy(db,prepared,work=>connection.transaction(work))));
  }
} catch {
  console.error('Study materialization stopped. Check archive verification, migrated owners, existing-data conflicts or transaction access. No Firebase records changed.');
  process.exitCode=1;
} finally {if(connection)await connection.close();}
