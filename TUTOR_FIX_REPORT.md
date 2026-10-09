# Tutor and Saidamin recovery — 2026-10-05

## Verified causes

- The production `generateAiResponse` Function endpoint returns HTTP 404. The
  frontend calls this absent backend; generic callable errors obscured the cause.
- Gemini itself is working: the configured `gemini-3.8-flash` model appears in
  the provider's model list and answered a real public math smoke question with
  HTTP 200. No student data was used. The key is kept server-side.
- The existing authenticated local proxy was enabled only in `local-ai` mode.
  Ordinary `npm run dev` therefore still called the absent production Function.
  The running dev server also retained the old configuration until restarted.
  Local Tutor now uses the proxy's 10-request/minute limit; old failed-call
  counters from the unavailable production backend cannot block local use.
- Saidamin's popover occupied the app's footer flex layout and could be clipped
  by the parent viewport. The composer existed in code but was not reliably
  reachable in the displayed layout.
- Full Tutor requested the oldest 80 messages and replaced its local message
  list with each snapshot. Optimistic messages used different IDs from cloud
  writes. Floating Tutor fetched history for model context but did not display
  it. Neither surface offered separate conversations or older-page retrieval.
- Failed replies appeared both as assistant messages and as errors. Retries
  increased local usage again, and a storage exception could leave the send lock
  set indefinitely.

## Changes

- `vite.config.ts`, `src/lib/auditMode.ts`, `src/lib/gemini.ts`: authenticated
  loopback AI proxy in ordinary development; audit tests still do not call real
  AI. Production continues to use the server Function. Clear bounded errors,
  safe code/reason logging, and prompts that answer the actual question first.
  No frontend Gemini key, fake answer or new paid service was introduced.
- `src/lib/useTutorHistory.ts`: shared account-scoped chat store, stable message
  IDs, newest-first cloud query, pagination, conversation selection/new chat,
  local recovery copy, durable cloud queue and visible save/history errors.
  Existing ungrouped records appear under **Old conversations**. Originals are
  not migrated, overwritten or deleted merely to display/group them. New messages
  add a conversationId to the existing flat collection, requiring no new index.
  Corrupt device caches are preserved; late responses cannot cross accounts.
- `src/pages/Tutor.tsx`: shared history controls, answer retry without duplicating
  questions or error messages, isolated conversation context, usage-storage
  failure recovery, no base64 image preview in Firestore chat metadata, accessible
  composer and IME-safe Enter behavior. Mobile controls are compact; history/save
  errors and attachment/AI panels scroll with the message area, so they cannot
  push the fixed composer out of the conversation viewport.
- `src/components/FloatingTutor.tsx`: viewport-positioned popover with reachable
  custom-question textarea, focus/Escape, shared visible history, new conversation,
  retry, safe readable error colors and duplicate-submit guard.
- `src/components/Layout.tsx`: local-AI notice now accurately distinguishes local
  chat saving from disabled cloud sync in that audit mode.
- Test fixtures and regression tests cover actual handlers, persistence merging,
  historical timestamps, mobile composer, reload/history/retry/account isolation.
  Fixtures are test-server-only; they do not ship as success data in production.

## Validation and practical limits

- TypeScript, production build and 56 frontend/tool + 31 backend tests passed.
- Existing 21 browser scenarios passed for Planner, Dashboard, auth and mobile.
- Compiled Planner, Tutor and Dashboard lazy modules imported successfully in
  the production preview, with external service requests blocked.
- Dedicated Tutor browser checks cover newest/older history beyond 80, independent
  conversations, reload, retry deduplication, shared widget/full-page history,
  1440/390/320px widths and short screens, focus/Escape, account separation and
  preservation of corrupt cache. These use isolated service fixtures.
- The restarted local server at `http://localhost:3000` exposes the AI endpoint;
  an unauthenticated request returns HTTP 401. Existing server tests cover token
  verification, local-origin restrictions, request size/rate limits and secret
  redaction. A real Gemini provider answer was independently verified; a full
  live signed-in browser conversation is not claimed by fixture checks.

Paid activation remains prohibited by the user's earlier instruction. No
Functions/Hosting deploy, billing upgrade or paid backup/PITR activation occurred.
**The production AI endpoint is still absent.** These changes repair local use and
the chat UI/persistence; they do not manufacture a deployed backend. Public AI
requires an authorized backend deployment or a separately reviewed alternative.

Existing stored chats can be read; messages never saved by older app versions
cannot be recovered from this repository. Binary uploads are not archived as
reusable files; metadata/text are retained. A cleared/lost device cannot recover
messages that never synced. AI/network/provider outages remain possible and now
have explicit recovery paths; no absolute uptime guarantee is made.

Before release: deploy the authorized AI backend and reviewed frontend, run a
real signed-in send/reply/reload check, verify Firestore save and cross-account
denial, and repeat mobile checks with the software keyboard open. Keep billing
unchanged until the user changes the free-only restriction.

## Follow-up: real local provider failure

The user confirmed the active URL is localhost:3000 and reported a remaining
error. Full Tutor prompts reproduced HTTP 503 from Gemini 3.8 and 3.7; model
listing and a tiny smoke request had not proven full-request availability.
Gemini 3.6 answered once but also returned 503 on a later proxy integration
check. The 2.5 model listed by the provider returned 404 on actual generation.
None of these failures is represented as a successful answer.

Local defaults now use **gemini-3.5-flash**, with **gemini-3.1-flash-lite** as a
bounded fallback for 404/5xx only. Both answered the actual Tutor system prompt
and public fraction question correctly with HTTP 200. Tutor output is bounded
at 4096 tokens; other existing AI flows retain 8192. Quota/permission failures
are not retried across models. GEMINI_LOCAL_MODELS permits explicit server-side
configuration. Safe server logging contains model/status/error code, not tokens,
keys, chat contents or student identities.

`src/lib/localAiClient.ts` applies a single 45-second deadline including Firebase
token retrieval and response parsing. A rejected token refreshes once before
another authenticated call; late token results cannot send a timed-out request.
Build/typecheck and **60 frontend/tool + 31 backend tests** passed after these
changes. Dedicated seven Tutor browser scenarios still pass. Real provider
receipts are in artifacts/production-audit/tutor-stable-model-check.json; browser
checks use fixtures and do not prove the user's actual signed-in browser session.
The exact remaining on-screen error was requested but has not yet been supplied.

Public/provider service outages remain possible. Paid services remain disabled,
and production Functions are still not deployed; this follow-up targets the
confirmed local development URL.

Final local proxy integration used the actual Tutor payload and real Gemini
provider, with an isolated authentication fixture: the primary 3.5 model returned
503, the 3.1 fallback returned **HTTP 200 with the correct answer**. Receipt:
artifacts/production-audit/tutor-proxy-provider-check.json. The dev process was
fully restarted after server edits to avoid cached CommonJS middleware. This
establishes actual fallback generation, not a live signed-in browser assertion.
