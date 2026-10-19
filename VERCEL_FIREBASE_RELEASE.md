# Firebase backend on Vercel — 2026-10-19

The owner requested a public deployment with working AI and explicitly retained
the free-only restriction. Firebase Cloud Functions cannot be deployed on the
current Spark project without upgrading billing. Billing was not upgraded.

## Production architecture

- React/Vite frontend and `/api/rpc` run in the existing `noviq` Vercel project
  under `saidamins-projects-aa9c99df` (Hobby).
- Firebase Authentication and the existing named Firestore database remain the
  identity and data source. MongoDB staging is not part of production.
- Production callable requests use the same-origin Vercel endpoint through the
  Firebase client SDK. The original Firebase HTTPS wrapper verifies ID tokens;
  existing admin, ownership, membership and atomic quota checks remain active.
- Only callable exports are routed. Firestore triggers, schedules and HTTP
  webhooks cannot be invoked through this endpoint.
- Gemini requests run on the server. Server credentials are production Secret
  variables in Vercel, never VITE variables or committed files.
- A dedicated runtime service account has Datastore User and a custom role
  limited to Firebase user read/update permissions. No owner/editor role was
  granted to the runtime account.

## Deployment

Canonical source: `sunnatovt001/NOVIQ-UpdatedVersion-`.
Production URL: https://noviq-saidamins-projects-aa9c99df.vercel.app

Vercel production requires `FIREBASE_SERVICE_ACCOUNT_JSON`, `GEMINI_API_KEY`,
`GEMINI_MODELS`, `FIRESTORE_DATABASE` and `GOOGLE_CLOUD_PROJECT`.
Install uses `npm ci && npm ci --prefix functions`.

The original Vercel Git integration points to an older repository; deployments
from this release use the reviewed local source via the authenticated CLI.
Do not assume a push to the canonical repository auto-deploys this Vercel project.

Run `npm run verify`, then `npm run release:check -- --vercel`.
For public endpoint checks:

    npm run release:check:live -- --vercel --url https://noviq-saidamins-projects-aa9c99df.vercel.app

Authenticated Tutor and structured Planner smoke checks must also pass. Tests
use a separate temporary account, which is removed after verification.

## Boundaries

Cloud Functions, Firestore background triggers, scheduled Telegram summaries,
payment/Telegram webhooks and automatic metric projections are not deployed by
the Vercel callable adapter. Existing callable features are available; background
features need a separate free-compatible design before being claimed operational.
Live payments are not enabled. Direct Firebase Storage behavior is unchanged.
Free-tier quotas still apply; the deployment does not guarantee unlimited usage.

Authentication domains and production Firestore rules/indexes are managed in
Firebase separately from the frontend deployment. Preview deployments remain
protected. The production alias is public, with app data protected by Firebase
authentication and authorization.

## Verification completed

- TypeScript, 223 frontend/model tests, 46 backend tests and production build pass.
- All 14 Firestore emulator authorization/integration tests pass with Java 21.
- Core browser, Tutor/Notebook, populated Planner locale/theme and membership
  failure fixtures pass. Fixture navigation was reconciled with the current UI.
- Production email/password login and membership lookup pass. Anonymous and
  forged tokens are rejected; a non-admin cannot grant administrator access.
- Real deployed Tutor and structured Planner Gemini requests return HTTP 200.
- A real browser signs in, sends a Tutor prompt through `/api/rpc`, displays the
  real answer and passes the mobile overflow check with no runtime errors.
- Firestore rules/indexes were deployed; the exact production alias was added to
  Firebase authorized domains. Firebase billing remains disabled, Vercel is Hobby.

Private credentials, production audit screenshots and temporary test-account
details are excluded from Git and deployment source.
