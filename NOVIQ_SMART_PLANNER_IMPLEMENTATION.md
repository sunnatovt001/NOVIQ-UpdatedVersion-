# NOVIQ Smart Planner — implementation report

Implemented in the existing application at `C:\Users\User\Documents\NOVIQ` on 14 October 2026. Changes remain local; nothing was deployed or pushed.

## Audit and preservation

NOVIQ uses React 19, Vite, Tailwind 4, Firebase authentication, private Firestore records, and an account-scoped offline write queue. The previous Planner organizes generated exam missions around one exam mode, rather than a student's real assignments and calendar constraints. The existing `smartSchedule.ts` was an unintegrated preview engine.

The new Smart Planner is the default Planner page. The previous experience is available through **Exam missions & history**; its data and completion history are untouched. The existing navigation, authentication, Focus verification, XP logic, Tutor, Notebook and Flashcards remain in place. Existing unrelated working-tree changes were preserved.

## Working functionality

- Six-step setup persists after every change. Situation choices offer appropriate school, university or work commitment shortcuts. Subjects independently support self-study, tutor/course and hybrid modes. Exam-specific guidance changes with the selected subject; scores are optional, explicitly self-reported estimates. Independent learners provide no teacher details.
- Multiple subjects, custom subjects, optional goal dates, materials and personal roadmaps. A subject can be paused independently.
- Editable weekday/weekend study windows, named recurring commitments, protected overnight sleep, individual dated events, recurrence end dates and an editable IANA timezone. Starter availability is explicitly described as an estimate.
- Actual assignment creation and editing: title, subject, duration, priority, deadline, description, custom category, external resource URL, recurrence, prerequisite, and splitting preference. No pretend homework is created from a subject selection.
- A deterministic 14-day schedule preview. It subtracts protected events, rejects invalid dates and nonexistent DST times, expands recurrence, orders prerequisites, respects deadline instants, preserves locked sessions, inserts breaks, applies daily limits, and reports missing capacity or dependencies. Feasible existing placements are retained; new allocation considers daily load and time preference.
- Time-block, daily checklist and hybrid presentation modes. Checklist mode displays daily assignments without exact clock times; feasibility is still checked internally.
- Explicit schedule approval, conflict warnings, lock/unlock, manual session movement, task completion, deletion and undo. Manual movement validates constraints without moving other sessions and locks the chosen placement.
- Responsive weekly calendar and day agenda, next assignment, quick entry, deadlines, subject controls and real planning statistics. The remaining-today calculation accounts for daily limits, recorded Focus time and reserved sessions.
- Focus handoff carries the selected task and subject. Stable receipts attribute completed timer time, including device-only sessions, without adding a second verified study-session record or awarding XP twice. A cached timer belonging to another assignment is not reused. Changing the Focus task manually removes the assignment association.
- A separate Planner panel in Analytics displays this week's planned minutes, recorded Focus minutes and completed assignments. It does not add these receipts into verified activity totals again.
- Estimate suggestions require at least three comparable completed assignments with recorded Focus time. Suggestions are bounded and require explicit acceptance. Recorded time reaching an estimate does not automatically complete a task or its prerequisite.
- English and Uzbek interface copy, light/dark styling, visible focus states, semantic forms and keyboard-accessible session movement. The rest of the application's locale support remains intact.

## Persistence and ownership

The new versioned record is `users/{uid}/planner/smart-v2`, separate from legacy Planner documents. Onboarding, tasks, preferences, schedule and bounded review history use this record. Focus attribution uses `users/{uid}/planner/focus-{receiptId}` with `kind: focusReceipt`.

Device caches and Focus context keys include the account ID. The existing offline queue retries production writes. UI status distinguishes device storage, pending sync, successful sync and failure. Corrupt local records are preserved and editing stops instead of replacing them with an empty plan. An unknown cloud record is not overwritten during an initial connection failure. Known offline records can be resumed.

Remote revisions received while there is no pending local write require an explicit load before further edits. This is a whole-document synchronization model: simultaneous edits and offline reconnection do not have a transactional field-level merge. An 850 KB save guard leaves room below Firestore's document size limit. Larger-scale planning data should eventually move into separate entity collections.

Existing Firestore ownership rules already cover the private Planner collection; no rule migration or infrastructure deployment is required for these paths. New emulator tests cover owner access and rejection of other accounts and signed-out reads.

## Changed modules

New modules under `src/features/planner/`: `SmartPlanner.tsx`, `SmartPlannerForms.tsx`, `SmartPlannerInsights.tsx`, `smartPlannerModel.ts`, `smartPlannerCopy.ts`, `smartPlanner.css`, and `useSmartPlanner.ts`. The pre-existing untracked `smartSchedule.ts` was extended.

Updated pages: `src/pages/Planner.tsx`, `src/pages/Focus.tsx`, `src/pages/Analytics.tsx`.

Tests: new `tests/smart-planner-model.test.cjs`, `tests/smart-planner-browser.cjs`; existing `tests/focus.test.cjs` and `tests/firestore.rules.cjs` were extended. Existing scheduling tests were retained.

## Verification

- `npm run verify`: passed frontend TypeScript validation, backend syntax validation, **177 application tests**, **33 backend tests**, and the production build.
- The isolated browser suite passed adaptive learning-mode selection, draft restoration, real task creation, preview and approval, checklist mode, completion/undo, duration editing, Focus handoff, the Analytics panel, a 320-pixel layout, Uzbek onboarding, and dark-theme checks. The fixture rejects production writes; zero production writes were observed.
- Scheduling/model tests cover timezone offsets, DST gaps and repeated hours, overnight recurrence, calendar exceptions, overlapping windows, multiple independent subjects, no free time, short windows, impossible deadlines, recurring task stability, future occurrence release times, subject pause, unmet prerequisites, estimate exhaustion, preserved locks, stable existing plans, unsplit work, daily caps, manual movement and bounded estimates.
- Added Focus tests verify local and verified assignment attribution and protection against reusing another assignment's cached timer.
- `npm run test:rules`: **could not run**. An initial dependency fetch failed; after network access was granted, the tool reached emulator startup but failed because `java -version` could not be started. Java must be installed and available on PATH before these ownership tests can be executed. No live database-permission or production-account tests were performed.

Browser screenshots use isolated test assignments and are not examples of real student activity.

## Limits and remaining work

This implements the functional planning core, not every future feature in the master specification. Desktop drag-and-drop is not implemented; explicit keyboard-accessible session movement is available. Notebook, Flashcards and Tutor links are functional navigation, but picking a specific existing note/deck or creating an AI task breakdown directly from the Planner remains future work. External URLs, textbook references and notes can be attached to assignments now.

No reminders are created. Existing Profile notification configuration is referenced; a new Planner reminder delivery service has not been implemented or verified. No licensed tests, content partnerships or paid prerequisite were introduced. No new API key is required for deterministic planning.

Russian users currently see English copy in the new Smart Planner, while existing modules retain their Russian translations. A fully translated Russian Smart Planner remains unfinished.

The 5–7 minute onboarding target has not been measured with students. Usefulness ratings and setup timestamps are stored, but a full personalization-quality reporting pipeline, contextual interruption survey, rich recurrence exceptions, and transaction-safe collaborative device merging remain future work.

The scheduler operates on a rolling 14-day horizon. A fixed assignment can remain unscheduled when its total duration exceeds the available uninterrupted time or daily cap; the preview reports that constraint rather than splitting it automatically. Deadlines beyond the horizon do not cause unavailable future calendar time to be invented.

The release workflow was inspected. Deployment commands run verification and release preflight checks; no deployment was authorized or executed.
