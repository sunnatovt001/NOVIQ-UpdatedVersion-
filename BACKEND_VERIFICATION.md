# Backend verification checkpoint — 2026-10-13

Path /backend-check is an isolated MongoDB verification screen. It does NOT
replace the app's Firebase AuthContext or claim completed migration.

Verified locally:
- TypeScript and production build on staging branch passed.
- Browser API-fixture flow: login, session, admin accounts list, logout,
  ordinary-account isolation and 320px layout passed.
- Backend HTTP/service tests: 19 passing (includes prior admin user endpoint).

Live baseline before this release: root and /health returned 200;
anonymous auth/session and admin/migration-status returned 401.
No real account/password login has yet been tested against the deployed Mongo API.

Next boundary requires owner action: manually deploy latest codex/mongo-staging
commit because Render auto-deploy is off and browser control is unavailable.
Then sign in on /backend-check directly using an existing account. Never send
passwords, tokens, or other users' account lists into chat/screenshots. Owner admin
must see admin access plus bounded account list; ordinary account must not.

Still open: main-app auth/data migration, OAuth/registration/reset, full admin
mutations and metrics, AI server routes, file storage/legacy uploads migration,
trusted proxy/rate-limit behavior, comprehensive real-account and concurrency QA.

Dependency audit on upstream frontend lockfile reports moderate sprintf-js
DoS advisory through argparse/mammoth. Automatic fix suggests a breaking downgrade
and was NOT applied. Review actual document parsing exposure and a maintained
replacement before release. Backend firebase-scrypt has deprecated core-js 2.
No claim that passing audit/unit tests is an exhaustive security assessment.

Firebase remains active; no main-branch merge, production data deletion, password
change or billing activation was performed.
