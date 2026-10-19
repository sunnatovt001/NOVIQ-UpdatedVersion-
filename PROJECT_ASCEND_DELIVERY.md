# NOVIQ PRO — Project Ascend delivery

Status: implemented and verified locally. Not deployed. The broader product brief includes integrations and deeper learning products that remain incomplete, listed below.

## Delivered

- Added a cohesive, optional midnight PRO environment, responsive dashboard, onboarding, membership page, and contextual entry points. Free users keep their existing dashboard and learning tools. Existing approved prices remain 39,000 UZS monthly and 299,000 UZS yearly; annual savings are 169,000 UZS (36%).
- Preserved the repaired Flashcards study layout: a dedicated study layer, grouped controls, central card, compact study options, and responsive rating controls. PRO adds an accessible two-sided flip with reduced-motion support.
- Added server-owned membership states and explicit, no-card seven-day trial activation. Transactions prevent concurrent activation from extending a trial. Server time determines access; expired trials cannot restart.
- Added hourly scheduled trial reminders/expiry reconciliation with idempotent audit records and in-app notifications. Access checks enforce expiry even if the scheduled job is delayed. Cancellation preserves the current paid period and all learning content.
- Centralized prices, finite AI quotas, trial duration, and feature switches in `functions/pro-config.json`. Premium AI operations check authenticated ownership, feature availability, current entitlement, and atomic quotas on the server.
- Added learning overview, Exam Center, subject/task Atlas, weekly report export, quick capture, mistake journal, coaching/practice/summary tools, editable AI deck drafts, and optional Focus reflections. These connect to existing Planner, Tutor, Flashcards, and Notebook flows.
- Generated content requires explicit acceptance before saving. New journal, summary, and reflection notes are ordinary Notebook records and remain accessible after downgrade. Planner schedules are not automatically overwritten.
- Added English, Uzbek, and Russian copy for the new experience; keyboard/focus handling; mobile layouts down to 320px; and reduced-motion behavior.

## Evidence and privacy

The interface uses saved subjects, tasks, completed Focus sessions, and dated review attempts. Task completion is not presented as mastery. Empty history does not produce invented confidence or predictions. Weak-card suggestions require repeated recorded misses, scoped to the correct deck.

Weekly charts use seven calendar days in the Planner timezone. Bars scale against summed daily totals, including multiple sessions on one day. Historical snapshots are bounded: latest 100 Focus records, 30 review sessions, and 60 notes. This is not an exhaustive lifetime analytics system.

Personal context in coaching is optional. AI replies from stale account or route requests cannot install themselves into a newer session. Entitlements are never granted by local storage; stored appearance/navigation preferences are cosmetic only.

## Validation completed

Final run after the weekly-chart correction:

- `npm run verify`: TypeScript, backend syntax, **214 application tests + 39 backend tests**, and production build passed.
- `node tests/ascend-browser.cjs`: membership selection, Free preview/gates, trial activation through actual backend handlers, refresh, drafts/explicit save, Atlas/Exam/report, narrow layouts, reduced motion, cancellation, expiry, localization, and no production requests passed.
- `node tests/ascend-learning-browser.cjs`: journal/coaching context, saved-note summary, premium Tutor authorization/quota path, Focus reflection, PRO flip accessibility, contextual navigation, and post-downgrade Notebook access passed.
- `git diff --check`: passed; Git reported only line-ending notices for existing audit artifacts.

Additional suites passed before the final chart-only correction:

- Firestore emulator: **15 tests**, including concurrent trial transactions, scheduled reconciliation idempotence, owner isolation, denied client entitlement/audit forgery, existing Planner CAS/history protection, and large metrics backfill.
- Existing Flashcards browser regression, including legacy content, drafts, study modes, resume, Planner completion, mobile/desktop layout, theme portals, and account isolation.
- Planner persistence browser regression: refresh/navigation, account isolation, recoverable save failures, and no plan creation on entry.
- Existing Tutor/Notebook light/dark browser checks across English, Uzbek, and Russian.

Browser workflows used isolated local storage/provider fixtures with actual application code and backend handlers. They do not establish live AI response quality, production deployment health, or merchant settlement readiness. Screenshots in `artifacts/ascend/` use fixture accounts/content.

## Release requirements

Coordinate deployment of the client, Functions, Firestore rules, and the subscription status/expiry composite index. New server entry points are `getMembershipStatus`, `startProTrial`, `cancelProRenewal`, and `reconcileProMemberships`; existing AI, cancellation-trigger, and verified-payment paths were updated. Preserve the repository's configured database/project settings. No production migration or deployment was run.

Rules protect root subscription fields and server audit events. New onboarding preferences live in the owner's `proExperience` collection; actual trial/cancel/expiry audit events live in `proEvents`. New learning notes use the existing Notebook collection. Scheduled reconciliation needs the existing Firebase scheduling infrastructure and the new index ready before rollout.

Live checkout stays disabled when the server reports no provider configuration. Existing trusted merchant webhook validation and receipt idempotence are retained; distinct verified payments extend the paid period without shortening it. No real payment was attempted.

## Incomplete parts of the full brief

- Native Payme/Click recurring billing, authorized recurring mandates, sandbox settlement, renewal/failure reconciliation, and merchant onboarding have not been implemented or verified. The existing generic verified merchant bridge is retained. Payme documents merchant credentials and tokenized recurring-card capability in its [Subscribe API](https://developer.help.paycom.uz/protokol-subscribe-api/) and [card creation protocol](https://developer.help.paycom.uz/metody-subscribe-api/cards.create/); Click publishes its merchant integration through the [official integration repository](https://github.com/click-llc/click-integration-php).
- Google/Apple calendar synchronization is disabled. No new email/Telegram trial-reminder delivery or quiet-hours manager was added. Trial reminders are in-app only.
- The existing tested spaced-repetition scheduler is preserved. No FSRS migration was shipped.
- Atlas shows saved subject/task evidence. It is not an assessed prerequisite graph. Exam Center does not add a complete official exam curriculum, standardized grading, or score predictions.
- No aggregate administrator conversion-funnel dashboard or exhaustive historical reporting system was shipped.
- Live AI quality, live merchant behavior, and the public deployment remain unverified. The public URL could not be inspected in this environment.

## Main implementation locations

- `src/features/pro/`: membership context, UI, copy, learning hub, coaching controls, reflections, evidence helpers, and visual tokens.
- `functions/membership.js`, `functions/pro-config.json`, `functions/policy.js`, `functions/index.js`: server authority, quotas, scheduling, and payment/cancellation integration.
- `firestore.rules`, `firestore.indexes.json`: owner access and subscription query support.
- `tests/ascend-*`, `functions/pro.test.js`: isolated browser, unit, server-handler, and emulator coverage.

Existing unrelated local changes were preserved. No commit or deployment was created.
