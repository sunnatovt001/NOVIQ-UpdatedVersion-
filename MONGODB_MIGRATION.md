## Current canonical migration checkpoint — 2026-10-29

Status: MongoDB production activated on `https://noviqupdated.vercel.app`.

The final fresh-source export hit Firestore's daily read quota. The owner explicitly
approved activating the verified 12:25 Tashkent snapshot immediately, acknowledging
that later Firebase writes may not yet appear in MongoDB. This is a deliberate
snapshot cutover, not a claim of zero source lag. Preserve and reconcile that later
source delta after quota recovery; never overwrite newer MongoDB changes blindly.

All 4,904 source documents were imported into the unprefixed canonical store and
read-back verified. All 4,904 encrypted baseline backup events were queued before
the production promotion. Firebase quota currently prevents full baseline delivery;
events remain durable and automatic request/cron workers retry after recovery.
The original Firebase application documents remain intact and client-read-only.
Firebase Auth remains active. Production flags are persisted in Vercel.

- Production server secrets are configured in `sunnatovt001s-projects/noviqupdated`.
  No MongoDB URI, password, encryption key or signing key is shipped to browsers.
- All application Firestore/Storage imports now pass through explicit adapters.
  MongoDB deployment flags route reads/writes/listeners, files and the existing
  callable business services to MongoDB. Firebase Auth remains the identity authority.
- The canonical `mongo_documents` store preserves original paths and nanoseconds,
  transactions, optimistic versions, immutable deletion preimages and durable
  trigger jobs. Original native snapshots remain separately archived.
- The original rules were checked against the live release and matched. Source
  rules/emulator and Mongo policy parity passed; XP, membership and community
  business logic runs through the existing services with the new transaction adapter.
- Real Atlas tests passed. Vercel tests passed for Firebase login, owner isolation,
  protected XP, notes, membership and file upload/download/delete. A real Chrome
  login opened Dashboard with no JavaScript errors.
- Actual encrypted Firebase backup delivery and decryption/read-back passed.
  Preview writes produced 13 delivered outbox entries and zero pending entries.
- Final production candidate: `dpl_46Sz8VeBUh3shJitFt79WfHbS3z3`.
  Its build passed 79 function tests, 92 server tests, root checks and frontend build.
- Firebase has no deployed Cloud Functions. The temporary maintenance deployment
  was removed. Original Firestore client writes are frozen to prevent old open
  browser tabs from creating a second write authority. Previous rules are retained
  for a controlled recovery; do not re-enable old writes without reconciliation.

Everything below is an earlier historical checkpoint and is superseded above.

> Current owner decision (2026-10-29): MongoDB becomes the primary application
> database; Firebase Auth remains responsible for email/Google sign-in. Retain
> Firebase and prepare an asynchronously updated backup. Production cutover and
> continuous backup are not complete. See the latest checkpoint immediately below.
>
> Earlier owner decision (2026-10-28): resume migration to the owner's Atlas
> Project 0 / Cluster0. Firebase remains the active backend until data preservation,
> replacement APIs and existing-account workflows are verified. Do not delete
> Firebase data or silently fall back between databases for writes.
> Historical checkpoints below describe preparation, not a completed migration.

## Resumed migration — 2026-10-28

### Fresh source transfer and backup preparation — 2026-10-29

- Firestore became readable. Obtained a consistent encrypted snapshot at
  `2026-10-29T07:25:07Z` (12:25:07 Tashkent), containing 4,904 documents across
  root and nested collections. Preserves analytics, profiles, planner/history,
  Tutor/Notebook messages, progress, subscriptions, communities and integrations.
- Imported the complete native snapshot into the insert-only Atlas archive and
  independently recomputed all document and manifest hashes. Verified snapshot:
  `94146ba5d7df13379d2c49d1f2df376628c9e57c006cc44db6aa510e327de2aa`.
  This is point-in-time preservation, not proof of a subsequent live-data sync.
- Fresh encrypted Auth export: 54 accounts, 34 password hashes, hash parameters
  and encryption verification. MongoDB Auth archive:
  `241239d9113e1adb700527e002278fd32e9e19d778b12e05f5f8c6fe91d65fd3`.
- Transactionally reconciled all 54 staging accounts and hash settings. Retained
  all 32 previous staging accounts and settings as an immutable preimage in
  `migration_auth_reconciliations`. No stale source accounts were found. User
  subsequently confirmed Firebase Auth should remain the login authority.
- Staged application projections: 54 profiles, 10 notes, 7 smart-v2 plans,
  10 historical plans, and 46 flashcard records. Original sync metadata remains
  in native source fields. Real-source color/icon/language/review date fields are
  supported. Source has one titleless sync-only deck and one contentless card;
  both are preserved in explicit recovery records instead of fabricated/deleted.
  Other planner document IDs remain intact in the full archive. Projections are
  retained as snapshot-scoped previews. Subsequently materialized and read-back
  verified the staging API collections in one transaction: `user_profiles` 54,
  `notebook_notes` 10, `planner_plans` 7 (all 10 history records retained),
  `flashcard_records` 46. Existing application conflicts stop the transaction;
  nothing is overwritten. API flags and production frontend remain unchanged.
- Authorized GCS project bucket listing returned HTTP 200, zero buckets, no next
  page. The snapshot contains zero `gs://` or Firebase Storage download references.
  No existing project bucket contents were found to transfer. This does not assert
  ownership or preservation of arbitrary external Google/YouTube/web resources.
- Added an opt-in Firebase identity-to-Mongo session exchange. Firebase Admin
  checks signed source-project tokens and revoked/disabled users; caller UID,
  email and role injection are rejected. New Firebase identities may get matching
  Mongo account records without admin rights. Exchange sessions expire in one
  hour. Client session renewal/logout wiring and production verification remain.
- Added an opt-in transactional encrypted Firebase backup outbox, retry worker,
  chunked Firestore sink, monotonic sequencing and local restore verification.
  Covered collections are explicit; see `docs/FIREBASE_BACKUP_MIRROR.md` for the
  precise scope, key handling, baseline, scheduler and monitoring prerequisites.
  Original Firebase documents are not overwritten. No mirror flag/key/scheduler
  was enabled and no actual backup delivery to Firebase was performed.
- Chrome inspection verified the actual Vercel project belongs to
  `sunnatovt001s-projects/noviqupdated`, connected to
  `sunnatovt001/NOVIQ-UpdatedVersion-`. Existing production Firebase server
  credentials are configured. MongoDB environment variables are not yet present.
  No environment values were revealed, modified or deployed through the UI.
- Required next: finish remaining domain APIs/authorization, instantiate verified
  application collections for remaining domains, replace frontend Firestore listeners/writes, connect
  Firebase Auth transport, perform live end-to-end verification, final source
  freeze/delta import, then controlled cutover with backup baseline/scheduling.
  Production still uses its existing Firebase data paths. Zero source writes or
  deletes occurred during export/import/reconciliation.
- Validation: 73 server tests passed before the final materialization helper;
  its three additional tests passed separately, as did the focused Firebase
  identity/session tests after disabling legacy login in Firebase identity mode.
  TypeScript validation passed. Cloud checks verified archive hashes, 54-account
  reconciliation retry, and staging materialization against actual Atlas.
  Live browser/backend production cutover and Firebase mirror delivery are untested.

### Additional quota-independent preparation — 2026-10-29

- Added opt-in profile APIs (`/api/profile`, `/api/profile/visit`) with owner-bound
  session identity, revision checks, retry keys and the exact mutable field list
  from the current Firestore rules. Trusted XP, roles, usage, subscription and
  study-time fields cannot be changed by a profile request, including on legacy
  profiles where those fields are absent. Updates set only mutable fields so they
  do not replace concurrent server-owned progress or billing changes.
- Profile onboarding uses the source enum lists and rejects future completion
  timestamps or reversal. Visit streaks use the server clock and UTC+5 day
  boundaries; visiting does not award XP. Admin profile routes remain pending.
- Added explicit Flashcards deck/card/review/session APIs with owner/parent-deck
  scope, pagination, conditional revisions, retry detection and soft deletion.
  Review/session validation preserves the source ID/nonnegative/200-item limits.
  User-reported card reviews and sessions never award trusted account XP.
- Added typed frontend clients without switching current Firebase screens or
  clearing local queues. Profile and Flashcards APIs are disabled by default via
  `NOVIQ_MONGO_PROFILE_API` and `NOVIQ_MONGO_FLASHCARDS_API`.
- Extended snapshot-scoped study previews to profiles and flashcard records,
  including legacy question/answer aliases, while retaining raw native fields.
  Invalid/mismatched IDs stop preparation. Preview data is not activated; date
  hydration, complete history and legacy metadata reconciliation must be verified
  against a fresh source snapshot before cutover.
- Isolated HTTP tests cover protected-field injection, cross-account operations,
  origin checks, retry/concurrent writes, Tashkent midnight and schema constraints.
  An explicit drift test compares the profile field allowlist with firestore.rules.
  No Firebase/Atlas records were changed by this preparation, and no deployment
  or frontend backend switch was performed. AI, verified sessions/rewards,
  subscriptions, community, file hosting and remaining admin operations are still
  separate unfinished migration work.

- Verified the signed-in Atlas UI identifies project `69fc2b8203ae3ecba2ae319c`,
  Cluster0, Free tier. Existing databases include `noviq_staging` and `kasbai`.
  Do not modify the other application's database or reset shared credentials.
- At resumption, the checkout had no original encrypted backups/cloud directory
  or server environment file. New credentials and backups were prepared below;
  historical checkpoints are not proof of current source freshness.
- The owner created `noviq_migration` with `readWrite` restricted to
  `noviq_staging` and configured the ignored server/.env. Atlas ping succeeded.
  No credential values are recorded in this document or verification output.
- Read-only verification recomputed all 2,157 archived document hashes and the
  manifest hash for the existing 2026-10-12T07:15:54Z snapshot. Integrity passed.
  The staging database contains 32 auth accounts and the legacy password hash
  configuration. Account contents have not been compared to the current source.
- Added bounded read-only archive verification to `migration:status`; it rejects
  count/hash/path/source mismatches and does not claim that old data is current.
  All 39 server tests passed, including HTTP authorization/session tests.
- Owner-confirmed Firebase CLI login completed for the UniPath source project.
  A fresh encrypted Auth export contains 54 accounts (34 with password hashes),
  including password hash configuration. Encryption round-trip passed.
- Archived the fresh Auth snapshot in `migration_auth_snapshots`, snapshot
  `4464e5c1b810942364426e832071a2a9dac9ab210a7f725c77aea8773594f707`,
  with read-back verification. This retains all exported fields, is insert-only,
  and changes zero application accounts. Existing `auth_accounts` still contains
  the old 32-account staging import; authentication has not been cut over.
- Fresh Firestore snapshot failed with HTTP 429: the source database's free daily
  read quota is exhausted. No partial export is labelled complete. Retry after
  quota reset; do not enable billing or replace current records with the old copy.
- Next: obtain current Firestore/Storage exports and compare source and destination
  before importing application data. Uploaded files remain unverified/unmigrated.
- A read-only GCS list probe for the configured Storage bucket returned HTTP 404.
  This does not prove there are no uploaded files; verify the actual bucket and
  permissions and any historical download URLs before declaring file preservation.
- Application APIs for study features and frontend Firebase dependencies still
  require migration. The production frontend has not been switched or deployed.

### Offline backend preparation while the source quota resets

- Added opt-in notebook owner CRUD, read-only admin notebook listing and smart
  planner load/save/history APIs. They require authenticated MongoDB sessions,
  exact-origin mutation checks, bounded JSON and explicit domain routes.
- Notebook mutations use optimistic revisions and retry IDs; deletes retain the
  underlying content. Planner changes use atomic conditional replacement with
  server-selected sequence/previousRevision and immutable previous plans.
- Added frontend transport modules, without changing any existing Firebase UI
  or clearing offline drafts/queues. Notebook and Planner APIs are disabled by
  default (`NOVIQ_MONGO_NOTEBOOK_API`, `NOVIQ_MONGO_PLANNER_API`).
- Added a native-value-aware study import preview/stager. It checks source
  project/database, preserves original UIDs and raw fields, rejects unsafe integer
  conversion and writes only snapshot-scoped previews when explicitly executed.
  It does not activate account data, replace active notes/plans or claim history
  migration is complete. No cloud execution was performed for these study APIs.
- Added Storage path/type/strict-size policy with boundary tests; blob hosting
  and file migration remain pending. Rules-by-domain tracking and limitations:
  `docs/MONGODB_RULES_PARITY.md`. It remains a cutover prerequisite to finish and
  test the remaining domains against the source rules, including trusted rewards,
  AI limits, profile updates, membership/payments and community access.
- Backend test suite: 51 passing isolated tests. TypeScript validation is also
  required for the new transports. No application deployment was performed.

Do not commit server/.env, account exports, hashes, backup encryption keys or
private migration reports. Do not activate paid resources for this migration.

# Firebase → MongoDB Atlas migration

Approved 2026-10-12: Atlas, preserve all existing accounts/data, postpone beta.

## Architecture and current status

React remains the frontend. A separate Node.js backend owns database access,
authentication, AI calls, authorization, uploads and background operations.
MongoDB credentials must never enter the browser or VITE_* configuration.
Hosting and object storage providers remain undecided; no paid service activated.

The server foundation has a bounded reusable MongoDB connection pool and a
read-only connectivity check. It is not yet an HTTP API or production backend.
The existing frontend and Firebase remain unchanged and active.

## Preservation requirements

- Preserve Firebase UID as the canonical account ID, not a new ObjectId.
- Retain document IDs, nested collection paths, timestamps with nanoseconds,
  integer precision, references, bytes and geo points in an immutable migration
  archive. Build normalized application collections separately and verify both.
- Export Auth separately: provider identities, disabled status, email verification,
  password hashes/salts and project-specific hash parameters where permissions
  allow. Do not assume generic scrypt accepts Firebase hashes. Authentication
  compatibility must be tested before switching existing accounts.
- Preserve Storage objects and metadata separately; document backups contain
  neither uploaded files nor Auth accounts. Rewrite URLs only after verification.
- Preserve same-account offline queues and browser drafts; MongoDB migration must
  not clear localStorage. Resolve pending edits before final snapshot/cutover.
- Snapshot counts and hashes, orphaned subcollections, permissions and existing
  accounts must be checked. No Firebase deletion until owner approves retirement.

## Sequence

1. Establish Atlas staging connectivity and backend foundation (in progress).
2. Prepare encrypted export/import and verification tools; test synthetic data
   locally before copying actual private records into owner-controlled staging.
3. Implement auth/session and Firebase-account compatibility; test isolation.
4. Port APIs and authorization for Planner, Tutor, Notebook, Flashcards, progress,
   Community, admin, subscription and integrations. No generic unrestricted
   database CRUD endpoint. Replace listeners with bounded refresh/realtime APIs.
5. Port file storage, AI limits, verified rewards and background jobs.
6. Replace frontend Firebase imports feature by feature behind explicit staging
   configuration. Never silently fall back between databases for writes.
7. Verify all existing-account flows, counts/hashes, restore, API authorization,
   upload downloads, mobile UI and bounded concurrency.
8. Cut over during an announced write freeze with a final delta snapshot;
   define rollback including reconciliation of new MongoDB writes. Never assume
   rolling back frontend alone rolls back data.

## Atlas setup for the owner

Create an Atlas project and staging cluster in your own account. Check the
displayed tier/cost before confirming. Create a database user restricted to
the intended staging database, and allow only the backend/developer IP addresses
(do not default to 0.0.0.0/0). Keep production and staging credentials separate.

Copy server/.env.example to server/.env in your editor. Put the real connection
URI and explicit database name there; percent-encode special password characters.
Never paste credentials in chat. Once configured, run:

    npm --prefix server run check:atlas

This performs only a ping, not an import.

## Verified checkpoint — 2026-10-12

- Atlas connectivity passed with server-only credentials; no credentials printed.
- Fresh encrypted Firestore snapshot: 2,157 documents, including nested paths.
- Insert-only staging archive import completed: all 2,157 documents compared
  against the original serialized native fields; destination count matched.
  Archive snapshot ID: 39a85110adf3b5e0823e8b8459174b19085ed1fe85d536a5d87a9e3d15279fcd.
- Auth encrypted export: 32 accounts, 18 with password hashes; project hash
  parameters were also exported into the encrypted archive. Encryption round-trip
  verification passed. No account details or hash parameters printed.
- Seven server unit tests passed. Archive import refuses destination conflicts
  and does not overwrite application records or source data.
- Backup and separate key remain in ignored backups/cloud; they must be stored
  securely and separately before relying on them as durable backup protection.

IMPORTANT: This is a verified database ARCHIVE, not normalized application
collections, not a working MongoDB app, and not a complete migration. Authentication
compatibility, OAuth configuration, sessions, uploaded Storage objects, APIs,
frontend cutover and hosting remain unfinished. Firebase remains active.

Next owner decision: choose/authorize backend hosting and file storage without
violating the existing free-only restriction. Do not activate paid services.

## Authentication foundation checkpoint

Local server tests now total 13 passing. Legacy Firebase SCRYPT password
verification matches Firebase's public compatibility vector and rejects wrong
passwords, disabled/social-only accounts, oversized inputs and unsupported hash
parameters. Session service preserves UID, stores only token digests, enforces
expiry independently of MongoDB TTL cleanup and supports logout/revoke-all.
Cookie helper requires HttpOnly/Secure/SameSite and exact-origin mutation guard.

These are isolated service tests, NOT a live login verification. HTTP auth routes,
distributed login rate limits, account import, registration/reset-email flows,
OAuth, browser integration and real-account login remain unfinished. Session
indexes have not been deployed. firebase-scrypt 2.2.0 passes the compatibility
vector but brings deprecated core-js 2 through babel-runtime; dependency review
is required before production approval. npm audit currently reports zero known
vulnerabilities, which does not remove the maintenance risk.

## Admin API checkpoint

An authenticated GET /api/admin/migration-status handler and same-origin frontend
client are implemented. Real loopback HTTP tests with injected account/session
fixtures confirm 401/403 before database reads, 200 for an authorized admin,
no-store responses, duplicate-cookie rejection and 405 for mutations. Total
server tests: 16 passing. These tests do not establish live account login.

This handler is not yet deployed/mounted in a running application. Admin.tsx still
uses Firebase listeners and callable admin-grant operations. The MongoDB client
is not yet attached to the panel because the new backend login and API hosting
must exist first. Never bypass the session guard to display staging data.

## Account import and auth HTTP checkpoint

All 32 exported Auth accounts were inserted and read-back verified in staging,
preserving UID, disabled status, email verification, provider identities, legacy
hash/salt and MFA-presence marker. Hash parameters are server-only in auth_settings.
Import is conflict-refusing, not an overwrite migration. MFA accounts fail closed
until MFA support exists; social-only accounts require OAuth implementation.

Login/session/logout HTTP handlers and a loopback server entrypoint are added.
Login uses shared MongoDB ten-minute attempt buckets for email and direct socket
address, bounded JSON, exact Origin checking and secure HttpOnly session cookies.
Behind a reverse proxy, direct socket IP grouping may be too restrictive; proxy
identity must be configured explicitly before hosting, not blindly trust headers.
Session/login-limit TTL index initialization exists in server startup.

Server tests: 17 passing, including actual loopback HTTP with injected fixtures.
Frontend Mongo auth client exists but AuthContext has NOT been switched: the app
still expects Firebase User and Firestore data throughout its features. No claim
of live sign-in, full admin, AI/files migration or release readiness.

Owner currently has no backend hosting account. Online deployment requires owner
signup/sign-in and any required agreement acceptance; paid services prohibited.
