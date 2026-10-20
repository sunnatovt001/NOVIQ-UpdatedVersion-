# NOVIQ production recovery

## Architecture

Vercel serves Vite's `dist` and the native `api/rpc.js` and `api/telegram.js`
functions. Both import `functions/vercel.cjs`, which initializes Firebase Admin
and loads `functions/index.js`. The frontend signs in with Firebase Auth and
reads the named Firestore database in `firebase-applet-config.json`.
Production callable operations, Telegram link hashes, user bindings, switch
actions, planner reads and metrics all use that same Firestore database.
`server/src/main.mjs` is a separate MongoDB server; Vercel does not start it.
`server/local-telegram.cjs` is Vite development middleware and is not deployed
as a production route. No migration or data reset is required.

## Required Vercel Production settings

| Name | Purpose |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Required by the Vercel adapter. Complete service-account JSON with `project_id`, `client_email`, `private_key`; project must match `firebase-applet-config.json`. Supply through Vercel's protected environment settings. |
| `TELEGRAM_BOT_TOKEN` | Token belonging to `@noviqq_bot`; required for link creation and webhook operation. |
| `TELEGRAM_WEBHOOK_SECRET` | Random Telegram-compatible secret configured both in Vercel and the registered webhook. Required, never optional. |
| `CRON_SECRET` | Required for the configured daily notification cron; Vercel supplies it as a bearer header. |
| `PUBLIC_APP_URL` | Set to `https://noviqupdated.vercel.app`; system Vercel URL variables and the verified production fallback also resolve URLs. |
| `VITE_TELEGRAM_BOT_USERNAME` | Optional, defaults to `noviqq_bot`. Build-time value: rebuild when changed. |
| `FIRESTORE_DATABASE` | Optional; if supplied, must match `firebase-applet-config.json`'s `firestoreDatabaseId`. Existing default matches that database. |
| `FUNCTIONS_REGION` / `VITE_FUNCTIONS_REGION` | Optional; default `us-central1`. |
| `GEMINI_API_KEY` | Required for AI operations, not backend initialization or Telegram linking. |

The Firebase client configuration is imported from `firebase-applet-config.json`,
not populated from VITE Firebase environment variables. MongoDB credentials
are not used by these Vercel entrypoints. Existing payment provider variables
remain feature-specific and are unchanged.

Ensure the service account has the existing Firestore and Auth permissions
needed by the handlers. JSON syntax and a valid PEM alone do not prove IAM
permissions, database existence or connectivity. Never use a development
database as a fallback.

## Diagnosing the startup 503

The original adapter discarded every exception, emitting only `NOVIQ backend
initialization failed.` The updated server logs emit a safe code and corrective
action, without raw exceptions, request payloads, credentials or tokens:

- `BACKEND_NOT_CONFIGURED`: missing `FIREBASE_SERVICE_ACCOUNT_JSON`.
- `FIREBASE_CREDENTIAL_JSON_INVALID`: invalid JSON or shell-quoted JSON.
- `FIREBASE_CREDENTIAL_FIELDS_MISSING`: incomplete account JSON.
- `FIREBASE_PROJECT_MISMATCH`: credential belongs to another Firebase project.
- `FIRESTORE_DATABASE_MISMATCH`: server/database mismatch with frontend.
- `FIREBASE_PRIVATE_KEY_INVALID`: invalid PEM key.
- `BACKEND_MODULE_MISSING`: inspect dependency installation and function bundle.
- `BACKEND_RUNTIME_FAILURE`: handler/provider failure requiring further inspection.

Clients retain the safe 503 callable response. This change does not manufacture
credentials or establish which exception occurred in a live deployment whose
logs are inaccessible. Production service recovery requires resolving the
actual configuration failure and validating an approved deployment.

## Validation and release sequence

1. Review the recovery diff and local test report. Supply missing protected
   Production settings in Vercel; confirm the correct project and named database.
2. Obtain explicit user approval before pushing or deploying. Do not deploy
   or automatically push this branch to main.
3. After approval, deploy the reviewed commit with Production environment values.
4. Verify signed-in `/api/rpc?name=createTelegramLink` succeeds; a fabricated
   bearer token must return 401, not an initialization 503. Verify that a request
   with the wrong Telegram webhook secret returns 401 without loading handlers.
5. Stop the local polling runner before any webhook routing change. Confirm no
   `getUpdates` consumer remains. Do not change webhook routing without explicit
   approval, even when all prerequisites pass.
6. Inspect `getWebhookInfo`: URL must be
   `https://noviqupdated.vercel.app/api/telegram`; check pending updates and last
   delivery error. If registration is needed, use the same secret as Vercel and
   preserve queued updates unless the user explicitly approves discarding them.
7. Test Profile > Connect Telegram with an existing account, `/start link_TOKEN`,
   `/planner`, `/metrics`, website status, disconnect and explicit A-to-B switch.
   Old and expired links and replayed switch actions must fail; Account A's
   records and study progress must remain unchanged after switching to B.

The original webhook records update IDs before execution. This preserves
deduplication, but an exception after the claim can leave an update marked
processed before completion. No exactly-once delivery guarantee is claimed;
transactional token consumption and switch protection remain authoritative.
