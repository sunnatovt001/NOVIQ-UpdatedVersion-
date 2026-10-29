# Firebase rules parity during MongoDB migration

## Current canonical policy — 2026-10-29

The tables below describe the older projection API approach. The active migration
now uses `documentPolicy.mjs` for every canonical document/query/transaction and
`storagePolicy.mjs` for MongoDB uploads. Existing trusted XP, subscription, promo,
community and analytics business functions use the canonical server adapter.

Verified that live Firestore source rules exactly matched the repository before
freezing writes. Source Firestore emulator tests and paired source/Mongo access
cases passed (27 test groups, including 32 paired policy cases). Additional real
Atlas tests verify authorization rollback, CAS races and timestamp precision.
Original business-logic tests verify once-only XP, trial agreement/cancellation
and community membership authorization. Live Vercel tests rejected cross-owner
reads and forged XP and verified notes, membership and owner-bound files.

Mongo credentials and direct database access stay server-only. Query authorization
precedes execution and each result is checked again. Mutation authorization and
role/member reads share the write transaction; fences prevent snapshot write skew.
Firebase Auth verifies identity and revoked/disabled status. There is no silent
fallback to Firebase application data on a MongoDB error.

The source database is read-only for clients during cutover; that intentional
archive restriction is separate from the preserved application policy in MongoDB.

Historical preparation details follow.

Source of truth: the current repository's `firestore.rules` and `storage.rules`.
This is a migration checklist, not a claim that every module has been ported or
that local rules match the deployed Firebase rules. Verify deployed rules before
cutover. MongoDB credentials remain server-only. No generic database CRUD API.

## Working staging APIs

| Domain | Existing rules | MongoDB preparation |
| --- | --- | --- |
| Notebook notes | Owner CRUD; admin collection-group read | `/api/notebook/notes` is session-owner-bound, paginated, field-validated and uses revision CAS. `/api/admin/notebook-notes` supports bounded reads only after a server-role check; ordinary clients cannot choose another UID. |
| Smart planner | Owner reads; version 2/persistence 3; sequence 1 and previousRevision null on creation; sequential revision checks on updates; no delete | `/api/planner/plan` binds UID to session, validates plan shape/timezone, generates sequence and timestamps, uses atomic conditional replacement and rejects DELETE. |
| Planner history | Owner reads; history refers to prior confirmed plan; immutable | Previous plans are captured atomically inside the same MongoDB document. No history update/delete endpoint. Only 12 revisions returned per history request; all stored revisions retained. An 8 MiB cap rejects further writes rather than dropping history. A transaction-backed separate history collection is needed to remove this cap. |
| Uploads | Owner-only paths; images strictly under 8 MiB; notebook sources strictly under 25 MiB | Pure `storagePolicy.mjs` mirrors paths, operations and strict byte limits. Upload metadata must be verified server-side. Actual blob hosting/upload/download and migration remain pending. |
| Profiles | Owner reads/writes; mutable-key allowlist; onboarding validation; safe creation defaults; server-clock daily visits | `/api/profile` and `/api/profile/visit` derive UID from the session, reject all protected field changes including legacy missing fields, use revision checks and update only mutable fields. Initial trusted values are server-generated. Admin profile read/delete routes are still pending. |
| Flashcard decks/cards/reviews/sessions | Owner writes; matching review/session IDs, nonnegative review counts/seconds and at most 200 attempts/cards | `/api/flashcards` has explicit deck/card/review/session routes, owner-bound IDs, bounded pagination, parent-deck checks, optimistic revisions, retry keys and recoverable deletion. No trusted reward or XP writes are performed. Admin collection-group reads remain pending. |

Notebook deletes are soft deletions: normal reads hide the note while its content
remains recoverable. Additional input/body limits, retry IDs, CAS and origin checks
protect API transport; they do not grant extra database rights. Missing endpoints
remain denied. Neither new API is enabled by default; each requires its explicit
`NOVIQ_MONGO_*_API=true` server setting. No production frontend has switched.

## Required before complete cutover

| Domain | Rules that must be preserved | Status |
| --- | --- | --- |
| Profiles admin operations | Admin reads and deletes with authoritative server role | Pending admin routes; no client profile DELETE |
| Admin | Verified server-issued admin claim or server-owned role/profile, never browser flags/email | Existing auth_roles/session boundary; migration reconciliation pending |
| Tutor, sources, messages, journals/tasks | Owner writes; owner/admin reads where allowed | Pending domain APIs |
| Deck/card admin reads | Admin collection-group reads | Pending admin routes |
| XP days, recall evidence, trusted progress, Pro events | Reads only as explicitly allowed; all client writes denied | No client write endpoints; trusted reward/session services pending |
| Study sessions | Owner/admin reads; client creation/deletion denied; only sync metadata editable | Pending domain API; no permissive replacement |
| Progress events | Allowlisted fields/types, pending status, bounded raw XP, matching session IDs; updates limited to sync metadata | Pending domain API and verified server processing |
| Subscription checkouts/requests | Server-created checkout; owner/admin reads; pending request actions only; sync-only updates; no deletion | Pending API; browser must never activate Pro |
| Promo records/usages | No direct client reads/writes | No direct endpoint |
| Membership/friends/invites | Owner reads, server-managed writes | Pending MongoDB community service |
| Community directory/chat | Authenticated community reads; per-member/admin directory scope; chat only for actual members; server-only writes | Pending API; membership and send limits must be checked server-side |
| Analytics | Server-owned totals; admin reads; event allowlist/owner identity; sync-only updates | Pending API |
| Legacy collections | Owner reads by stored userId; writes denied | Pending read adapters; preserve archives |
| Accountability-room chat | Authenticated reads; create bound to UID; mutation only by stored owner | Pending API |

Files and source documents must be preserved before switching traffic. A fresh
4,904-document snapshot at 2026-10-29T07:25:07Z is archived and independently
integrity-verified. All 54 staging Auth accounts were reconciled with old staging
preimages retained; Firebase Auth remains the user's chosen login authority.
The snapshot is not a live sync and requires a final delta before cutover.
Validated profile/note/planner/flashcard projections were also materialized and
verified in staging API collections; production flags remain disabled. Two
incomplete-source records remain explicitly recoverable. GCS project bucket listing succeeded with zero buckets and the
snapshot had no Firebase Storage references. Migration snapshots and password
hashes never appear in client API output.

The encrypted backup mirror is opt-in preparation. Its Firebase namespace is
server-only and separate from original application paths; backup events never
grant extra application rights. Verify deployed rules deny client access before
activation. Complete domain coverage and restore/worker deployment are still
required; see `FIREBASE_BACKUP_MIRROR.md`.

Validation: isolated HTTP tests cover unauthenticated access, cross-account reads
and mutations, foreign origins, forged protected fields, retries, concurrent saves,
revision conflicts, immutable history and bounded pagination. Storage policy tests
cover exact path ownership and strict size boundaries. Emulator/source-vs-Mongo
parity tests across all remaining domains and real-account verification are still
required before production cutover.
