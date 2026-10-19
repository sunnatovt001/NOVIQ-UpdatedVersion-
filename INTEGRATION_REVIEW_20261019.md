# NOVIQ integration review — 2026-10-19

Status: DRAFT. Do not merge or deploy until the blockers below are resolved.

## Scope and preservation

Integrates local friend/noviq-updates-20261019 at 31d5c57dd2e056111a25be322d3d0bd6b6cbe0a5 with main at 14868fb016c8daefd482b4d953390e82cd2d7155. Original development checkout and its index are preserved. A verified Git bundle, staged/unstaged patches and archive of tracked/untracked working files are held outside the repository. Ignored environment files remain in the original checkout and are never copied into the candidate.

Includes Free/Pro UI, Smart Planner, Flashcards, entitlement functions/rules/indexes, local membership verification, MongoDB server code and tests, landing assets, implementation notes and verification scripts. Local artifacts, screenshots, private backups, logs, environment values, dependency directories and build output are excluded from new changes. Existing historical artifacts already on main are unchanged; this review does not certify historical Git contents as suitable for public distribution.

## Integration fixes

- Preserve main package-lock.json and Tutor upgrade-dialog variant.
- Resolve UpgradeModal conflict preserving main accessibility/localization and local scoped portal/panel styles.
- Replace a personal admin email in the new migration script with required MIGRATION_ADMIN_EMAIL; retain verified source-admin and staging-only requirements.
- Add artifacts/ to ignore rules; do not include current production-audit/local-backup.json.
- Patch transitive proxy-addr in Functions from 2.0.7 to 2.0.8 to address the critical advisory reported by npm audit.
- Extend release preflight to check membership exports, which the previous check omitted.
- Remove trailing whitespace/extra EOF blank lines from incoming textual changes.

## Executed checks

- npm ci --ignore-scripts --no-audit --no-fund: PASS at root, functions and server. Functions declares Node 22; local runtime is Node 24.12.0, so CI Node 22 evidence is still required.
- npm run verify: PASS; TypeScript, Functions syntax, 220 frontend/model/security tests, 39 Functions tests, Vite production build.
- npm --prefix server test: PASS, 24 tests.
- npm --prefix functions test after dependency patch: PASS, 39 tests.
- npm run release:check: PASS (local configuration only).
- npm audit root: FAIL, three moderate findings in mammoth/argparse/sprintf-js dependency chain. No forced major downgrade applied.
- Functions audit after compatible patch: PASS, zero reported vulnerabilities.
- Server audit: PASS, zero reported vulnerabilities.
- npm run test:browser:core: FAIL twice. tests/browser-check.cjs:42 times out waiting for the legacy Planner heading. Some Tutor/Notebook fixture cases passed before batch termination; the full regression suite did not pass. Tests must be reconciled with intended Planner behavior without weakening coverage.
- npm run test:rules: NOT EXECUTED successfully; Firebase emulator cannot spawn java -version. Install/configure Java 21 and rerun rules/metrics tests.
- npm run release:check:live -- --backend-only: FAIL; live inspection reports required AI, Telegram, community and activity functions absent. Membership export checks were added afterward and need a fresh live check as well.
- Production URL GET: HTTP 200, expected NOVIQ title and asset references. This confirms page delivery only, not authenticated functionality or deployed commit identity.
- Vercel project inspection: BLOCKED. Connector returned team-scope 403; local CLI scope access failed and whoami reports logged out. No deployment commit/state can be verified.

## Security and release limitations

Candidate text was scanned for credential/token/private-key patterns and personal records. Matches reviewed included public Firebase web configuration, placeholder examples and synthetic test values. No new private credential was identified by these checks; scanning is not proof of absence. The personal admin address was removed from the new migration script. Environment example files contain placeholders. Owner-scoped Firestore rules and server-side membership/admin authorization were inspected; dynamic Firestore authorization is still unverified pending emulator tests. Production billing, infrastructure, data and secrets were not changed.

Release remains blocked by failed browser regression, missing backend services, unexecuted emulator tests, moderate dependency findings and unavailable Vercel team access. Publishing frontend changes alone would not deploy Firebase services or rules. A separately authorized backend/infrastructure rollout and staging verification plan are required before release. No main merge or production deployment is authorized by this report.
