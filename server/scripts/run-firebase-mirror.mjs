import fs from 'node:fs';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createDatabaseConnection, readDatabaseConfig } from '../src/database.mjs';
import { createFirestoreMirrorSink, deliverMirrorEvent } from '../src/firebaseMirror.mjs';
let connection, app;
try {
  if (!process.argv.includes('--execute') || process.env.NOVIQ_FIREBASE_MIRROR !== 'true') throw new Error('Explicit mirror activation required.');
  const source = JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8'));
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  if (credentials.project_id !== source.projectId) throw new Error('Unexpected backup project.');
  const namespace = process.env.FIREBASE_MIRROR_NAMESPACE;
  const config = readDatabaseConfig();
  if (namespace !== config.database) throw new Error('Backup namespace must match the source MongoDB database.');
  app = initializeApp({ credential: cert(credentials), projectId: source.projectId }, 'noviq-mirror-worker');
  const sink = createFirestoreMirrorSink(getFirestore(app, source.firestoreDatabaseId), namespace);
  connection = createDatabaseConnection(config);
  const db = await connection.getDatabase(), queue = db.collection('firebase_mirror_outbox');
  await queue.createIndex({ state: 1, nextAttemptAt: 1, createdAt: 1 });
  const events = await queue.find({ state: 'pending', nextAttemptAt: { $lte: new Date() } })
    .sort({ createdAt: 1 }).limit(50).maxTimeMS(5000).toArray();
  let delivered = 0, failed = 0;
  for (const event of events) {
    if ((await deliverMirrorEvent(db, event, sink)).delivered) delivered++;
    else { failed++; break; } // Quota/outage: leave work pending rather than hammering Firebase.
  }
  console.log(JSON.stringify({ attempted: delivered + failed, delivered, failed,
    pending: await queue.countDocuments({ state: 'pending' }), originalFirebaseRecordsChanged: 0 }));
  if (failed) process.exitCode = 1;
} catch {
  console.error('Firebase mirror unavailable. Pending changes remain in MongoDB; credentials and record data are not printed.');
  process.exitCode = 1;
} finally {
  if (app) await deleteApp(app);
  if (connection) await connection.close();
}
