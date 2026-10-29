import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BSON } from 'mongodb';
const { EJSON } = BSON;

// Explicit application collections only. Never mirror sessions, login proofs,
// the outbox itself or immutable migration archives back into Firebase.
export const mirroredCollections = new Set([
  'notebook_notes', 'planner_plans', 'user_profiles', 'flashcard_records',
  'auth_accounts', 'auth_settings', 'auth_roles',
  'mongo_documents',
  'mongo_files','mongo_file_chunks',
]);
const keyOf = (collection, id) => createHash('sha256').update(EJSON.stringify([collection, id])).digest('hex');
export async function enqueueMirrorRecord(db,collection,row,{key,session,now=()=>new Date()}) {
  if(!mirroredCollections.has(collection)||!row||row._id===undefined)throw new Error('Unsupported mirror source.');
  const entityId=keyOf(collection,row._id);
  const counter=await db.collection('firebase_mirror_counters').findOneAndUpdate({_id:entityId},{$inc:{sequence:1}},
    {upsert:true,returnDocument:'after',session});
  const sequence=counter?.sequence;
  if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error('Invalid mirror sequence.');
  await db.collection('firebase_mirror_outbox').insertOne({_id:`${entityId}:${sequence}`,entityId,sequence,
    envelope:sealMirrorRecord({collection,record:row},key,entityId,sequence),createdAt:now(),state:'pending',attempts:0,nextAttemptAt:now()},{session});
}
export function readMirrorKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('A server-only 32-byte backup encryption key is required.');
  return Buffer.from(value, 'hex');
}
export function sealMirrorRecord(record, key, entityId, sequence) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${entityId}:${sequence}`));
  const ciphertext = Buffer.concat([cipher.update(EJSON.stringify(record, { relaxed: false })), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
export function openMirrorRecord(envelope, key, entityId, sequence) {
  if (envelope?.version !== 1) throw new Error('Unsupported backup envelope.');
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  cipher.setAAD(Buffer.from(`${entityId}:${sequence}`));
  cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const decoded=EJSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]).toString('utf8'), { relaxed: false });
  // Match the MongoDB driver's default numeric promotion without rounding an
  // unsafe 64-bit Long. Strict EJSON otherwise turns every ordinary JS number
  // into an Int32/Double wrapper, breaking application version comparisons.
  const promote=value=>{
    if(value?._bsontype==='Int32'||value?._bsontype==='Double')return value.valueOf();
    if(Array.isArray(value))return value.map(promote);
    if(value&&typeof value==='object'&&!value._bsontype&&!(value instanceof Date))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,promote(v)]));
    return value;
  };
  return promote(decoded);
}

// The database write, per-record sequence and encrypted retry event share one
// transaction. Firebase is never contacted on an application request path.
export function createMirroredDatabase(db, { transaction, key, now = () => new Date() }) {
  if (typeof transaction !== 'function' || !Buffer.isBuffer(key) || key.length !== 32) throw new Error('Mirror transaction and key required.');
  return new Proxy(db, { get(target, property) {
    if (property !== 'collection') { const value = target[property]; return typeof value === 'function' ? value.bind(target) : value; }
    return name => {
      const collection = target.collection(name);
      if (!mirroredCollections.has(name)) return collection;
      return new Proxy(collection, { get(table, method) {
        const original = table[method];
        if (!['insertOne', 'updateOne', 'replaceOne'].includes(method)) {
          if (typeof method === 'string' && /^(delete|insertMany|updateMany|bulkWrite|findOneAnd)/.test(method)) {
            return () => { throw new Error('Unsupported mirrored mutation.'); };
          }
          return typeof original === 'function' ? original.bind(table) : original;
        }
        return async (...args) => {
          const id = args[0]?._id;
          if (id === undefined || id === null || typeof id === 'object') throw new Error('Explicit scalar record ID required for mirroring.');
          return transaction(async session => {
            const optionsIndex = method === 'insertOne' ? 1 : 2;
            const options = { ...(args[optionsIndex] || {}), session };
            if (options.upsert) throw new Error('Explicit mirrored insert required.');
            const values = args.slice(); values[optionsIndex] = options;
            const result = await original.apply(table, values);
            if (method !== 'insertOne' && result.modifiedCount !== 1) return result;
            const row = await table.findOne({ _id: id }, { session });
            if (!row) throw new Error('Mirror source record missing.');
            const entityId = keyOf(name, id);
            const counter = await target.collection('firebase_mirror_counters').findOneAndUpdate(
              { _id: entityId }, { $inc: { sequence: 1 } }, { upsert: true, returnDocument: 'after', session });
            const sequence = counter?.sequence;
            if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid mirror sequence.');
            const envelope = sealMirrorRecord({ collection: name, record: row }, key, entityId, sequence);
            await target.collection('firebase_mirror_outbox').insertOne({ _id: `${entityId}:${sequence}`, entityId,
              sequence, envelope, createdAt: now(), state: 'pending', attempts: 0, nextAttemptAt: now() }, { session });
            return result;
          });
        };
      } });
    };
  } });
}

// A failed delivery remains durable. A success is acknowledged only after the
// destination transaction has committed. Replays/out-of-order events are safe
// because the sink must conditionally advance the per-entity sequence.
export async function deliverMirrorEvent(db, event, sink, { now = () => new Date() } = {}) {
  if (!event || event.state !== 'pending' || !/^[a-f0-9]{64}$/.test(event.entityId) ||
      !Number.isSafeInteger(event.sequence) || event.sequence < 1 || event._id !== `${event.entityId}:${event.sequence}`) throw new Error('Invalid mirror event.');
  try {
    await sink(event);
    await db.collection('firebase_mirror_outbox').updateOne({ _id: event._id, state: 'pending' },
      { $set: { state: 'delivered', deliveredAt: now() } });
    return { delivered: true };
  } catch {
    const attempts = (event.attempts || 0) + 1;
    await db.collection('firebase_mirror_outbox').updateOne({ _id: event._id, state: 'pending' },
      { $set: { attempts, nextAttemptAt: new Date(now().getTime() + Math.min(3600000, 30000 * 2 ** Math.min(attempts, 7))) } });
    return { delivered: false };
  }
}

// Ciphertext is chunked below Firestore's document limit. Each immutable event
// remains recoverable; the manifest is the atomic latest-version pointer.
export function createFirestoreMirrorSink(firestore, namespace) {
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(namespace)) throw new Error('Explicit backup namespace required.');
  const sink = async event => {
    const serialized = JSON.stringify(event.envelope), chunks = [];
    if (serialized.length > 14 * 1024 * 1024) throw new Error('Backup event too large.');
    for (let i = 0; i < serialized.length; i += 250000) chunks.push(serialized.slice(i, i + 250000));
    const root = firestore.collection('mongoBackupNamespaces').doc(namespace);
    const manifest = root.collection('records').doc(event.entityId);
    await firestore.runTransaction(async tx => {
      const previous = await tx.get(manifest);
      if (previous.exists && previous.data().sequence >= event.sequence) return;
      for (let i = 0; i < chunks.length; i++) tx.set(root.collection('chunks').doc(`${event._id}:${i}`),
        { ciphertextChunk: chunks[i], entityId: event.entityId, sequence: event.sequence, index: i });
      tx.set(manifest, { version: 1, sequence: event.sequence, eventId: event._id, chunks: chunks.length,
        hash: createHash('sha256').update(serialized).digest('hex') });
    });
  };
  sink.batch=async events=>{
    if(!Array.isArray(events)||!events.length||events.length>40||new Set(events.map(e=>e.entityId)).size!==events.length)throw new Error('Invalid backup batch.');
    const root=firestore.collection('mongoBackupNamespaces').doc(namespace);
    const prepared=events.map(event=>{
      const serialized=JSON.stringify(event.envelope),chunks=[];
      for(let i=0;i<serialized.length;i+=250000)chunks.push(serialized.slice(i,i+250000));
      return {event,serialized,chunks,manifest:root.collection('records').doc(event.entityId)};
    });
    if(prepared.reduce((sum,item)=>sum+item.serialized.length,0)>6*1024*1024||prepared.some(item=>item.chunks.length>60))throw new Error('Backup batch exceeds transaction budget.');
    await firestore.runTransaction(async tx=>{
      const previous=await tx.getAll(...prepared.map(item=>item.manifest));
      for(let index=0;index<prepared.length;index++){
        const {event,serialized,chunks,manifest}=prepared[index];
        if(previous[index].exists&&previous[index].data().sequence>=event.sequence)continue;
        for(let i=0;i<chunks.length;i++)tx.set(root.collection('chunks').doc(`${event._id}:${i}`),
          {ciphertextChunk:chunks[i],entityId:event.entityId,sequence:event.sequence,index:i});
        tx.set(manifest,{version:1,sequence:event.sequence,eventId:event._id,chunks:chunks.length,
          hash:createHash('sha256').update(serialized).digest('hex')});
      }
    });
  };
  return sink;
}

// Verify every chunk and decrypt locally before any future restore writes.
export function verifyMirrorBackup(manifest, chunks, key, entityId) {
  if (manifest?.version !== 1 || !Number.isSafeInteger(manifest.sequence) || manifest.sequence < 1 ||
      manifest.eventId !== `${entityId}:${manifest.sequence}` || !Array.isArray(chunks) ||
      chunks.length !== manifest.chunks || chunks.length < 1 || chunks.length > 60) throw new Error('Incomplete backup.');
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  if (sorted.some((chunk, index) => chunk.index !== index || chunk.entityId !== entityId ||
      chunk.sequence !== manifest.sequence || typeof chunk.ciphertextChunk !== 'string' || chunk.ciphertextChunk.length > 250000)) throw new Error('Invalid backup chunk.');
  const serialized = sorted.map(chunk => chunk.ciphertextChunk).join('');
  if (createHash('sha256').update(serialized).digest('hex') !== manifest.hash) throw new Error('Backup hash mismatch.');
  const data = openMirrorRecord(JSON.parse(serialized), key, entityId, manifest.sequence);
  if (!mirroredCollections.has(data?.collection) || !data.record || keyOf(data.collection, data.record._id) !== entityId) throw new Error('Backup record identity mismatch.');
  return data;
}
