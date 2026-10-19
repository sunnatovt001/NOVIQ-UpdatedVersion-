# NOVIQ Flashcards 2.0 — implementation and verification

Updated `C:\Users\User\Documents\NOVIQ`. This is a working core implementation in the existing React/Vite/Firebase application. It is not a claim that every advanced item in the supplied product specification is finished.

## Loading failure: evidence and repair

The empty-account route loaded before changes. A saved legacy card containing `question`/`answer` instead of `front`/`back` reproduced the exact recovery screen described in the request. The browser stack was:

```
TypeError: Cannot read properties of undefined (reading 'toLowerCase')
  at Flashcards.tsx: card filtering
  at Array.filter
  at Flashcards
```

The former component cast saved records to a TypeScript interface without runtime validation. Its search filter then called `.toLowerCase()` on absent fields. A compatibility repair passed the same browser case before the redesign. The replacement normalizes legacy field names, validates session structures, renders incomplete cards as editable records, and blocks changes when device storage is corrupt. It preserves the route boundary and its retry mechanism.

This is a confirmed, reproduced failure path. No authenticated production stack trace was available to prove that this was the cause for the original affected account. Production account behavior and deployment-specific stale chunks remain unverified.

## Implemented behavior

- Deck creation; editable titles, descriptions, subjects and tags; search, sorting, favorites, archive/restore and backup export.
- Card editor with repeated inline entry, add, duplicate, reorder, soft deletion and undo. Deleting the last card is allowed. Local drafts survive refresh and are isolated by account/deck. Thirty rows render per page.
- CSV, TSV, JSON and `term — definition` import into an editable draft. Quoted CSV commas/newlines work; malformed rows produce errors; exact duplicate pairs are skipped. Export downloads JSON.
- Classic reveal/reverse/shuffle study; Match; Type Answer; Missing Letters; Multiple Choice; browser Listen & Spell; and a basic Smart Learn policy that prioritizes difficulty and switches between recognition and typed recall.
- Deterministic progressive hints, keyboard reveal/grade shortcuts, answer normalization and approved alternatives, strict punctuation, optional case-sensitive answers for mathematics/code, manual grading correction, actual session results, and interrupted-session resume.
- SM-2-style review scheduling with Again/Hard/Good/Easy. Again schedules ten minutes later. Hinted and recognition responses do not receive the same scheduling confidence as unaided typed recall.
- Review state stored separately from card content. Meaning changes increment card revision and restart that card’s schedule while retaining session history. Old card review fields are read for compatibility; summary fields are projected back for existing NOVIQ metrics.
- Optional translation, examples, pronunciation/pinyin, hints, sources, alternate answers and uploaded card images. Images are restricted to JPEG/PNG/WebP, 5 MB and 6000×6000 pixels, decoded before upload, displayed with preserved aspect ratio, and removable. Upload progress/error feedback is real.
- English/Uzbek interface copy, light/dark themes, 320px/mobile layouts, focus-trapped portal dialogs, visible focus indicators and reduced-motion support. Some shared recovery/AI error messages still use existing English copy.

## AI integration and prerequisites

`generateDefinitionSuggestions` calls NOVIQ’s existing `generateWithFallback` path using the `flashcards` feature. That path uses the authenticated Firebase callable in production or NOVIQ’s existing protected development proxy. Existing server authentication, daily quotas and rate limits remain intact; subscription plans were not changed.

Suggestions are explicitly labeled AI-generated, structurally validated, checked against the requested term, cached for the editor session, and discarded when the term, subject or languages change. Auto-suggestions are opt-in and debounced. Accept fills empty fields only; users choose among returned senses, edit, regenerate or reject. Manual creation works independently.

No dictionary-backed service, generated imagery, premium voice provider or fabricated live response was added. Live AI-provider quality/availability was not verified. It requires the already-configured server AI credential, the existing Firebase configuration and deployed callable (or the development proxy). No secret was placed in the browser bundle. Pronunciation playback uses device/browser speech synthesis and can be unavailable on a device.

## Planner and Focus integration

The student chooses a Planner subject and date, then explicitly adds one linked review task. Its default estimate is disclosed as 30 seconds per card, with a five-minute minimum. Identical deck/date task IDs prevent duplicates. Existing timetable sessions and locked events are untouched.

The material link opens the selected deck and carries the actual task ID. A completed review marks the linked task complete only when its requested card goal is met. Active time is attributed through an idempotent Planner receipt keyed to the study session. It is recorded as device evidence, not server-verified Focus time. No second Focus timer, study-session XP or fabricated progress award is created. No automatic recurring timetable insertion was added.

## Database and preservation

Added private, owner-authorized paths:

```
users/{uid}/decks/{deckId}/reviews/{cardId}
users/{uid}/flashcardSessions/{sessionId}
```

Existing deck/card paths remain in use. Sessions hold card IDs and attempts, not an entire copy of the deck. Content records keep unknown legacy metadata. Existing legacy device keys are retained; corrupt data is not replaced with an empty library. Legacy pending records are retained and can be queued through explicit Retry sync. Storage write failures block editing rather than pretending to save. Multiple-tab library changes require reload before another edit.

No destructive migration or production data write was performed. New sessions/review rules must be deployed before those cloud writes work in production; device changes remain queued with sync feedback. The `functions/metrics.js` change excludes soft-deleted card projections and also needs deployment for server metrics consistency.

## Verification performed

Passed:

- Final `npm run verify`: frontend type checks, Functions syntax checks, all project unit/server tests, and production build.
- Thirteen new Flashcards learning-engine tests: legacy parsing, malformed data, exact/normalized and case-sensitive answers, scheduling, hints, hidden letters, ambiguous pairs, imports, AI validation and safe media URLs.
- `npm run test:rules` in a local demo Firebase emulator: all 12 rules/metrics checks passed, including new review/session ownership, cross-account denial, invalid writes, and the existing large-data metrics backfill test. A portable Java runtime was downloaded only for this local check; system Java settings were not changed.
- Focused browser navigation suite: sidebar navigation, refresh, direct `/flashcards`, modal keyboard focus/Escape, dark mobile theme, reduced motion, Uzbek empty state, and signed-out privacy.
- Functional checks in the broader Flashcards browser suite: legacy records, deck/card creation, refresh persistence, draft recovery, AI acceptance/malformed/stale replies, flip/hints/resume, typing and misspelling rejection, missing letters, wrong/correct matches, multiple choice, Smart Learn launch, Planner launch/completion, edit/delete undo/revisions, desktop/390px/320px overflow, account switching and corrupt-cache preservation.

Not fully passed:

- The broader browser suite reached the end of its functional checks but failed its test-fixture isolation assertion: existing shared metrics code attempted production callable requests. The fixture was corrected to mock Firebase Functions as well as Firestore, and its syntax check passed. Restarting that test server was declined, so the complete suite was not rerun after that correction or the last small refinements. Do not report that suite as fully green.
- The existing all-module browser suite stopped on an unrelated Dashboard text expectation before reaching Flashcards. The focused Flashcards navigation suite above passed instead. Dashboard source was not changed by this work.
- Real production account/cloud synchronization, real AI generation, successful real image upload and audible device pronunciation were not verified. Browser functional persistence tests used isolated fixture records and the real client queue code; ownership was separately checked by the emulator.

Screenshots are in `artifacts/flashcards-2/`: desktop, mobile, 320px, dark mobile and Uzbek mobile. The populated screenshots were captured after interactive tests and can show the page scrolled to the deck area.

## Changed files for this task

- `src/pages/Flashcards.tsx`
- `src/features/flashcards/model.ts`
- `src/features/flashcards/useFlashcards.ts`
- `src/features/flashcards/Editor.tsx`
- `src/features/flashcards/Study.tsx`
- `src/features/flashcards/flashcards.css`
- `src/lib/gemini.ts`
- `src/lib/activityEvidence.ts`
- `functions/metrics.js`
- `firestore.rules`
- `tests/flashcards-model.test.cjs`
- `tests/flashcards-browser.cjs`
- `tests/flashcards-browser-server.mjs`
- `tests/flashcards-navigation.cjs`
- Updated existing Flashcards cases in `tests/audit-regression.test.cjs`, `tests/non-ai-security.test.cjs`, `tests/performance-foundation.test.cjs`, and appended ownership coverage to `tests/firestore.rules.cjs` without replacing its pre-existing changes.
- New screenshots, debug artifacts and this delivery report.

Pre-existing Planner, Focus, Analytics and other working-tree changes were retained. Synced `sources/` material was not touched.

## Remaining specification scope

Not implemented: image cropping/occlusion, front/back-specific image placement, audio-file attachments, automatic dictionary lookup, image generation, conceptual/semantic AI grading, full FSRS, advanced retention/daily-history dashboards, recurring review setup, Notebook note linking, automatic calendar proposals, classic previous/next/autoplay/card-star controls, a dedicated missed-card retry flow, and a full folder management UI. Smart Learn is a transparent basic policy rather than a trained adaptive engine. Study sessions are capped at 200 cards and matching boards at six distinct pairs. Cards render text literally; this feature does not add a LaTeX renderer or Markdown/code formatting. Existing export is now JSON rather than the former HTML/Word print flow.

Deployment status: **not deployed or published**. Core implementation is reviewable; the entire product specification and production acceptance checklist are not claimed complete.

## Product references

The implementation uses original NOVIQ styling. Product principles reviewed included distinct-pair matching from [Quizlet](https://help.quizlet.com/hc/en-us/articles/360031183611-Playing-Match/), retrieval and spaced review from the [Anki manual](https://docs.ankiweb.net/background.html), selectable exercise types and student grading overrides from [Knowt](https://help.knowt.com/en/articles/10714631-how-do-i-use-learn-mode), and diagram recall from [RemNote](https://help.remnote.com/en/articles/6511625-image-occlusion-cards). Image occlusion remains future scope here.
