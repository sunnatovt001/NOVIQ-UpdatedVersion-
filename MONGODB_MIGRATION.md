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
