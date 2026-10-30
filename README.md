# NOVIQ

React 19 + TypeScript + Vite study platform using Firebase Authentication,
Firestore, Storage, Gemini tutoring, planner, notes, flashcards and focus sessions.

## Active backend

Firebase Authentication provides identity. Firestore is the default data authority.
An explicitly migrated deployment can select MongoDB with **both**
`VITE_DATA_BACKEND=mongodb` and `NOVIQ_DATA_BACKEND=mongodb`. These values must
match when building a deployment; an outage never switches databases.
MongoDB mirroring is a separately configured asynchronous backup, not failover.
Before a MongoDB cutover, verify the import and run
`node --env-file=server/.env server/scripts/backfill-document-order.mjs` to add
sortable metadata and pagination indexes to legacy canonical records. This script
uses version checks and changes metadata only. It does not change user content.
Legacy records remain readable through a streaming compatibility path until then.
The `/backend-check` screen is excluded from normal builds; a separate staging
build must explicitly set `VITE_ENABLE_MONGO_STAGING=true` to enable it.

## Release and notifications

Vercel runs `npm run verify && npm --prefix server test` before accepting a build,
so TypeScript, backend syntax, unit/HTTP tests and the frontend build must pass.
GitHub Actions additionally checks Firestore rules and browser workflows.

The Firebase notification scheduler is configured for five-minute sweeps. Daily
summaries are eligible after 21:00 Asia/Tashkent; scheduled sessions get a 15-minute
advance window and explicit task deadlines a 30-minute window. Delivery depends on
the scheduler being deployed and enabled. The existing free Vercel daily cron is
only a fallback; it cannot provide precise reminders. Do not enable a paid service
just to change the frequency. Avoid running two independent bot implementations.

Sweeps use pagination, a persisted cursor, a run lease and per-message transaction
claims. A network timeout has an unknown delivery outcome and is not resent
automatically, since Telegram provides no sendMessage idempotency key.

Client analytics paginate original Firebase records in bounded pages when server
metrics are disabled. Keep server metrics opt-in until its projections, triggers,
indexes and legacy backfill have been verified; MongoDB is not needed for this.

## Local development

1. Install Node.js and run `npm ci` in this directory.
2. Run `npm ci` in `functions`. Functions target Node.js 22.
3. Copy `.env.example` to `.env.local` for public frontend settings.
4. Copy `functions/.env.example` to `functions/.env` and configure server keys.
   Run `npm ci --prefix server` too; verification covers this backend.
5. Confirm `firebase-applet-config.json` and `firebase.json` target the intended
   Firebase project and named Firestore database.
6. Run `npm run dev` (loopback only by default). Page links use `/planner`, supporting
   browser back/forward navigation and the existing Hosting rewrite.

Gemini and Telegram keys belong only in Functions configuration, never `VITE_*`.
Local frontend development uses deployed Firebase services, not automatic emulators.

For an audit of an existing account, use `npm run dev -- --mode audit`.
This opt-in mode skips telemetry, notification creation and planner autosave,
blocks queued writes/flushes and session starts, and does not clear stored data.
Test send/save/provider flows with isolated fixtures rather than a live account.
Normal development and production builds keep their existing behavior.

For local Gemini testing without cloud data writes, run `npm run dev:local-ai`
and open `http://localhost:3000`. This mode reads the Gemini key only from
`functions/.env` on the Vite server, verifies Firebase ID tokens, restricts
requests to the local machine/origin and applies a 10-request/minute limit.
AI answers are available but chat history, telemetry and progress are not saved.
This development-only proxy is excluded from production builds. Normal builds
continue to use authenticated Firebase Functions and their existing quotas.
The Tutor defaults to `gemini-3.5-flash-lite`; `GEMINI_MODELS` can configure server
models. The old 2.5 Flash model returned 404 for the supplied account in live tests.

Nexus member directories use `getCommunityMembers` (50 members per page),
and normal-mode presence uses `updateCommunityPresence` with per-tab 120-second
leases. Only actual group members may read the directory. Online means a visible
website tab reported activity in the last two minutes; it is not Telegram presence.
Existing display names and usernames are used, with no fabricated usernames.
Directory responses omit private account fields. Online summaries are unavailable
for groups above 1,000 members to avoid unbounded reads; larger-group aggregation
needs a separate scaling design. Audit/local-AI modes do not write presence.
These new callables must be deployed later before live Nexus counts/presence
can work; this local task did not deploy them.

## Verification

Run `npm run verify` before pushing. It runs TypeScript, Functions syntax checks,
all isolated tests and the production build. GitHub Actions also runs this command
and the Firestore emulator and browser recovery suites on Node.js 22 with Java 21.
Functions target the same Node.js 22 runtime in `firebase.json`.

```text
npm run lint
npm test
npm run build
npm --prefix functions run lint
npm audit
npm --prefix functions audit
```

Tests use isolated transaction and local storage harnesses. They cover concurrent
AI quotas, analytics retries, forged XP, session timing, payment replay, Telegram
tokens and offline sync revisions. They do not replace Firebase emulator rules
tests or live provider verification.

`npm run test:rules` runs the separate security-rule suite on a local demo
Firestore emulator. It requires a current Java runtime (Java 21+) and Firebase
CLI; it never targets the production project. All 9 rule tests passed locally
using portable Java 21. Set JAVA_HOME and PATH to Java 21 before running it.

`npm run test:browser:ci` starts and cleans up the isolated browser server.
It uses installed Chrome by default; CI installs Playwright Chromium and sets
NOVIQ_BROWSER_CHANNEL=chromium. See [LAUNCH_READINESS.md](LAUNCH_READINESS.md)
for live blockers, domain configuration, backups and release/rollback checks.

## Server limits and progress

- Free AI daily limits (Asia/Tashkent): tutor 5, notebook 5, planner 2,
  flashcards 2; combined maximum 14. Pro has a 300-request daily fair-use cap.
- All accounts have a 10-request per minute AI limit. Quota is reserved atomically
  before the provider call. Internal retries do not reserve quota again. Failed
  provider requests currently consume one reserved request.
- Focus and planner start a server-issued session. Completion requires at least
  60 seconds and is capped at elapsed server time. Starting another session
  replaces the active session for the account. Each session is processed once.
- Only server-created sessions contribute trusted XP and study time, with an
  8-hour daily cap. Focus earns up to 20 XP from verified minutes, quiz 20,
  revision 15. Login, verified daily goals and streak milestones are awarded once.
  Flashcard review earns at most one 15-XP reward per day.
- Client-proposed XP and mission/invitation/monthly bonuses are ignored. Planner
  practice points are separate from trusted account XP.
- New profile/document saves require a server acknowledgment and internet access.
  Notebook editor drafts are stored separately on the device in both Free and Pro;
  a draft is not a cloud save. Legacy offline queues can still be retried/exported.
  Verified study sessions and online payments require connectivity.
- Admin access uses Firebase custom claims/server profile state. Frontend
  environment variables cannot grant admin access.

## Telegram

Configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` on the server and
`VITE_TELEGRAM_BOT_USERNAME` on the frontend. Register `telegramWebhook` with
Telegram's `secret_token` matching `TELEGRAM_WEBHOOK_SECRET`.

Profile's Connect bot creates a random single-use link valid for 10 minutes.
Only private chats can consume it. UID links and manual chat ID edits cannot
link accounts. Send test uses the verified chat ID.

## Payments

Online checkout shows a clear unavailable message until a trusted payment adapter
is configured. The adapter must integrate Click, Payme or a card provider and
verify provider signatures before calling NOVIQ's webhook.

Set `PAYMENT_CHECKOUT_URL` to the adapter HTTPS endpoint,
`PAYMENT_CHECKOUT_SECRET` to its bearer secret, `PAYMENT_ALLOWED_HOSTS` to the
comma-separated exact hostnames of its payment pages, and
`PAYMENT_WEBHOOK_SECRET` to the webhook secret shared with the adapter.

Checkout sends POST with Authorization: Bearer <secret>, an Idempotency-Key
header, and JSON containing userId, checkoutId, billingCycle, provider, amount,
currency. Prices are server-selected: 39,000 UZS monthly and 299,000 UZS yearly.
The adapter returns `{ "checkoutUrl": "https://allowed-payment-host/..." }`.

After verifying settlement, the adapter POSTs to `paymentWebhook` with
`x-noviq-webhook-secret` and userId, checkoutId, provider, amount, currency,
transactionId, action: "activate". Transaction IDs are unique per provider.
Replays cannot extend subscriptions; mismatched payments are rejected. Manual
admin verification also validates checkout data. Cancellation requests remain
pending until the billing adapter confirms action: "cancel_renewal" with userId.

The repository provides the adapter contract, not merchant credentials or a
provider-specific signature implementation.

## Deployment

`npm run deploy:full` builds and deploys Hosting, Functions, Firestore rules and
Storage rules. Deploy them together: the client and rules depend on new callable
session, checkout and Telegram-link functions. Firebase billing, enabled login
providers, merchant setup and webhooks require external service configuration.

Firebase transaction reference:
https://firebase.google.com/docs/firestore/manage-data/transactions

Event retry reference:
https://firebase.google.com/docs/functions/retries

## Community and study timers

Community creation, joining/leaving, chat and friend acceptance use authenticated
server functions. Membership and friend documents are server-owned; chat history
is readable only by members. Message retry IDs prevent duplicate sends, and sends
are limited to 30 per user per minute. Chat loads 50 messages at a time with older
history available on demand. Drafts stay on the device across page navigation.

Invitation links expire after 7 days. The sender copies and shares the link;
the app does not send an invitation email. Only the intended recipient with a
verified email can accept, and both accounts receive the friendship atomically.
Legacy invitation links must be regenerated from Community.

Planner and Focus have separate resumable session proofs valid for 8 hours.
Returning to a timer restores it paused. Planner answers survive an expired
session, but the timer must restart. Server wall-clock accounting prevents
parallel timers from crediting duplicate elapsed time. Planner state is cached
locally and queued for cloud sync when leaving the page.

Statistics use server count/sum aggregations and refresh each minute or when the
page regains focus. Full card/message collections are no longer live listeners
on statistics screens. Deploy `firestore.indexes.json` with the new client;
Firestore may need time to build the indexes before statistics are available.
