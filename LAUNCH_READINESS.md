# Launch readiness — noviqq.uz

Checked 2026-10-05. Passing local tests does not establish cloud availability.
No application release or Functions deployment was performed during this task.

## Cloud evidence

- Project `gen-lang-client-0937997111`, named Firestore database
  `ai-studio-b3129ca2-3cf9-4d3f-bf24-5a6d266fe7a1`, location `asia-southeast1`.
- Firebase CLI `functions:list` returned an empty list. All 26 original backend
  functions are missing in this project's inspected deployment. AI, verified
  progress and community callable flows cannot be declared live-ready.
- `noviqq.uz` returned DNS name-not-found; its HTTPS URL could not be reached.
- Domain was added to Firebase Auth authorized domains, preserving existing
  entries. Database delete protection was enabled; both were read back successfully.
  These are the only live configuration changes made.
- PITR remains disabled and backup schedules are empty. Delete protection
  prevents database deletion, not individual-record deletion. Backup retention
  and recurring cost need an owner decision.

Evidence: `artifacts/production-audit/cloud-readiness.json` and preserved
`cloud-before-hardening.json`. No production user records were read/deleted/migrated.
No credentials are stored in these artifacts.

## Changed files and root causes

| Files | Cause and fix |
| --- | --- |
| `functions/package.json`, `functions/package-lock.json`, `firebase.json` | Old Node 20 runtime: all settings now target Node 22. Backend tests also ran under actual Node 22. |
| `firebase.json` | Old HTML can reference removed chunks after deploy: documents revalidate, hashed assets use immutable caching, nosniff/referrer headers added. |
| `src/lib/useUserActivityMetrics.ts`, `firestore.indexes.json` | Repeated full-history reads: verified focus sessions use count/sum aggregation. Legacy evidence retains validation. Refresh is throttled, card fan-out capped at five requests, batches respect the 15-second deadline, record reads limited to 2,001 and totals above 2,000 rejected. Deck ceiling is 100; truncated totals are never published. New indexes require deployment. |
| `src/lib/localStore.ts`, `src/lib/offlineSync.ts` | Corrupt queues were treated as empty: durable reads now fail closed and preserve raw data. Storage quota failure prevents remote writes/false success. Stalled writes return pending after 15 seconds while actual flush serialization protects late writes. |
| `src/components/SyncRecovery.tsx`, `src/components/Layout.tsx`, `src/pages/Profile.tsx` | Invisible pending edits/domain migration: pending/error state, retry, export and same-account private-change import. Existing pending edits win over imported ones. Profile/preferences queue writes before reporting saved; avatar upload failure asks for actual retry. |
| `src/lib/firebase.ts`, `.env.example`, `src/pages/Profile.tsx` | Public region/bot settings now control clients with compatible defaults. Server credentials stay server-side. |
| `index.html`, `public/robots.txt`, `public/sitemap.xml`, `package.json` | Wrong domain metadata: canonical/social/sitemap URLs use `https://noviqq.uz`. |
| `scripts/release-preflight.mjs`, `package.json` | Build-only publishing despite missing backend: runtime/database/routes/cache checks plus live DNS/required Functions checks. Hosting commands require verify + live preflight; full release checks again after deploy. CLI release commands pin 15.32.1. |
| `.github/workflows/verify.yml`, `tests/run-browser.mjs`, `tests/browser-check.cjs` | Browser regressions unenforced: CI runs isolated failure/retry/mobile/validation checks and uploads evidence. Runner cleans up its server. |
| `tests/offlineSync.test.cjs`, `tests/production-recovery.test.cjs` | Added corruption/quota/stalled write, backup isolation/conflict, oversized legacy and verified aggregation regressions. |
| `scripts/inspect-cloud.cjs` | Cloud metadata inspection; `--harden` only adds the named authorized domain and enables database delete protection. |

Current free-only remediation and verified local backup restore are documented
in [FREE_LAUNCH_REMEDIATION.md](FREE_LAUNCH_REMEDIATION.md). Its status supersedes
the historical remaining-work list below; paid activation remains prohibited.

Earlier Planner/Tutor recovery, auth initialization, dashboard states, CTA,
modal accessibility and validation are detailed in [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md).

## Validation

- `npm run verify`: TypeScript, Functions syntax, 48 frontend + 28 backend tests,
  and production build passed. `lint` is TypeScript checking in this repo.
- Actual Node 22: 28 backend tests passed.
- Java 21 Firestore emulator: 9 rules tests passed, including cross-account and
  protected-field checks, against demo project only.
- `npm run test:browser:ci`: 19 scenarios passed, including mobile pending-change
  export, import/runtime/deadline recovery, dashboard outage/retry, auth validation,
  focus/Escape and responsive layout. Service fixtures/provider interception
  establish UI behavior; they do not establish live service availability.
- Both production dependency audits report zero vulnerabilities. This is not
  an exhaustive security proof.
- Local release preflight passes; live preflight correctly blocks absent DNS
  and required Functions. Do not bypass this gate to launch.

## Remaining limits

Large legacy histories/cards need validated server summaries or normalization
before raising safety ceilings. Guards show unavailable state rather than fake
totals; statistics at arbitrary scale are not proven. Run representative load
and read-cost checks before broad rollout. Backup import transfers queued private
changes only, not login, cached-only drafts, active timers or uploaded blobs.
Sync on the old origin and retain it until users finish migration. Manual screen
reader checks, central error collection, alerts and backup restore remain.

## Release checklist

1. Add `noviqq.uz` in Firebase Hosting. Copy the exact ownership TXT and A/AAAA
   records Firebase supplies to the registrar; do not guess IPs. Wait for DNS
   and the Firebase HTTPS certificate. Configure www only if provisioned.
2. Configure billing/server secrets. Keep VITE_FUNCTIONS_REGION and FUNCTIONS_REGION
   equal (default us-central1). Verify Gemini models against the real provider.
   Payment features require actual merchant/webhook credentials.
3. Choose backup retention and approve recurring cost. Suggested starting policy
   is daily backup retained 7 days. Prepared command, **not executed**:

   ```text
   npx --yes firebase-tools@15.32.1 firestore:backups:schedules:create --project gen-lang-client-0937997111 --database ai-studio-b3129ca2-3cf9-4d3f-bf24-5a6d266fe7a1 --recurrence DAILY --retention 7d
   ```

   Restore a backup to a separate test database and compare records; never test
   restore over production. Choose PITR based on recovery requirements/cost.
4. Run verify/rules/browser/local preflight. Deploy reviewed Functions/rules/indexes,
   wait for indexes to become ready, then run live preflight and an actual
   signed-in smoke check before Hosting promotion.
5. On the real domain test signup/onboarding, Google login, forgot-password links,
   saved Planner, Tutor AI, verified focus, dashboard and existing-account data at
   320/390 px. Check provider enablement/OAuth redirect URIs separately.
6. Record the previous Hosting release and known good source/build. Publish
   atomically. Use Hosting release history to roll back route/asset regressions.
   Redeploy known good Functions source/config for backend rollback; Hosting
   rollback does not roll back Functions/rules/indexes/user data.
7. Configure Cloud Monitoring error/latency and billing alerts with a real
   notification channel, plus central client error collection. Console logging
   alone is not monitoring. Observe the first rollout before public announcement.

References: [Firebase runtimes](https://firebase.google.com/docs/functions/manage-functions),
[Hosting headers](https://firebase.google.com/docs/hosting/full-config),
[custom domains](https://firebase.google.com/docs/hosting/custom-domain),
[backup/restore](https://firebase.google.com/docs/firestore/backups),
[delete protection](https://firebase.google.com/docs/firestore/manage-databases).
