# MongoDB primary and Firebase backup

## Current implementation, 2026-10-29

Production is on MongoDB. The owner approved the verified 12:25 Tashkent snapshot
because a fresh export hit Firestore quota. Later source writes remain preserved
in Firebase and still require reconciliation when reads become available.
The following replaces the historical opt-in
description below:

- Authoritative application records are `mongo_documents`, `mongo_files` and
  `mongo_file_chunks`; their mutations enqueue encrypted backup events in the same
  MongoDB transaction. The former projection APIs remain preparation utilities.
- Vercel `waitUntil` drains durable trigger/backup jobs after requests. A protected
  `/api/maintenance` daily cron also retries pending work. Global leases and a
  five-minute failure circuit prevent quota/outage request storms.
- Live synthetic backup delivery, complete chunk read-back, hash checks,
  authenticated decryption and numeric/BSON recovery passed against real Firebase.
  Actual preview API writes also reached Firebase with zero pending events.
- Production uses namespace `noviq_staging`; preview prefixes get separate backup
  namespaces, preventing a test event from advancing the production version pointer.
- `baseline-live-mirror.mjs` queues the entire final canonical baseline, delivers
  bounded batches, reads every record back and verifies its encrypted content.
  All 4,904 baseline events have been queued. Firebase's exhausted quota currently
  prevents complete production delivery; do not describe the backup as up to date.
  `--queue-only` seeds the encrypted baseline without attempting Firebase reads.
- Original Firebase paths remain preserved and client writes are frozen during
  cutover. New backups are encrypted recoverable copies, not a second live app.
- Firebase quotas still apply to backup delivery. If exhausted, pending events
  remain durable in MongoDB. No primary-data fallback occurs. Keys are server-only;
  retain their ignored local recovery copy securely.

The remaining sections are historical preparation notes.

Owner request, 2026-10-29: MongoDB should become primary, retain Firebase and keep
an updated backup there. The implementation below is opt-in preparation, not a
completed production cutover or a running backup service.

## Current preservation

The consistent Firestore snapshot at 2026-10-29T07:25:07Z contains 4,904 documents.
The encrypted local snapshot and its key are in ignored `backups/cloud/`.
The verified, insert-only MongoDB archive retains original document paths and
native Firestore field types, including timestamp nanoseconds. Snapshot ID:
`94146ba5d7df13379d2c49d1f2df376628c9e57c006cc44db6aa510e327de2aa`.

A separate fresh encrypted Auth export contains 54 accounts, including 34 password
hashes and project hash parameters. It is also archived and read-back-verified in
MongoDB. Local files/keys on one machine are not an independent off-site backup.

An authorized GCS bucket-list request returned HTTP 200 with zero buckets and no
next page for this source project. The snapshot contained no `gs://` or Firebase
Storage download URLs. This verifies the observed project state, not ownership
or preservation of arbitrary external web resources referenced by users.

## Backup mechanism

`server/src/firebaseMirror.mjs` wraps supported MongoDB writes. The application
record, monotonic per-record backup sequence and encrypted outbox event commit in
one MongoDB transaction. A failed queue write aborts the application write.
Firebase is not contacted during application requests. A Firebase outage leaves
events pending for later delivery.

Supported collections currently: `notebook_notes`, `planner_plans`,
`user_profiles`, `flashcard_records`, `auth_accounts`, `auth_settings`,
`auth_roles`. Every additional authoritative domain must be explicitly wired
before claiming whole-application backup coverage. Sessions, login proofs,
internal queues and migration archives are deliberately excluded.

The worker writes encrypted backup records under
`mongoBackupNamespaces/{database}/records` and immutable encrypted chunks under
`mongoBackupNamespaces/{database}/chunks`. It does not replace original Firebase
application documents or alter Firebase Auth accounts. This is a recoverable
backup format; it is not an automatically usable second live Firebase site.
Existing owner/admin rules remain in force for the original collections. Verify
deployed rules deny all browser access to this new backup namespace before use.

AES-256-GCM authenticates ciphertext against record identity and sequence.
Extended JSON retains BSON dates and large integers. Never store the encryption
key in either database, expose it through VITE variables, or lose its recovery
copy. Retain old keys if rotation is introduced; automatic rotation is not built.

Firestore transaction writes the chunk set and latest-version pointer atomically.
Older/replayed events cannot replace newer data. `verifyMirrorBackup` checks
chunk completeness/order, content hash, encryption and original record identity
before returning a record for a future restore. No restore writes are automated.

## Activation prerequisites

1. Finish domain APIs, account flows, security parity and frontend migration.
2. Freeze source writes briefly and obtain a final baseline/delta; the snapshot
   above does not include writes made after its read time.
3. Verify all authoritative MongoDB collections and uploaded files, reconcile
   legacy/incomplete records, and enqueue a baseline for every supported record.
   Enabling the wrapper alone backs up only subsequent writes.
4. Configure `NOVIQ_FIREBASE_MIRROR=true`, a separate 64-hex-character
   `FIREBASE_MIRROR_ENCRYPTION_KEY`, matching `FIREBASE_MIRROR_NAMESPACE`, and an
   authorized server-only `FIREBASE_SERVICE_ACCOUNT_JSON` for the original project.
5. Schedule `node --env-file=.env scripts/run-firebase-mirror.mjs --execute` in a
   server worker. Each run handles at most 50 events and stops after a delivery
   failure. No scheduler has been deployed or enabled by this work.
6. Monitor pending count, oldest pending age, failure rate, Firestore write quota,
   Atlas storage and immutable chunk growth. The worker currently reports counts;
   production monitoring/retention policies still need implementation.
7. Perform a restore drill and test writes, retries and recovery against the
   actual Atlas/Firestore services before directing production traffic.

Firebase backup consumes Firestore write/storage quota. An exhausted quota causes
backup lag, not a synchronous switch of primary databases. Existing backups and
events are retained. No paid resources or production flags were enabled.
