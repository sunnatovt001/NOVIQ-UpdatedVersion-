# NOVIQ

React 19 + TypeScript + Vite study platform using Firebase Authentication,
Firestore, Storage, Gemini tutoring, planner, notes, flashcards and focus sessions.

## Local development

1. Install Node.js and run `npm ci` in this directory.
2. Run `npm ci` in `functions`. Deployed functions use Node.js 20.
3. Copy `.env.example` to `.env.local` for public frontend settings.
4. Copy `functions/.env.example` to `functions/.env` and configure server keys.
5. Confirm `firebase-applet-config.json` and `firebase.json` target the intended
   Firebase project and named Firestore database.
6. Run `npm run dev`. Page links use hashes such as `/#/planner`, supporting
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
The server defaults to `gemini-3.8-flash`; `GEMINI_MODELS` can configure server
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
and the Firestore emulator suite on Node.js 22 with Java 21. Deployed Functions
retain the Node.js 20 runtime specified in `firebase.json`.

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
CLI; it never targets the production project. The current machine has Java 8,
so this emulator suite has not been executed here.

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
- Offline notes/profile writes persist before synchronization. Verified study
  sessions and online payments require connectivity.
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
