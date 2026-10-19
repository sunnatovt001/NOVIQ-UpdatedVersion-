# NOVIQ Planner 2.1 delivery

Implemented in `C:\Users\User\Documents\NOVIQ`. No production deployment or production-data migration was performed. Existing unrelated working-tree changes were retained.

## Confirmed persistence causes

The previous hook treated a cache-only missing Firestore snapshot as proof that no plan existed. It initialized a fresh plan and allowed queued full-document saves before the authoritative saved plan arrived. An existing pending replacement then caused the real saved plan to be ignored. A reproduction against the old hook demonstrated both paths.

The previous generic offline queue used unconditional full-document replacement without checking the saved revision. A stale device could overwrite newer work. Opening setup also persisted `ready:false`, making a confirmed plan appear unfinished on return. Completion removed schedule records, obscuring past work.

## Loading, saving, recovery, and ownership

- `plannerPersistence.ts` contains a per-account repository. Mounting and reconnecting only read. Cache absence cannot create a plan. Creation requires an explicit action after the server confirms absence.
- `plannerCloud.ts` performs Firestore transactions against the existing `users/{uid}/planner/smart-v2` document. It compares the expected revision before atomically replacing the aggregate of tasks, sessions, subjects, and preferences. Stale clients receive a conflict. Retrying an already accepted revision is a no-op.
- The existing schema version and document path are retained. Successful edits add `persistenceVersion:3`, `sequence`, `previousRevision`, and, for confirmed plans, `confirmedAt`. Legacy documents are upgraded on the next intentional edit; opening one does not rewrite it.
- Acknowledged account state, pending plan drafts, task-form drafts, and setup drafts use separate UID-scoped local keys. The interface distinguishes device-only, pending, saving, saved, failure, and conflict states. Pending SDK snapshots never count as account confirmation.
- Failed network writes retain their draft and allow retry. Storage errors reject the edit instead of claiming it was saved. Corrupt data is preserved for backup. A newer device copy missing from the server is held for explicit recovery review.
- Concurrent edits use a three-way comparison. Unrelated changes merge; conflicting fields require a choice. Choosing the saved version first backs up the pending draft. Draft changes from another tab stop editing for review. An older asynchronous acknowledgement cannot replace a newer observed version.
- Old generic queued `smart-v2` replacements are quarantined from automatic flushing. They can be reviewed through the repository. They are retired only after successful migration or an explicit reviewed decision. Other modules' queue behavior is retained.
- The authenticated UID scopes the repository, cache, drafts, history, and Firestore paths. Account switches remount the Planner workspace. Firestore rules require the owner, validate persistence metadata, enforce increasing sequence and matching parent revision, and deny direct plan deletion. Cross-account reads and writes were tested.

## History and database changes

Before changing a confirmed plan, the same transaction stores the previous complete version under `users/{uid}/plannerHistory/{newRevision}`. History records are owner-readable and immutable to clients. The interface fetches the latest 12 entries and previews a restoration. Applying a restoration saves the current version first, so it can also be restored.

No destructive migration, index change, or new dependency is required. History is retained in the database; the 12-entry limit is the displayed query, not a deletion policy. Large plans are rejected locally above 850 KB to leave room below Firestore's document limit.

The frontend and Firestore rules need a coordinated release. The updated client uses transactions even before new rules are deployed, but old clients do not honor that contract. Once the stricter rules are deployed, old clients must reload before editing. Production enforcement and real-account behavior have not been claimed verified.

## Preventing unwanted regeneration

Page entry, refresh, date navigation, midnight, profile reads, and reconnect do not invoke the scheduler or persist a new plan. Setup edits are temporary and leave the confirmed schedule untouched. Saving preferences retains sessions. Optimization, moves, resizes, deletion, and history restoration create reviewable proposals; only Apply persists their reviewed content. A changed root revision or focus evidence makes an outstanding proposal stale.

Scheduling retains availability, protected commitments, breaks, deadlines, dependencies, explicit not-before times, daily caps, recurrence, and locks. Paused subjects retain protected locked sessions. Completed and missed schedule records remain visible. Suggestions use actual missed sessions or at least three comparable completed-task observations. There are no invented assignments, grades, accuracy values, or study totals.

## UX and responsive changes

`SmartPlanner.tsx`, `PlannerCalendar.tsx`, `PlannerReviewPanels.tsx`, `SmartPlannerForms.tsx`, `calendarModel.ts`, and scoped Planner styles implement:

- Central day/week calendar, date navigation, current-time marker, subject colors, fixed commitments, completed-session styling, placement-conflict markers, and a collapsible context panel.
- Native desktop drag/move and resize previews. Manual date/time/duration controls provide a keyboard and touch alternative. Placement checks reject locks, protected time, availability conflicts, deadlines, dependencies, and daily-load violations.
- Inline task details with own-material links, priority, duration, category, recurrence, dependency, completion, and recovery of unsaved task text. Setup retains the six-step personalized flow and self-study, tutor, and hybrid subject modes.
- Actual next work, remaining available time, deadlines, subject controls, missed-work suggestions, plan history, clear save state, and owner-scoped backup export.
- Mobile agenda in place of a compressed time grid; tested at 390 px and 320 px. Dark theme, visible keyboard focus, Escape, reduced motion, and English/Uzbek Planner copy are supported. Legacy exam missions remain available.

Focus uses the existing task context and timer/proof flow. Planner attribution adds no duplicate XP or timer. Flashcards can add linked review tasks through the transactional Planner repository while preserving existing sessions. Existing module routes remain in place.

## Executed verification

- Old-hook reproduction: confirmed cache-miss initialization and stale full-replacement failure paths.
- `npm run verify`: passed TypeScript, backend syntax checks, 209 application tests, 33 backend tests, and production build.
- `npm run test:rules`: all 13 tests passed against the demo Firestore emulator, including ownership, simultaneous transaction conflict, stale unconditional-write rejection, immutable history, restoration, and existing large legacy metrics checks.
- `planner21-persistence-browser.cjs`: passed cache absence/no writes, explicit setup, exact refresh persistence, Flashcards navigation and return, simulated logout/login, second-account isolation, local setup changes, and recoverable failed saves. No production backend requests or uncaught errors.
- `planner21-experience-browser.cjs`: passed no-write load of confirmed/missed/completed sessions, drag preview and Apply, refresh after move, duration edits preserving schedule history, task-draft recovery, separate-device merge, history restore, no-write calendar navigation, 320/390 px layout, reduced motion, dark theme, and Uzbek UI.
- `planner21-integration-browser.cjs`: passed manual protected-time rejection, reviewed resize, visible Focus task handoff, actual Flashcards-linked task creation preserving the timetable, navigation across Dashboard/Notes/Tutor/Analytics/Profile/Planner, and simulated local midnight with zero Planner writes.
- Focused recovery/model/calendar tests: 40/40 passed, including missing-server recovery, another-tab draft backup, explicit not-before, locked paused subjects, and invalid resize safety.
- Separate existing Tutor/Notebook browser checks passed all 12 light/dark and English/Uzbek/Russian combinations. Existing auth browser checks passed signup validation, focus trapping, Escape, password recovery, loading/error behavior, backup controls, and monitoring recovery.
- The full existing Flashcards browser suite also passed: legacy loading, refresh-safe drafts/cards, AI suggestion handling, all study modes, review resume, linked Planner task completion, editing/undo/history, responsive layout, account isolation, corrupt-data preservation, and no production requests. Its isolated fixture was extended to execute Planner transactions locally.
- Final `git diff --check` passed (only line-ending notices). Calendar and mobile-agenda screenshots were visually inspected.

## Verification limits and remaining constraints

The old combined core browser batch was attempted and stopped on its previous Planner landing-text assertion (`Your mentor for today`). It was not reported green. New Planner scenarios and unaffected AI/auth suites were run separately. Existing production-audit artifacts may include output from that attempted batch.

Browser checks use isolated local services and simulated authentication; database concurrency and security use the actual Firestore client against a demo emulator. No real production login, production database, payment, or AI-provider calls were used. Browser drag handlers were exercised with native drag events; physical mouse/touch device QA remains advisable. Mobile uses manual movement rather than native touch drag. Very short adjacent events can be visually dense in the desktop time grid; the agenda and task details expose their full content.

History retention has no automatic server cleanup. Persistence is a bounded aggregate document, not an unbounded task database. Russian currently follows the pre-existing English fallback for Smart Planner copy; English and Uzbek are implemented. Existing backend tests validate the real Focus proof/credit rules, while this task's browser test verifies handoff rather than a production credited timer session.

The production release is intentionally pending. This report describes implemented and locally verified behavior, not a deployed rollout.
