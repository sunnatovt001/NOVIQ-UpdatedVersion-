# NOVIQ PRO exclusive environment delivery

Branch: `codex/pro-exclusive-20261018`. No reset, production deployment, production data write, or live billing configuration change was performed.

## Protected Free baseline

The restored Free implementation is retained in `src/features/free/`, with the original Planner presentation in `src/features/planner/FreeSmartPlanner.tsx`. Those files, `src/index.css`, backend membership implementation, billing configuration, and database rules have exactly the same SHA-256 hashes as at the start of this task. Evidence: `artifacts/pro-exclusive/protected-hashes.json`.

Fresh original/current Free screenshots cover seven tools, navigation, both themes, and desktop/phone sizes. All 28 comparisons have less than 0.017% of pixels differing by more than 12 RGB levels. Following actual PRO activation and expiry, 14 additional Free comparisons have less than 0.062% differing pixels. These are measured raster differences, not a claim of pixel identity. Source preservation is byte-exact.

## Premium implementation

The existing isolated eight-page PRO implementation was reused, rather than replacing the restored application. Authenticated server entitlement selects the PRO shell and presentation; Free uses the protected original components. Both share the existing account, Firestore paths, Planner services, Notebook records, Flashcards, Tutor and Focus behavior.

This task adds `src/features/pro/brand.css`, with semantic premium tokens taken from the current NOVIQ identity in `src/index.css`: primary blue #2e5eaa, secondary violet #7c6be8, light background #f7f8f6, navy text #14213d, dark background #0b1220, dark surface #131d2e and dark accent #91a7ff. Reference CSS now uses these tokens instead of importing another product's palette. Scopes require the PRO root or an explicitly tagged premium portal. Global Free tokens were not edited.

Reference geometry is retained across Dashboard, Planner, Flashcards, Focus, Notebook, AI Tutor, Analytics and Subscription Management. Dashboard now starts with the personalized greeting and reference summary composition; its existing introduction remains available below the summary. Analytics retains distinct activity intensity levels. Midnight Aurora and Cloud Lavender remain independent of Free theme/sidebar preferences.

The React review covered the two edited TSX components: no new subscriptions, effects, fetching waterfalls, dependencies or authentication paths were introduced. The name is escaped by React; content remains localized. A greeting encoding defect found in screenshot review was corrected and rechecked.

## Verification actually run

- Application TypeScript, backend syntax, 214 application tests and 39 backend tests passed. Production build passed. The final greeting correction also received TypeScript and build checks.
- Playwright exercised all eight PRO pages at 1440, 768 and 390 pixels, in both themes: 48 combinations, with screenshots and viewport overflow assertions.
- A focused follow-up checked the final Dashboard/Analytics presentation and Flashcard preview mouse/keyboard flips at all three widths in both themes.
- Real Firebase Auth/Firestore emulators and the actual backend callable handlers activated trials through the normal consent flow. Successful entitlement responses were not fabricated or intercepted.
- Pending verification rendered the neutral loader. A failed membership transport rendered original Free, despite an active trial profile; a real subsequent backend response recovered PRO.
- Actual local trial expiry returned to Free; Planner, Notebook and Flashcard documents remained exactly equal to their pre-transition values.
- Real backend negative checks rejected unauthenticated access, forged client subscription updates, cross-account Planner access, premium AI requests by Free users, payload impersonation and repeated trial extension. Trial cancellation retained access until the existing recorded end.
- No production API requests or browser exceptions were observed in these runs.

Evidence: `artifacts/pro-exclusive/verification.log`, `final-build.log`, `browser.log`, `interactions.log`, `greeting.log`, `security.log`, `results.json`, `affected-results.json`, `greeting-results.json`, `free-baseline-comparison.json`, `free-after-pro-comparison.json`, and `verified-trial-*.png`. Original/current baseline screenshots remain under `artifacts/free-isolation/`.

## Limits and existing unavailable features

No live paid account, real payment, external AI provider response, production deployment, or production service readiness was certified. The paid-state backend tests ran, but a live paid-account smoke test did not. Calendar sync and live recurring billing remain disabled by the existing configuration. Payment controls continue to depend on the existing backend provider configuration and show unavailability when it is absent. AI tools use the existing real handlers; positive external AI generation was not tested during isolated verification. No placeholder success or invented metrics were added.

## Reproduce safely

Start local demo services with `npx firebase-tools@15.32.1 emulators:start --project demo-noviq --config firebase.pro-verification.json --only auth,firestore`. Start `node tests/entitlement-server.mjs` and, for original Free comparisons, a second instance with `--baseline`. Run `node tests/pro-baseline-browser.cjs`, `node tests/pro-exclusive-browser.cjs`, `node tests/pro-exclusive-interactions.cjs`, `node tests/pro-greeting-browser.cjs` and `node tests/isolation-security.cjs`. Run `npm run verify` for tests/build. The browser scripts create local demo accounts and records only; they never substitute a positive entitlement response.
