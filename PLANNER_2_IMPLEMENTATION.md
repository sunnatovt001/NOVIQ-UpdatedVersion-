# NOVIQ Smart Planner — implementation status

## Audit findings

The current React/Vite Planner uses a single `ExamMode`, score-oriented defaults,
generated mission activities and an estimated `scheduledWindow` string. It does
not represent multiple independent subjects, real weekly availability, fixed
commitments or timestamped user assignments. It persists existing Planner state
through account-scoped local storage and Firebase/offline queued writes. MongoDB
verification routes do not establish that Planner storage has migrated.

Keep existing missions/history intact. Introduce a versioned Smart Planner document
alongside legacy state, with account-scoped ownership and explicit migration opt-in.
Subject entities should hold self-study/tutor/hybrid modes independently. Six-step
onboarding drafts must persist before final confirmation. Calendar UI must convert
local timezone/recurrence input to validated timestamp windows before scheduling.
Never interpret empty score fields as known ability.

## Implemented foundation

`src/features/planner/smartSchedule.ts` is an isolated, deterministic preview engine.
It schedules multiple-subject assignments within supplied availability, excludes
protected events and locked sessions, applies breaks, splits workload, prioritizes
deadlines, orders dependencies and returns unmet-capacity/dependency warnings.
It does not mutate inputs, save plans or call an AI service.

Six unit tests passed for independent subjects, fixed events, locks, impossible
deadlines, past-time exclusion, dependencies/cycles, unavailable days, immutability
and malformed constraints. TypeScript validation passed.

## Not complete / not integrated

This is NOT the finished Planner 2.0 and is not yet exposed in the UI. Adaptive
onboarding, persistent new entities, timezone/DST conversion, recurrence expansion,
rescheduling approval/diff, flexible agenda mode, Focus attribution, personalization,
permission verification and responsive/localized end-to-end flows remain required.
Locked-session conflicts supplied by callers still need explicit conflict reporting.
Scheduling preferences/energy/workload soft constraints are not implemented yet.
No new cloud data was written and no changes were deployed or pushed.
