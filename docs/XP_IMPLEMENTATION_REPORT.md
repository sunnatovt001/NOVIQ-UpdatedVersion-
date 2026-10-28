# NOVIQ XP implementation and local verification report

Date: 26 October 2026 (Asia/Tashkent)

Status: implemented locally and tested in isolated environments. Not deployed and not verified against authenticated production accounts. The full verification command still fails on one confirmed pre-existing onboarding test.

## 1. Root-cause analysis

The local code audit found these concrete causes of incorrect or inconsistent progression:

- Both old level tables skipped levels 6–9. XP from 1,600 to 4,999 therefore remained at level 5.
- `persistDailyActivity` existed without callers. Login rewards depended on other progress events reaching a deployed trigger.
- Study completion returned before the separate progress trigger had necessarily applied XP. A successful session save was not a confirmation of the final XP award.
- Login and unrelated progress events could advance streaks. The server used the old +300 day-30 bonus and date-based milestone keys, instead of a once-only +150 milestone.
- Flashcard XP required only that a deck existed, rather than 10 distinct active answers. It also used a different daily limit.
- Focus used a one-minute minimum and lacked the approved 80 XP source cap and 180 XP ordinary cap. Elapsed-wall-clock checking did not explicitly track pauses.
- Goal rewards used the current editable target rather than an immutable daily snapshot and a 20-minute minimum.
- Telegram task completion directly incremented profile XP outside the trusted ledger.
- Daily analytics summed session XP, omitting login, daily-goal and achievement rewards. Several displays could be coupled to unrelated statistics failures.
- There was no global implementation of the approved A01–A16 achievement catalogue.

These are code findings, not claims about which Firebase Functions version is currently deployed. Production requests route through `api/rpc.js` to the same Firebase handlers via `functions/vercel.cjs`; that authentication wrapper was preserved.

## 2. Implementation summary

The user's “start” was treated as approval of the seven pending choices presented in chat: manual Planner Done = 0 XP; ordinary cap = 180; A01–A16 rewards; Focus minimum = 5 verified minutes; recall = 10 distinct cards / 15 XP with two daily paid blocks; daily goal = saved target and at least 20 verified minutes; and the growing level 11+ formula.

The server now owns evidence validation and reward application. Completion atomically writes the study record, ledger, daily counters, cumulative XP, derived level, qualified-day streak and newly unlocked achievements. Requests with the same session or recall proof return the stored result. Concurrent devices contend on the same trusted progress and proof documents rather than independently incrementing totals.

Focus retains its existing timer, breaks, music, local fallback and Planner links. The verification hook sends pause/resume updates and 30-second heartbeats. A server lease credits at most 90 seconds between observations; long missing intervals cannot become verified study automatically. Recorded and verified durations are retained separately, and the result explains differences. Source caps do not discard verified study time. Separate contexts preserve their proof records while sharing one active clock. Overnight proof time is allocated to the correct Tashkent days with one shared 20 XP session cap.

Active Flashcard modes request a server-issued session tied to saved cards. Nonempty attempts, valid membership in that proof, elapsed server time, per-day card identity and normalized content uniqueness are checked. Accuracy is not required. Flipping, classic self-rating, deck creation/import and duplicate content do not independently earn XP. Pending submitted proof requests can be retried with stable IDs; an offline/device-only practice session is not automatically promoted to verified activity.

Daily login uses Firebase-verified `auth_time`; restoration on a later day snapshots the target without creating a new login reward. Login does not qualify a streak. A qualifying day needs 10 verified Focus minutes or 10 distinct active recall cards. A11/A12 carry the once-only streak rewards, so no second milestone reward is added. Known legacy streak rewards suppress a duplicate bonus.

Goal edits use a callable that captures the existing target before changing the profile. Rules prevent direct target edits from bypassing this snapshot. Source caps, ordinary caps and uncapped once-only bonuses are accounted for separately. Same-day legacy login/goal/recall reward flags and confirmed legacy Focus ledger entries seed the cutover limits without adding XP or importing legacy activity as new achievement evidence.

Levels 1–10 use the complete PDF thresholds; higher levels use the approved formula and Academic Legend II, III, etc. Within-level progress is calculated consistently. Example: 1,300 total XP = level 5, 300/600 XP, 50%, 300 remaining.

Dashboard, Profile and Progress surfaces reuse one small component. It shows total XP, level/title, within-level progress, streak, confirmed daily XP, achievement requirements/progress/unlock dates, rarity, recent ledger history, recent source breakdown, active-day XP trend and level history. Labels and statuses support English, Uzbek and Russian; controls support keyboard use, mobile and dark mode. Level-up feedback uses a native dialog without required animation.

## 3. Changed files

Paths below are relative to the workspace. The source comparison is saved in `artifacts/xp-verification/source.diff`.

| File | Reason |
|---|---|
| `src/contexts/AuthContext.tsx` | Derive levels from canonical XP; add idempotent authenticated check-in without changing login/onboarding routing. |
| `src/lib/cloudMetrics.ts` | Send the selected XP calendar day independently of the browser time zone. |
| `src/lib/progress.ts` | Await server completion and expose the confirmed receipt; retain existing callers and IDs. |
| `src/lib/progressMath.ts` | Use complete level thresholds; remove obsolete Planner/quiz/upload reward amounts; correct Focus minimum and day-30 bonus. |
| `src/lib/useUserActivityMetrics.ts` | Read v2 daily totals, retain historical daily XP, calculate levels consistently and accept timestamp streak data. |
| `src/pages/Analytics.tsx` | Add progression details and keep XP visible independently of unrelated statistics failures. |
| `src/pages/Focus.tsx` | Connect pause/resume/heartbeat verification and show confirmed/capped/unverified results without replacing the timer. |
| `src/pages/Profile.tsx` | Add achievements/progress and save daily target changes through the immutable snapshot handler. |
| `src/features/analytics/GlassProgress.tsx` | Insert the shared progression panel into the existing PRO progress surface. |
| `src/features/flashcards/Study.tsx` | Submit active answers separately from existing card scheduling; flips and self-ratings earn no XP. |
| `src/features/free/FreeAnalytics.tsx` | Insert the same progression details into the Free progress surface. |
| `src/features/free/FreeFocus.tsx` | Use the same verification and confirmed reward handling as PRO Focus. |
| `src/features/pro/GlassDashboard.tsx` | Add the compact XP summary to the existing dashboard. |
| `src/components/Dashboard/TodayDashboardView.tsx` | Add the compact XP summary to the shared/Free dashboard. |
| `functions/index.js` | Register the transaction adapter, retain trigger retries, and remove direct XP from Telegram Planner completion. |
| `functions/metrics.js` | Use authoritative daily XP when available while retaining pre-v2 historical statistics. |
| `functions/package.json` | Include the new policy and store modules in syntax checks; no dependency changes. |
| `functions/policy.js` | Align the legacy session estimate with the approved five-minute Focus rule and disabled quiz/revision XP. |
| `functions/policy.test.js` | Update the minimum-duration expectation to the approved rule. |
| `functions/security.test.js` | Test new proof/cap behavior and preserve unrelated security coverage. |
| `tests/audit-regression.test.cjs` | Allow the pure shared level catalogue dependency while continuing to prohibit service dependencies. |
| `tests/browser-server.mjs` | Add isolated XP fixtures for browser verification; production runtime behavior is unaffected. |
| `tests/firestore.rules.cjs` | Test server-owned daily snapshots, proof access isolation and protected goal updates. |
| `tests/focus.test.cjs` | Adapt the isolated React harness for the verification hook while retaining timer regression cases. |
| `firestore.rules` | Keep new XP evidence server-owned; prevent bypassing the daily-goal snapshot through a direct profile edit. |
| `package.json` | Include progression integration tests in the existing emulator command; no dependency changes. |
| `src/lib/levels.ts` | Pure frontend level calculation, threshold lookup and within-level progress. |
| `src/lib/useVerifiedFocusSession.ts` | Attach verification updates to the existing timer lifecycle. |
| `src/lib/verifiedProgress.ts` | Typed callable transport and ordered session state updates. |
| `src/features/progression/progression.css` | Scoped progress bars, theme tokens and visible keyboard focus. |
| `src/features/progression/ProgressionPanel.tsx` | Accessible total XP, progress, streak, 16 achievement states, history, trends and level-up feedback. |
| `src/features/progression/useRecallRewards.ts` | Active-answer submission, retained pending proof requests and explicit retry/error states. |
| `functions/progression.js` | Pure approved reward, cap, streak, achievement and level policy. |
| `functions/progression.test.js` | Boundary and policy tests for all 16 achievements and approved earning rules. |
| `functions/progressionStore.js` | Authenticated server proofs, atomic ledger/progress updates, deduplication, goal snapshots and overnight allocation. |
| `functions/xp-catalog.json` | Shared level and achievement catalogue; no paid-plan multiplier. |
| `tests/progression-browser.cjs` | Three-language mobile/dark UI, achievement filtering, reload and failure-state journeys. |
| `tests/progression-levels.test.cjs` | Frontend/backend agreement through 100 levels and the 1300 XP / 50% example. |
| `tests/progression-migration.test.cjs` | Repeatable offline migration planning, canonical XP preservation and exclusion of unverified evidence. |
| `tests/progression.firestore.cjs` | Real emulator transactions, concurrency, replay, account isolation, caps, pauses and overnight sessions. |
| `scripts/plan-xp-migration.cjs` | Offline-only migration plan; cannot connect to or modify Firebase. |

`docs/XP_IMPLEMENTATION_REPORT.md` is the delivery report itself. Build output, screenshots, test logs and an adapted temporary browser test are verification artifacts, not application source changes.

## 4. Preserved functionality and verification boundaries

- Focus regression tests retain start/pause/resume/reset, restoration, local completion, delayed-start protection and Planner attribution coverage.
- Real Firestore rule tests verify Planner compare-and-swap persistence, private immutable history, account isolation, onboarding fields and existing protected data.
- The unchanged broad Planner browser test fails at the same “Week overview” wait in both the untouched source backup and the updated app. Therefore that full browser journey is not claimed as passing.
- Fifteen current Flashcard browser journeys pass after adapting only an artifact copy of the stale initial heading selector. Coverage includes legacy decks, drafts, editing, definitions, flip/grading, typing, missing letters, matching, choices, adaptive study, Planner links, revision history, layout, account switching and corrupt-storage preservation.
- Tutor and Notebook success/error/retry journeys pass with isolated provider responses across three languages and light/dark themes. AI prompts, models, quotas, uploads and document processing code were not changed.
- Free/PRO fallback checks pass across eight existing routes. Subscription/payment code and feature restrictions were not modified.
- Actual production Google login, email/password recovery, payments, Telegram delivery, deployed triggers and real external AI responses were not exercised. No production-readiness claim is based on fixture responses alone.

## 5. Test results

| Check | Outcome |
|---|---|
| TypeScript (`npm run lint`) | Passed |
| Functions syntax checks | Passed |
| Frontend unit/regression suite | 267 tests: 266 passed, 1 failed, 0 skipped |
| Firebase Functions suite | 67 passed, 0 failed, 0 skipped |
| Firebase Functions suite under Node 22 | 67 passed, 0 failed, 0 skipped |
| Separate server suite | 36 passed, 0 failed, 0 skipped |
| Firestore emulator + security/integration suites | 24 passed, 0 failed, 0 skipped |
| Production build | Passed |
| New XP UI journeys | 4 passed: three-language galleries/progress and failure independence |
| Tutor/Notebook browser matrix | 12 passed: two modules × three languages × two themes |
| Free/PRO fallback browser checks | 8 passed routes |
| Current-label Flashcard browser verification | 15 passed journeys; original test source was not changed |
| Full `npm run verify` | Fails on the same pre-existing onboarding assertion |

The pre-existing frontend failure is `onboarding advances without artificial delays or blur transitions` in `tests/performance-foundation.test.cjs`. It rejects the existing Motion/AnimatePresence imports. The onboarding implementation was left untouched. The original baseline was 263 tests: 262 passed and this same single failure. Four new level/migration tests account for the increase to 267.

The broad core browser suite stops waiting for the old “Tutor language” combobox. The broad Planner suite stops waiting for “Week overview”. Both failures were reproduced against the untouched source archive in a separate temporary checkout. Consequently later tests in those aggregate commands were not executed by those commands; the separate passing suites above are reported individually. The original Flashcard browser command waits for the obsolete “Flashcards2.0” heading; an artifact-only copy changed that entry wait to the existing workspace and then passed all 15 journeys.

Emulator tests use only `demo-noviq` at `127.0.0.1:8089`. Server-time fixtures are seeded to avoid waiting real minutes; Firestore transactions, contention/retries, persistence and access-rule enforcement are real emulator operations. They are not a deployed production end-to-end test. Expected permission-denied logs are assertions of denied access, not hidden test failures.

## 6. Firebase compatibility, migration and rollback

Existing Firebase Authentication, Firestore and the Vercel callable adapter remain in use. There is no replacement database and no new application dependency.

Changed callables: `startStudySession`, `completeStudySession`.
New callables: `checkInProgress`, `updateDailyGoalTarget`, `updateStudySessionState`, `startRecallSession`, `submitRecallAttempt`.

Existing study/progress triggers remain as idempotent compatibility/retry paths. Legacy client award proposals are retained with a rejection reason, rather than trusted as proof. Pre-upgrade running timers can retain their study history as explicitly unverified without receiving fabricated v2 rewards.

New server-owned paths: `users/{uid}/xpDays/{day}` and `users/{uid}/recallEvidence/{proof}`. Existing trusted proof/progress and progress-event paths are reused. No new composite indexes are required by the added document and single-field queries. Existing non-XP indexes are unchanged.

Historical XP uses trusted progress when it exists, otherwise the existing server-protected profile XP. Existing user documents, raw histories, subscriptions, settings and old achievements are not deleted or recreated. New v2 achievement counters do not silently import client Planner points or old self-reported review totals.

Historical verified Focus achievement backfill requires separately reviewing a complete export and authorizing a migration. `scripts/plan-xp-migration.cjs` only reads an isolated JSON export and prints a repeatable proposal. It has no Firebase connection or apply mode. It preserves the canonical XP total, proposes derived levels/counters from verified Focus records, retains old fields in its rollback snapshot, and rejects incomplete exports. It was tested only with isolated fixtures. No production export or migration was run.

Before an authorized rollout: back up the actual user/progress/ledger data; stage the full backend/client/rules combination; test real accounts, existing sessions and old-XP fixtures; review the dry-run backfill if desired; reconcile ledger deltas against the preserved opening balance. The new target-save endpoint and direct-write rule must be deployed with the updated client. Old open bundles should be refreshed; otherwise their previous target-save path will be rejected safely. Rollout must account for heartbeat verification rather than assume an old client produces v2 proofs.

Rollback must preserve ledger events and earned XP. Restore the prior reviewed client/backend/rules combination together, retain all v2 collections, and reconcile any subsequent earnings before applying derived-field rollback or an explicitly authorized append-only correction. Do not overwrite current totals from an older snapshot.

## 7. Production readiness

- Implemented: approved earning rules, levels, badges/achievements, server authority, caps, proof uniqueness, pending/error states and scoped UI integration.
- Tested locally: type checks, Functions and server suites, policy/level/migration tests, build and browser fixtures.
- Tested in isolation: real Firestore emulator transactions/rules, mixed-source concurrency, replay, account isolation, pauses, caps, daily target snapshots and overnight allocation.
- Not verified in production: deployed callable/rules compatibility, real credentials/accounts, deployed trigger behavior, external providers and production data reconciliation.
- Requires approval and deployment: backend, client and Firestore rules. Historical backfill, if wanted, requires a separate reviewed production migration authorization.

## 8. Remaining issues and risks

1. The confirmed pre-existing onboarding unit-test failure keeps the umbrella verification command red.
2. The broad browser suites have stale/unmet Tutor and Planner selectors; these failures predate this implementation. Their remaining aggregate journeys cannot be claimed as passing.
3. A real authenticated staging/production journey through login → Focus/recall → confirmed XP → another device remains required before production acceptance.
4. Browser suspension or a missing heartbeat interval can reduce verified time. Recorded duration is retained separately; the UI does not present missing time as verified XP. Background/throttled-device behavior should be checked with the actual supported devices during staging.
5. Existing XP is preserved, but historical achievement counter backfill is intentionally not applied without a reviewed export and explicit authorization.
6. Active-answer validation proves authenticated, timed, distinct submissions against saved cards; it cannot prove human attention or stop all automation. Rate/cap and identity/content deduplication are the enforced boundary.
7. This workspace has no `.git` directory. Branch, commit, tracked/untracked state and a Git-native final diff cannot be established from it.

## 9. Final comparison and scope review

A pre-edit source archive was saved at `C:/Users/User/.codex/xp-baseline-20261026.zip`. The original source was also extracted to a separate temporary baseline to reproduce the two broad browser failures. The final source comparison uses that archive rather than claiming an unavailable Git diff.

All modified application files are restricted to XP policy, verification/evidence transport, level/streak display, reward feedback, the necessary goal-target protection and removal of the self-reported Telegram Planner reward. Tests, the offline migration planner and this report support that scope. No unrelated AI, payment, scheduling, Notebook, onboarding-screen, environment, project-settings or deployment configuration changes were made. No destructive Git operation, push, merge, deployment, production migration or production data modification was performed.
