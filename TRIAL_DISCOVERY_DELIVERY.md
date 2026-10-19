# NOVIQ PRO discovery and trial redesign

Implemented in C:/Users/User/Documents/NOVIQ, normal localhost http://127.0.0.1:3000/#/pricing. Free accounts receive the new discovery page; active paid/trial accounts retain their existing PRO membership view. No production deployment or real-account billing/trial mutation was performed.

## Design
The four attached Quizlet screenshots were accessible and inspected. Pricing cards, the three-stage trial timeline and alternating benefit previews informed the composition. The earlier Starvy reference informed card emphasis. Quizlet branding, navy/yellow colors, automatic billing and unsupported educational features were not copied.

The page reuses --noviq-bg, --noviq-card, --noviq-text, --noviq-muted, --noviq-border, --noviq-accent, --noviq-on-accent, --noviq-accent-hover, --noviq-soft and --noviq-shadow from the ordinary Free theme. No new palette or library was added.

The hero offers an explicit seven-day trial. Two real plans use configured 39,000 UZS monthly and 299,000 UZS yearly prices; annual savings are calculated. Purchase availability is disclosed only within purchase options. The timeline explains no card, no automatic charge, saved materials and return to Free. No unimplemented reminder is promised. Product previews are labelled Namuna/Illustrative preview and never saved to the account. FAQ and copy support Uzbek, English and Russian. The floating Tutor is hidden on pricing to avoid covering actions; other routes retain their existing behavior.

## Verification
- Application tests: 220 passed.
- Backend tests: 39 passed, including one-time trial eligibility, concurrent/idempotent activation and expiry.
- Type checking and production build passed.
- Browser layout checks: 1440, 1024, 768, 390 and 320 px in both themes.
- Additional Uzbek/Russian checks at 1440 and 320 px, both themes.
- Browser tests verified consent/dismissal, server-backed isolated activation, refresh persistence, expiry, failed verification/retry, failed activation, duplicate submission protection and retained paid membership view.
- Browser tests did not access production data/services.
- Fourteen ordinary Free-route screenshots recaptured. Eight compare exactly with the prior captures; six have localized differences in the floating Tutor/viewport edge. No ordinary Free tool source or tracking logic was changed.
- Normal localhost serves the modified sources. The available interactive browser remains signed out; no claim of independently verified real-account activation is made.

Evidence: artifacts/trial-redesign/index.html, browser.log, states.log, verification.log, free-preservation.json and screenshots/.

## Required live-service follow-up
The configured live startProTrial callable was checked without authentication and without consent. It returns HTTP 404, rather than a callable authentication error. Its deployment/service availability is unresolved. The existing secure server implementation works in the isolated backend/browser tests, but genuine live-account activation cannot be claimed until that service is restored. The frontend retains failure feedback and does not grant fake PRO access. Resolving this live service requires a separately authorized deployment; none was performed here.

## Source scope
New: src/features/pro/ProDiscovery.tsx, discoveryCopy.ts, discovery.css.
Changed: src/features/free/FreePricing.tsx, src/features/pro/ProMembership.tsx (verified eligibility/label/themed confirmation), src/components/FloatingTutor.tsx (pricing visibility).
Other dirty repository files predate this task and were not included in a blanket commit. Backups of the three edited files are under artifacts/trial-redesign/before/ as .bak files. Synced sources were not edited.
