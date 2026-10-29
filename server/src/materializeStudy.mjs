import { digest } from './migrationArchive.mjs';

// Populate staging application collections only after the native archive has
// been independently verified. Existing application data is never overwritten.
export async function materializeStudy(db, prepared, transaction) {
  const groups = [['notebook_notes',prepared.notes],['planner_plans',prepared.plans],
    ['user_profiles',prepared.profiles],['flashcard_records',prepared.flashcards]];
  return transaction(async session => {
    const owners = new Set(prepared.profiles.map(row=>row._id));
    for (const uid of owners) if (!await db.collection('auth_accounts').findOne({_id:uid},{session})) throw new Error('Missing migrated identity.');
    const counts = {};
    for (const [name,rows] of groups) {
      const collection = db.collection(name); counts[name]=rows.length;
      for (const row of rows) {
        const uid = name==='user_profiles'||name==='planner_plans'?row._id:row.userId;
        if (!owners.has(uid) || row.sourceSnapshot !== prepared.snapshotId) throw new Error('Unexpected staging owner/source.');
        const previous = await collection.findOne({_id:row._id},{session});
        if (previous) {
          if (digest(previous)!==digest(row)) throw new Error('Existing application record conflict.');
        } else await collection.insertOne(row,{session});
        if (digest(await collection.findOne({_id:row._id},{session}))!==digest(row)) throw new Error('Application staging read-back mismatch.');
      }
    }
    const receipt = {_id:prepared.snapshotId,counts,readTime:prepared.readTime,
      recoveryRecords:prepared.recovery.length,historyRecords:prepared.plans.reduce((n,row)=>n+row.history.length,0),
      applicationCutover:false};
    const collection=db.collection('migration_study_materializations');
    const previous=await collection.findOne({_id:receipt._id},{session});
    if(previous) {if(digest(previous)!==digest(receipt))throw new Error('Staging receipt conflict.');}
    else await collection.insertOne(receipt,{session});
    return {...receipt,verified:true,sourceWrites:0};
  });
}
