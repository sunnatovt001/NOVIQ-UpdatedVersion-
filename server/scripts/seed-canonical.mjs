import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createDatabaseConnection,readDatabaseConfig} from '../src/database.mjs';
import {prepareArchive,digest,verifyStoredArchive} from '../src/migrationArchive.mjs';
import {databaseNamespace} from '../src/databaseNamespace.mjs';
import {nativeFields,pack} from '../../shared/mongoValues.mjs';
const {decrypt}=createRequire(import.meta.url)('../../scripts/local-backup.cjs');
let connection;
try{
  const file=process.argv[2];if(!file?.endsWith('.noviq-backup'))throw new Error();
  const source=JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json',import.meta.url),'utf8'));
  const snapshot=decrypt(fs.readFileSync(file,'utf8'),Buffer.from(fs.readFileSync(`${file}.key`,'utf8').trim(),'hex'));
  if(snapshot.project!==source.projectId||snapshot.database!==source.firestoreDatabaseId)throw new Error();
  const archive=prepareArchive(snapshot);
  // The encrypted disaster-recovery namespace is an archive, not application
  // data. Re-importing it into the live store would recursively back up backups.
  const rows=snapshot.documents.filter(document=>!document.path.startsWith('mongoBackupNamespaces/')).map(document=>{
    const parts=document.path.split('/');return {_id:document.path,parent:parts.slice(0,-1).join('/'),collectionGroup:parts.at(-2),id:parts.at(-1),
      data:pack(nativeFields(document.fields)),deleted:false,version:1,sourceSnapshot:archive.id,sourceHash:digest(document.fields),updatedAt:new Date(snapshot.readTime)};
  });
  if(process.argv.includes('--execute')){
    const config=readDatabaseConfig();if(!config.database.endsWith('_staging'))throw new Error();
    connection=createDatabaseConnection(config);const raw=await connection.getDatabase();
    await verifyStoredArchive(raw,await raw.collection('migration_manifests').findOne({_id:archive.id}),{project:snapshot.project,database:snapshot.database});
    const prefix=process.env.MONGODB_COLLECTION_PREFIX||'',db=databaseNamespace(raw,prefix),collection=db.collection('mongo_documents');
    // This importer never replaces application writes. A later delta needs an
    // explicit source-freeze reconciliation, not an unconditional overwrite.
    for(let offset=0;offset<rows.length;offset+=100){
      const batch=rows.slice(offset,offset+100);
      await collection.bulkWrite(batch.map(row=>({updateOne:{filter:{_id:row._id},update:{$setOnInsert:row},upsert:true}})),{ordered:false,writeConcern:{w:'majority'}});
      const saved=await collection.find({_id:{$in:batch.map(row=>row._id)}}).limit(101).maxTimeMS(10000).toArray();
      const byId=new Map(saved.map(row=>[row._id,row]));
      if(saved.length!==batch.length||batch.some(row=>!byId.get(row._id)||digest(byId.get(row._id).data)!==digest(row.data)||byId.get(row._id).version!==1||byId.get(row._id).deleted))throw new Error();
    }
    const receipt={_id:archive.id,documents:rows.length,readTime:snapshot.readTime,prefix,verified:true,productionCutover:false};
    await db.collection('mongo_baselines').updateOne({_id:archive.id},{$setOnInsert:receipt},{upsert:true});
    console.log(JSON.stringify({...receipt,sourceWrites:0}));
  }else console.log(JSON.stringify({mode:'preview',documents:rows.length,snapshotId:archive.id,sourceWrites:0}));
}catch{console.error('Canonical import stopped. Check source/archive integrity, existing application writes, namespace or Atlas access. No Firebase data changed.');process.exitCode=1;}
finally{if(connection)await connection.close();}
