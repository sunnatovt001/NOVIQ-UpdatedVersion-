# Local release verification — 2026-10-04

Latest Nexus/Gemini follow-up: [NEXUS_AI_FIX_REPORT.md](NEXUS_AI_FIX_REPORT.md).
The supplied Gemini key and `gemini-3.8-flash` returned real HTTP 200 responses
for a neutral text request and a structured Planner request. The previous model
returned 404 for this key. Development-only `npm run dev:local-ai` enables AI
without cloud writes. Live user-context AI remains untested. Nexus member lists
and presence still require deployment of the new callables; no deployment occurred.
Latest verification includes 66 tests (38 frontend, 28 backend) and build.

The latest audit fixes and per-item evidence are recorded in [AUDIT_FIX_REPORT.md](AUDIT_FIX_REPORT.md). This checkout is locally verified; a complete live production release is not yet verified.

## Latest verification

- `npm run verify` passed: TypeScript, Functions syntax, 34 frontend tests, 25 backend tests, and production build.
- A final production build passed after the last CSS change.
- Ten routes were checked at 390×844, 768×1024, 1366×768 and 1920×1080. Visible enabled button centers were unobstructed and no horizontal overflow was detected.
- Tutor Send remained visible and clickable at all four sizes. Notebook close controls, Escape and focus restoration were checked.
- Metrics charts had positive measured sizes, week switching worked, and the reported chart sizing warnings were absent. Runtime exception checks returned no new JavaScript exceptions; external backend errors remain separate release gates.
- Existing records were displayed: five mission tasks, one note, seven cards and seven due cards. Viewing a Planner activity no longer starts it. Isolated tests cover start, pause, retry, completion, statistics and AI success/failure flows without production writes.

## Release gates

- The updated `getCommunityMemberCount` callable has not been deployed. Real member counts and authorized legacy author-name resolution need live backend verification; the UI now distinguishes loading, failure and missing data and provides retry. Group messages remain restricted to members.
- Real AI provider/authentication/quota operation needs verification with configured backend services. Local isolated tests verify success, timeout, malformed output, error and retry behavior; they do not establish live provider availability.
- Cloud saves, message sending, invitations, payments and Telegram delivery were not exercised against the real account.
- Invitation-link functionality does not currently send email. An email provider is still unidentified, and separate friend chat functionality is not implemented.
- Profile links to @noviqq_bot; existing private-chat /planner and /metrics handlers require live token/webhook and account-link verification.
- The Firestore emulator rules suite was not rerun; this machine has Java 8. Compatible runtime setup is still needed. Existing security rules were not widened.

## Read-only audit mode

The current localhost server uses `npm run dev -- --mode audit`. This opt-in mode blocks cloud writes, AI requests, automatic visit telemetry, notification creation and offline queue flushing. Existing queued writes are preserved. Ordinary `npm run dev` restores normal backend-connected behavior.

Initial browser navigation occurred in ordinary development mode before its automatic visit tracking and notification initialization were identified. Those automatic routines may have written telemetry or notifications. No intentional user message, invitation, payment, data reset or deletion was performed; no rollback was attempted.

No Git commands, push or deployment were performed. Production deployment requires a separate instruction and the live checks above.
