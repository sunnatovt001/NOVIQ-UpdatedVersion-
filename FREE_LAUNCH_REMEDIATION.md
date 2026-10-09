# Launch remediation under the free-only constraint

Checked 2026-10-05. The user explicitly requested no paid services or billing
activation. DNS/domain work is outside this task. This report supersedes the
remaining-work section of LAUNCH_READINESS.md for the current scope.

## Actual production status

- Billing remains disabled (read-only check saved in
  `artifacts/production-audit/services-status.json`).
- No Functions, Hosting, indexes, backup schedules, PITR or notification channels
  were deployed or enabled in this task. No production documents were changed
  or deleted. Email alerts have no configured recipient.
- The live backend preflight correctly blocks release: the original 26 Functions
  and 10 newly prepared metrics Functions are absent. Backend-only checking
  excludes the domain as requested. The earlier audit's count of 27 was off by
  one; the current entrypoint exports 26 existing plus 10 new handlers.
- Functions deployment requires Blaze billing; free usage quotas are not a
  guarantee of zero charges. Managed Firestore backup, PITR and cloud restore
  are paid operations. These activation steps cannot satisfy the current budget
  constraint and remain incomplete.

## Completed work

### Encrypted local backup and verified restore

`scripts/local-backup.cjs` traverses root and nested Firestore collections at a
consistent read timestamp, including subcollections of missing parent documents.
It preserves native Firestore value types. AES-256-GCM encryption protects the
snapshot; credentials are never included. A 20,000-document guard refuses to
label an incomplete traversal a successful backup. Reads consume the existing
Firestore quota; this does not create a new paid service.

Actual production snapshot: **1,788 documents**, read time
`2026-10-05T10:00:08.000Z`. Every restored document's fields matched the encrypted
snapshot after a local restore drill. Receipts: `local-backup.json` and
`local-restore.json` in `artifacts/production-audit/`.

Restore is restricted to `127.0.0.1:8089` and `demo-noviq`; the tool accepts no
production restore destination. Requests are bounded by document count and
payload size. No production writes occurred.

Encrypted snapshot and separate key are in ignored `backups/cloud/`. Keep both
safe; losing the key makes the snapshot unrecoverable. Move the key to a separate
secure location and retain an independent protected copy of the snapshot before
relying on it. A local copy is not automatic offsite protection or PITR. This
snapshot covers Firestore documents, not Auth accounts, Storage objects or server
secrets. Automated scheduling and cloud restore have not been enabled.

### Client error collection and admin visibility

`src/lib/errorReporting.ts` reports signed-in route/metrics failures using the
existing analytics collection. Only a whitelisted route, source and bounded
error code are sent; raw messages, stacks and private content are excluded.
Reports are deduplicated and limited to 10/day/account/device. Offline/audit
mode skips reporting; telemetry cannot block the UI. Existing quota is consumed.

`src/components/ClientErrorMonitor.tsx` adds an admin-only latest-50 error list
with a deadline, explicit unavailable state and retry. Admin.tsx hosts it. This
is sampled client visibility, not automatic email alerting or complete server
monitoring. No reports does not establish that the application is healthy.
The analytics composite index is prepared in firestore.indexes.json but has not
been deployed; absent indexes produce a visible error/retry state.

### Large-history server metrics, prepared and tested

The root cause of large-history failures is the client-side record safety cap
and inconsistent historical date types. Increasing the cap would increase reads
and could silently truncate counts. `functions/metrics.js` instead derives small
normalized rows, preserving all original documents. A paginated additive backfill
and source triggers feed server count/sum queries across mixed date formats.
Triggers reread current source state, tolerate replays and account for deleted
deck parents without deleting their card subcollections. A readiness document
prevents reporting partial backfills as complete and notifies clients after
trigger completion. Counters are eventually consistent; multi-query results are
not a single transaction snapshot.

`scripts/backfill-metrics.cjs` defaults to preview; `--execute` is a production
write migration and has NOT been run. Composite indexes and 10 Functions are
prepared. `src/lib/cloudMetrics.ts` and useUserActivityMetrics select this path
only with `VITE_SERVER_METRICS_ENABLED=true`.

**The flag remains false.** With billing disabled and Functions absent, live
large-history statistics still use the existing guarded fallback and show a
truthful error beyond its cap. Scalable code is validated locally, not activated
in production. Enable only after authorized deployment, index readiness and
successful backfill. Very large datasets need production read-cost/load tests;
there is no claim of unlimited free scale.

## Validation

- `npm run verify`: TypeScript, backend syntax, **54 frontend/tool tests and 31
  backend tests**, production build passed.
- Backend tests and backup tests rerun after the final backend/restore edits.
- Firestore emulator: **9 rules tests + 1 large-data integration test**, using
  2,501 sessions and 2,501 cards, mixed timestamp types, stale/replayed events,
  readiness failures and deleted deck parents. Production is inaccessible to
  this suite.
- Browser suite: **21 scenarios passed**, including Planner/Tutor recovery,
  dashboard outage/retry, CTA, auth validation/focus/Escape, mobile layout,
  admin monitoring errors and retry. Browser service fixtures do not establish
  live Functions/provider availability.
- Actual 1,788-document encrypted backup restored and verified locally.
- Backend live preflight fails as expected on 36 absent Functions. Do not bypass
  the gate or claim public launch readiness.

## Before activation/public launch

1. Preserve the encrypted backup/key safely in separate locations; define who
   performs recurring backups and how long recovery may take.
2. If the budget restriction changes: approve Blaze and backup/PITR costs first,
   configure spend alerts, deploy reviewed Functions and indexes, then run the
   additive metrics backfill. Verify readiness before enabling the client flag.
3. Deploy the reviewed frontend and monitoring index, verify admin permission
   boundaries and outage/retry behavior. Choose an actual alert recipient and
   notification approach before claiming automated monitoring.
4. Run live backend/provider smoke tests with existing-account data. DNS/HTTPS
   remains a separate launch dependency outside this task.

Pricing references: [Functions requirements](https://firebase.google.com/docs/functions/faq-and-troubleshooting),
[Firestore backup/PITR/restore pricing](https://firebase.google.com/docs/firestore/pricing).
