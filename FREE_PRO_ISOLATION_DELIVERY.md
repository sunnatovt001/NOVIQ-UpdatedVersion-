# NOVIQ Free restoration and PRO isolation

Implemented locally on 18 October 2026. No production deployment, live billing change, or destructive production database operation occurred.

## Original baseline and preserved PRO work

The eight-page redesign was uncommitted. Historical HEAD `31d5c57dd2e056111a25be322d3d0bd6b6cbe0a5` predates additional uncommitted Planner, Flashcards and membership work, so resetting to that commit would have lost working features.

Instead, the current source was safely preserved at:

- `codex/pro-eight-page-preserved-20261017` — `db9970a385141a29932d3dde4a388a60d8800a8c`.
- `codex/free-pre-eight-page-baseline-20261017` — `7d24341ebb959168e3cbf5c4982616795cb63f43`, recovered from the original file backups saved before the eight-page changes. This is a reconstructed recovery commit, not a previously existing historical commit.
- `codex/free-pro-isolation-20261018` preserves the completed correction; its exact commit is recorded in `artifacts/free-isolation/recovery.json`.

The working branch and the user's existing index were not switched or reset. The original Free shell, global stylesheet, Planner component, and five affected page components were copied byte-for-byte from those saved originals. The original Dashboard implementation remains the Free Dashboard. No synced `sources/` files were edited.

## Resulting architecture

- Original Free UI variants live under `src/features/free/` and `src/features/planner/FreeSmartPlanner.tsx`.
- Preserved premium pages remain in their existing page modules; the premium shell remains in `src/components/Layout.tsx`, with `ProSmartPlanner.tsx` retaining its premium Planner layout.
- `App.tsx` selects the Free or PRO shell and page loaders only after membership verification. Both variants use the same authenticated user, domain hooks, record paths, database, and backend services.
- `MembershipContext.tsx` no longer grants a premium interface from a profile projection or local appearance flag. The existing authenticated `getMembershipStatus` response must confirm an active supported state and a valid end time. A pending check renders the existing neutral loading screen; failed verification offers retry.
- An expired entitlement selects the original Free UI. Cancellation follows existing backend rules: access continues until the authorized period ends.
- PRO theme and sidebar preferences use separate keys, `noviq-pro-theme` and `noviq-pro-sidebar`; original Free preferences remain untouched.
- The reference stylesheet is loaded through the PRO shell and every selector requires a PRO shell or explicit PRO portal scope. Free receives the original Upgrade/membership interface, with the premium layout preview removed. An Upgrade click cannot change entitlement.
- Midnight Aurora and Cloud Lavender remain available in PRO. Free retains its original themes, typography, navigation, geometry, animations and interactions.

## Validation completed

- TypeScript, backend syntax, **214 application tests**, **39 backend tests**, and the production build passed.
- **56 original-versus-restored Free comparisons** cover seven tools, both themes, desktop and phone views, both before and after loading premium CSS under an actually expired account.
- **30 comparisons were pixel-identical**. In every comparison, fewer than **0.031%** of pixels differed by more than 12 RGB levels. The current-time line was masked because capture times differ; no layout regions were hidden from comparison.
- Eight premium pages were captured in both themes using an **actual authenticated local trial**, and refresh retained the verified experience.
- Delaying the real membership response showed neither Free nor PRO content; the neutral loading screen remained visible. A positive subscription profile alone did not grant a premium layout.
- Actual trial expiry returned to Free. Exact saved Planner, Flashcards and Notebook records were preserved.
- Original device Focus history and task values survived real trial activation, expiry, and refresh. Switching actual local accounts did not expose or delete the previous account's Focus data.
- Actual Firestore rules rejected client-forged PRO records and cross-account Planner reads. The actual premium AI handler denied a Free account with `PRO_REQUIRED` before any provider call.
- Trial creation required consent; duplicate activation did not extend the recorded end; cancellation retained valid access under the existing trial rules; an expired used trial could not restart.

The integration checks used real Firebase Auth emulator accounts, verified tokens, the Firestore emulator and unchanged production callable handlers. Successful entitlement responses were not mocked or injected. Trial access was created by the normal backend trial operation. Only the local trial end was shortened to test expiry. Test configuration and sign-in helpers exist only in the local test server, not the production application.

No live paid account or real payment was fabricated or used. A production paid-account smoke test remains unperformed. The active-paid interface uses the same verified-response gate, and the existing backend membership-state tests passed. Production service availability was not certified by local emulator testing.

## Evidence

- `artifacts/free-isolation/verification.log` — complete test/build result.
- `artifacts/free-isolation/visual-comparison.json` — all 56 pixel comparisons.
- `artifacts/free-isolation/results.json` — authenticated trial, delayed verification, expiry, shared-record and theme-isolation results.
- `artifacts/free-isolation/security-results.json` — real local authorization and rule checks.
- `artifacts/free-isolation/focus-account-results.json` — Focus persistence and actual account switching.
- `baseline-*.png`, `restored-*.png`, `after-pro-*.png` — original, restored and premium-CSS-loaded Free views.
- `verified-trial-*.png` — all eight premium pages in both themes.

## Reproduce locally

Start Auth/Firestore emulators for the **demo-noviq** project using `tests/isolation-emulators.json`. Run `tests/entitlement-server.mjs` and a second instance with `--baseline`, then `tests/isolation-browser.cjs`. The test requires local emulator services and refuses to substitute successful membership responses. The recovered Git baseline commit must be available locally.

Additional security and Focus/account checks are saved as local test scripts alongside the browser suite. No deployment step is included.
