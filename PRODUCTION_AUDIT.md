# Noviq production reliability audit — 2026-10-05

## Confirmed causes and limits of diagnosis

The subsequent AI Tutor/Saidamin root-cause fixes, chat-history preservation and
current local-versus-production status are in [TUTOR_FIX_REPORT.md](TUTOR_FIX_REPORT.md).

This section records the initial UI reliability fixes. Subsequent runtime,
offline persistence, domain/cloud configuration changes and current launch
blockers are documented in [LAUNCH_READINESS.md](LAUNCH_READINESS.md).

1. **Planner hydration can wait forever.** With no local plan, its Firestore callback ignores an empty cache snapshot and waits for a server response. Firestore can keep reconnecting without invoking the listener error callback. There was no deadline to settle `hydrated`. Writes must stay blocked when the cloud plan is unknown, otherwise an empty initial plan could replace saved data.
2. **Route loading had no deadline or local error recovery.** `React.lazy` waited indefinitely for its import; `Suspense` displayed a full-screen fixed fallback that also hid navigation. The existing outer error boundary caught rejected imports/runtime exceptions but could only reload the whole app. It could not handle a promise that never settled. A rejected lazy result is cached, so retry needs a new lazy component type.
3. **Direct paths were ignored.** App navigation read only the hash; visiting `/planner` or `/tutor` without a hash selected Dashboard.
4. **Metrics depended on a decks listener and unbounded server reads.** Refresh started only after that listener returned. One failed aggregation rejected the whole batch, while several dashboard blocks rendered initialized zero values without checking error/loading. Listener errors were not tracked independently, so a later successful refresh could clear another source's failure. Cached empty snapshots did not prove that the server collection was empty.
5. **Dashboard repeated the same task completion and review figures in multiple panels.** These blocks used different error/empty/loading logic and sometimes different task scopes. Recent-note/session listener errors were also displayed as empty data.
6. **Auth modal lacked dialog semantics, background inertness and focus containment.** Validation existed for some blank values and short signup passwords, but errors were global, email format validation relied on browser behavior, and forgotten-password errors did not focus the email input. Signup requests could be initiated through overlapping auth actions.
7. **Exam CTA lacked the intended Planner destination.** The existing handler already opened signup for signed-out visitors; it was not literally disconnected in this checkout. It now sets the Planner destination before signup, so the destination survives authentication/onboarding. Signed-in navigation also resolves to Planner.
8. **Floating Tutor composer was clipped.** Its message region subtracted a fixed 154px despite the variable height of header, quick prompts and composer. Mobile screenshots exposed a partially hidden input. Flex sizing now gives remaining space to the scrolling messages and keeps the composer visible.

The original production `Loading page` incident did not reproduce with this checkout's old built Planner/Tutor modules: both imported successfully. No export-name mismatch or reproducible Tutor component exception was found. The production request/chunk that stalled and the upstream reason for Firestore `unavailable` cannot be established without the affected deployment's network/runtime logs. The verified client defects above are fixed; an upstream outage now produces a bounded, usable error state instead of indefinite loading.

## Changes

| File | Reason |
| --- | --- |
| `src/App.tsx` | Stable page-loader map, local route boundary, hash and direct pathname resolution. |
| `src/components/RoutePage.tsx` | 15-second import deadline, export check, local rendering/import boundary, fresh lazy type on retry, explicit app reload fallback. Navigation remains available. |
| `src/contexts/AuthContext.tsx` | Bound auth persistence, profile initialization and bootstrap waits; restore only an existing cached profile on initialization timeout; preserve permission errors. |
| `src/lib/useUserActivityMetrics.ts` | Initial listener and aggregate deadlines, independent pending/error sources, metadata-aware server confirmation, developer logs with source/scope, retry and cleanup. Index fallback still reads actual records; network/permission failures never become fabricated zero. |
| `src/pages/Planner.tsx` | Hydration deadline, visible retry, metadata changes, late recovery; cloud-unknown state continues blocking writes. |
| `src/pages/Tutor.tsx` | Visible history error/timeout with resubscription retry; conversation UI remains usable; dynamic viewport sizing. |
| `src/pages/Dashboard.tsx` | Remove repeated summary/completion panels, use one task-completion source, consistent stat placeholders, independent recent-activity and task errors/deadlines/retries, suppress unsupported guidance. |
| `src/pages/Landing.tsx` | Planner CTA intent; portal dialog, labelled modal, inert background, accessible inline required/email/password errors, focus on first invalid field and reset-email errors, overlapping-request guard. |
| `src/lib/useDialogFocus.ts` | Keyboard wrap, outside-focus containment, Escape, deferred opener focus restoration after inert cleanup. |
| `src/components/FloatingTutor.tsx` | Flex-based message/composer sizing and dynamic viewport height. |
| `tests/production-recovery.test.cjs` | Regression coverage for silent listeners, cache-only zero, successful recovery and independent source failure. |
| `tests/browser-server.mjs`, `tests/browser-check.cjs`, `tests/route-recovery.html` | Isolated browser fixtures and full UI recovery/accessibility/mobile checks. Fixtures are outside the production entry and prohibit cloud writes. |
| `tests/bundle-smoke.cjs` | Import the actual compiled Planner/Tutor/Dashboard chunks in Chromium with external network access blocked, including entry dependencies. |
| `package.json`, `package-lock.json` | Playwright development dependency and browser-check scripts. |

No production database records, rules or schema were deleted or migrated. Firebase configuration remains unchanged: its named database matches the deployment configuration. Test data exists only inside isolated browser fixtures.

## Validation and reproduction

`npm run verify` passed: TypeScript (`lint` is `tsc --noEmit` in this project), Functions syntax checks, 41 frontend regression tests, 28 Functions tests, and production build. There is no separate ESLint configuration in this checkout.

Browser verification uses Chrome through Playwright, with an initial agent-browser smoke check. It covers Planner/Tutor desktop and mobile, sidebar, floating composer, dashboard outage/retry, silent listener timeouts, direct path routing, lazy import failure/runtime failure/non-settling import and retry, CTA signup intent, validation without backend calls, focus trapping/Escape, forgot password focus, and intercepted backend signup error/loading. Screenshots and JSON results are in `artifacts/production-audit/`. Viewports: 1440×900, 390×844 and dashboard at 320×740.

All 18 browser scenarios passed (`browser-results.json`). The compiled Planner, Tutor and Dashboard chunk imports also passed (`bundle-results.json`). No external cloud write was sent by these checks.

Run isolated browser checks in two terminals:

```text
npm run test:browser:server
npm run test:browser
```

The script uses installed Chrome. For production chunk checks:

```text
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
node tests/bundle-smoke.cjs
```

## Remaining risks and deployment checklist

- A real signed-in production account, social-provider configuration, actual Firestore rules/indexes and AI backend were not exercised end to end. Browser auth/network failures are injected fixtures; they do not establish the health of production services.
- Firestore remains an external dependency. A 15-second UI deadline settles the UI but cannot cancel an SDK request internally. Slow clients may see an error before a late server response recovers the listener. Aggregate failure intentionally hides dependent statistics until retry succeeds.
- A browser can retain a failed native module evaluation or an old deployment's missing asset. Page retry recreates React's lazy state; the separate Reload app action handles cases requiring a new document/module graph.
- This workspace has no `.git` directory, so no commit or Git diff was available. Changes are local and build artifacts were regenerated. Nothing was deployed.
- Shared focus-trap changes should also be checked with an actual screen reader and older supported browsers; automated checks cover Chromium keyboard/focus/inert behavior.

Before deploying: (1) run `npm run verify` and browser checks; (2) confirm the named Firestore database, indexes/rules and required auth providers in staging; (3) sign in with a staging account and test both direct paths, CTA → signup → onboarding → Planner, existing-plan retention and Tutor AI; (4) block Firestore/chunk requests and confirm retry/reload; (5) check mobile and screen-reader behavior; (6) deploy versioned assets atomically and retain a rollback; (7) monitor route error logs and statistics source errors in the affected production deployment.

Technical references: [React lazy promise caching](https://react.dev/reference/react/lazy), [Firestore listener metadata and errors](https://firebase.google.com/docs/firestore/query-data/listen).

## Tutor chat history interface ? 2026-10-05

The conversation selector was difficult to discover. Tutor now has a persistent left conversation list at desktop widths (1280px and above), with New chat, title search, date groups, active conversation highlighting and older-history pagination. Smaller screens use an always-visible Chatlar button and a viewport-sized drawer. The drawer traps keyboard focus, blocks background interaction, closes on Escape/backdrop/selection, restores opener focus, and releases background inertness when resized to desktop. It follows the selected light/dark theme.

Floating Saidamin uses the same conversation list in a compact history view; its composer stays visible at 320px width and 520px height. The existing shared history hook and account-scoped persistence remain the data source. Existing legacy messages are shown under Avvalgi suhbatlar. Search applies to loaded conversation titles, and the interface explains how to load older history when searching. No fabricated pinned chats/projects or new archival database schema were introduced.

Changed files: `src/components/TutorChatHistory.tsx` (shared list and accessible drawer), `src/pages/Tutor.tsx` (desktop sidebar/mobile entry and layout), `src/components/FloatingTutor.tsx` (compact searchable history), `tests/tutor-browser-check.cjs` (updated selectors and history/keyboard/theme/responsive regressions).

Validation: `npm run verify` passed TypeScript, Functions syntax checks, 60 frontend/tool tests, 31 Functions tests and production build. The dedicated Tutor browser suite passed 10 scenarios; the broader browser suite passed 21 scenarios, covering Planner, Tutor, dashboard outages/retry, route recovery, auth validation/accessibility and monitoring. History tests cover pagination beyond 80 messages, search/no-results, conversation separation, reload persistence, answer retry without duplicate questions, shared widget/full-page history, account isolation, corrupt-cache preservation, mobile focus trapping/Escape/selection/resize, and light/dark themes. Viewports include 1440?900, 1440?650, 390?600 and 320?520. Screenshots and results are in `artifacts/production-audit/` (`tutor-chat-sidebar-desktop.png`, `tutor-chat-sidebar-dark.png`, `tutor-chat-drawer-320.png`, `tutor-chat-drawer-dark.png`, `tutor-browser-results.json`, `browser-results.json`). Browser AI/auth/Firestore use isolated fixtures; these UI checks do not verify production AI service availability. Production writes: zero. No services were deployed or billing enabled in this UI change.

## Tutor speed, reading space and sync status follow-up — 2026-10-05

Confirmed issues: the global `focus-visible` rule drew a blue outline around chat textareas; the large recovery banner, outer padding, fixed viewport subtraction and composer consumed reading space; pending chat notices were not reconciled when an offline queue write succeeded later. The local server logged `AI_TIMEOUT`. Its previous primary/fallback model sequence shared a 30-second deadline, so a stalled primary could exhaust the fallback window. The prompt also required five sections and exam actions even for simple questions. Separate live probes confirmed upstream `503` responses, so provider availability remains an external dependency.

Tutor now uses **one model, `gemini-3.5-flash-lite`**, in both the development proxy and prepared production Function, with `thinkingLevel: minimal`. An explicit temporary HTTP rejection can retry once on the same model; credentials, quota errors and unconfirmed timed-out generations are not repeated. Non-Tutor model configuration and structured-response settings retain their prior behavior. The Tutor prompt answers the actual question first, keeps simple requests short and uses readable plain-text math. Keys remain on the server, with authentication, origin checks, rate limits and request deadlines preserved. Middleware logging records the model and elapsed time without chat contents or credentials. Vite restarts invalidate the middleware cache, and report/backup writes no longer reload the application.

Tutor occupies the remaining layout height and uses wider content with smaller outer spacing, a 240px history sidebar and a compact composer. Its reading region exceeded 420px at 1440×900 in the browser check. Floating Saidamin expands to 480px on desktop and up to 85% of viewport height. Textareas use a neutral container border for focus, while other keyboard controls retain visible focus indicators. Pending sync appears as a compact, expandable status with real retry/export controls. No pending operations are discarded or labelled synced without acknowledgment. Queue events update recovery counts and reconcile matching saved chat records immediately; storage corruption remains visible and preserved.

Changed implementation files: `src/components/Layout.tsx`, `src/pages/Tutor.tsx`, `src/components/FloatingTutor.tsx`, `src/components/SyncRecovery.tsx`, `src/components/TutorSaveStatus.tsx`, `src/index.css`, `src/lib/offlineSync.ts`, `src/lib/useTutorHistory.ts`, `src/lib/gemini.ts`, `server/local-ai.cjs`, `functions/index.js`, and `vite.config.ts`. Regression coverage changed in `tests/local-ai.test.cjs`, `tests/tutor-history.test.cjs`, `tests/tutor-browser-check.cjs`, `tests/browser-check.cjs`, and `functions/security.test.js`.

Latest validation: `npm run verify` passed TypeScript, Functions syntax checks, **63 frontend/tool tests**, **33 Functions tests**, and production build. The dedicated Tutor browser suite passed **12 scenarios** and the broader browser suite passed **21 scenarios**. Checks include desktop/320/390px reading and composer bounds, absence of the blue textarea frame, chat history/search/pagination, late sync acknowledgment clearing notices without reload, reload persistence, account isolation, corruption preservation, auth/route/dashboard recovery and real pending-data export. Browser checks sent zero production writes.

Actual Gemini API checks returned a greeting, correct fraction explanation and requested 60-minute IELTS plan in approximately **1.3–2.1 seconds** through the real frontend prompt/client/middleware with an isolated authentication fixture. A final plain-text math check returned the correct `5/6` answer in **2.2 seconds**, without raw LaTeX. These are measured samples, not a latency or availability guarantee. Evidence: `artifacts/production-audit/tutor-fast-real-provider.json`, `tutor-fast-plain-math-check.json`, `tutor-larger-chat.png`, `tutor-browser-results.json`, `browser-results.json`, and `tutor-fast-verify.log`.

The workspace dev server was restarted at `http://localhost:3000`. The real user's authenticated browser/cloud sync was not exercised by the isolated tests. Production Functions were not deployed, billing was not enabled, and existing user data was not deleted. Before production release, verify the authenticated Tutor flow and cloud acknowledgments against the actual deployment; the earlier deployment prerequisites still apply.

Model references: [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [thinking-level controls](https://ai.google.dev/gemini-api/docs/generate-content/gemini-3).
