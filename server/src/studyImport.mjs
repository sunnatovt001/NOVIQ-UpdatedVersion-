import { digest, prepareArchive } from './migrationArchive.mjs';
import { validMongoPlan } from './plannerApi.mjs';
import {validFlashcardRecord} from './flashcardsApi.mjs';

// Convert only values the application can represent exactly. The original native
// values stay in the immutable migration archive; unsupported values fail closed.
export function decodeFirestoreValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) throw new Error('Invalid native value.');
  if ('stringValue' in value && typeof value.stringValue === 'string') return value.stringValue;
  if ('booleanValue' in value && typeof value.booleanValue === 'boolean') return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('integerValue' in value && /^-?\d+$/.test(String(value.integerValue))) {
    const number = Number(value.integerValue);
    if (!Number.isSafeInteger(number)) throw new Error('Integer precision would be lost.');
    return number;
  }
  if ('doubleValue' in value && typeof value.doubleValue === 'number' && Number.isFinite(value.doubleValue)) return value.doubleValue;
  if ('timestampValue' in value && typeof value.timestampValue === 'string' && Number.isFinite(Date.parse(value.timestampValue))) return value.timestampValue;
  if ('arrayValue' in value && value.arrayValue && typeof value.arrayValue === 'object') {
    const values = value.arrayValue.values ?? [];
    if (!Array.isArray(values)) throw new Error('Invalid array.');
    return values.map(decodeFirestoreValue);
  }
  if ('mapValue' in value && value.mapValue && typeof value.mapValue === 'object') {
    const fields = value.mapValue.fields ?? {};
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Invalid map.');
    return Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,decodeFirestoreValue(v)]));
  }
  throw new Error('Unsupported application value; retain native archive.');
}
const decodeFields = fields => Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,decodeFirestoreValue(v)]));

export function prepareStudyImport(snapshot, source) {
  if (snapshot.project !== source.project || snapshot.database !== source.database) throw new Error('Source mismatch.');
  const archive = prepareArchive(snapshot), notes = [], plans = [], profiles = [], flashcards = [], recovery = [];
  const cleanPlan = data => Object.fromEntries(Object.entries(data).filter(([key]) => !['syncStatus','syncedAt'].includes(key)));
  const histories = new Map();
  for (const document of snapshot.documents) {
    const path = document.path.split('/');
    if (path.length !== 4 || path[0] !== 'users' || path[2] !== 'plannerHistory') continue;
    const data = decodeFields(document.fields);
    if (data.id !== path[3] || data.userId !== path[1] || !Number.isFinite(data.createdAt) ||
        typeof data.description !== 'string' || !data.plan || !validMongoPlan(cleanPlan(data.plan),path[1])) throw new Error('Invalid source planner history.');
    const rows = histories.get(path[1]) || [];
    rows.push({ ...data, plan: cleanPlan(data.plan) }); histories.set(path[1],rows);
  }
  for (const document of snapshot.documents) {
    const path = document.path.split('/');
    if(path[0]==='users'&&path.length===2) {
      const data=decodeFields(document.fields);
      if(data.uid!==undefined&&data.uid!==path[1])throw new Error('Profile UID mismatch.');
      profiles.push({_id:path[1],data:{...data,uid:path[1]},revision:1,sourceSnapshot:archive.id,sourceFieldsJson:JSON.stringify(document.fields)});
      continue;
    }
    const flashKind=path[0]==='users'&&path.length===4&&path[2]==='decks'?'decks':
      path[0]==='users'&&path.length===4&&path[2]==='flashcardSessions'?'sessions':
      path[0]==='users'&&path.length===6&&path[2]==='decks'&&['cards','reviews'].includes(path[4])?path[4]:null;
    if(flashKind) {
      const userId=path[1],parentId=path.length===6?path[3]:'',id=path.at(-1),data=decodeFields(document.fields);
      if(data.id!==undefined&&data.id!==id)throw new Error('Flashcard ID mismatch.');
      const normalized={...data,id};
      // A source sync-only deck is recoverable evidence, not a real empty deck.
      // Retain it explicitly and block activation instead of inventing a title.
      if (flashKind==='decks' && typeof data.title !== 'string') {
        recovery.push({_id:document.path,reason:'sync-only-deck',sourceFieldsJson:JSON.stringify(document.fields)});
        continue;
      }
      if(flashKind==='cards') {
        if(data.deckId!==undefined&&data.deckId!==parentId)throw new Error('Card deck mismatch.');
        normalized.deckId=parentId;
        normalized.front=data.front??data.question??data.term;
        normalized.back=data.back??data.answer??data.definition;
        if (normalized.front === undefined || normalized.back === undefined) {
          recovery.push({_id:document.path,reason:'incomplete-source-card',sourceFieldsJson:JSON.stringify(document.fields)});
          continue;
        }
      }
      if(!validFlashcardRecord(flashKind,normalized,id,parentId))throw new Error('Invalid source flashcard record.');
      flashcards.push({_id:JSON.stringify([userId,flashKind,parentId,id]),userId,kind:flashKind,parentId,id,data:normalized,
        deleted:false,revision:1,sourceSnapshot:archive.id,sourceFieldsJson:JSON.stringify(document.fields)});
      continue;
    }
    if (path.length !== 4 || path[0] !== 'users') continue;
    if (path[2] !== 'notebookNotes' && !(path[2] === 'planner' && path[3] === 'smart-v2')) continue;
    const userId = path[1], id = path[3], data = decodeFields(document.fields);
    if (path[2] === 'notebookNotes') {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || typeof data.title !== 'string' || typeof data.content !== 'string' ||
          !Array.isArray(data.tags ?? []) || (data.tags ?? []).some(t => typeof t !== 'string')) throw new Error('Invalid source note.');
      const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
      notes.push({ _id: JSON.stringify([userId,id]), userId, id, title:data.title,content:data.content,tags:data.tags ?? [],
        createdAt:date(data.createdAt),updatedAt:date(data.updatedAt),revision:1,deleted:false,
        sourceSnapshot:archive.id, sourceFieldsJson:JSON.stringify(document.fields) });
    } else {
      const plan = cleanPlan(data);
      if (!validMongoPlan(plan,userId)) throw new Error('Invalid source plan.');
      const history = (histories.get(userId) || []).sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id));
      plans.push({ _id:userId, plan, history, sourceSnapshot:archive.id,
        sourceFieldsJson:JSON.stringify(document.fields) });
    }
  }
  for (const [uid,rows] of histories) if (!plans.some(plan=>plan._id===uid)) {
    for(const row of rows) recovery.push({_id:`users/${uid}/plannerHistory/${row.id}`,reason:'orphan-planner-history',payloadJson:JSON.stringify(row)});
  }
  return { snapshotId:archive.id,readTime:snapshot.readTime,notes,plans,profiles,flashcards,recovery };
}

export async function stageStudyImport(db, prepared) {
  // Snapshot-scoped staging, never writes the active notebook/planner collections.
  for (const [kind, rows] of [['note',prepared.notes],['plan',prepared.plans],['profile',prepared.profiles],['flashcard',prepared.flashcards],['recovery',prepared.recovery || []]]) {
    for (const row of rows) {
      const storedRow = { _id:`${prepared.snapshotId}:${kind}:${row._id}`,snapshotId:prepared.snapshotId,kind,payloadJson:JSON.stringify(row) };
      const collection = db.collection('migration_study_previews');
      try { await collection.insertOne(storedRow); } catch(error) { if(error.code!==11000)throw new Error('Study staging failed.'); }
      if (digest(await collection.findOne({_id:storedRow._id}))!==digest(storedRow)) throw new Error('Study staging integrity mismatch.');
    }
  }
  return { snapshotId:prepared.snapshotId,readTime:prepared.readTime,notes:prepared.notes.length,plans:prepared.plans.length,
    profiles:prepared.profiles.length,flashcards:prepared.flashcards.length,
    recoveryRecords:(prepared.recovery || []).length,historyRecords:prepared.plans.reduce((n,row)=>n+row.history.length,0),
    verified:true,applicationWrites:0,sourceWrites:0,historyActivationReady:false,cutover:false };
}
