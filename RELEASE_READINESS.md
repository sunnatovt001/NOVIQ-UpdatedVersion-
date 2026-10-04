# Local release verification — 2026-10-04

## Fixed in this checkout

- General/IELTS chat crashed on legacy ISO-string dates. Chat now accepts ISO strings, Date values, and Firestore timestamps without changing stored records.
- Chat reconnect now starts a new listener after a permission failure. Other loading failures offer retry instead of incorrectly requesting membership changes.
- Removed the inactive Nexus options button.
- Missing statistics indexes fall back to reads of actual account records. Permission/network failures still remain failures; fallback never fabricates values.
- Focus help opens instructions; new accounts show a proper empty task state instead of a sample biology task.
- Added accessible names to modal close controls and bounded website-source downloads to 15 seconds.
- Rejoining preserves existing membership metadata and the original joined date.
- Profile bootstrap now returns the existing document if it appears during the transaction, preventing temporary progress resets. Stale account callbacks are ignored.
- Focus task completion persists across navigation and reloads.
- `npm run verify` runs the complete local checks; GitHub Actions additionally schedules the isolated Firestore rules suite with Java 21.

## Verification evidence

- Browser: General displays its existing messages, IELTS displays its existing messages, and the legacy SAT group shows its real empty state.
- Browser: Focus help and focus/break mode switches; Planner settings close and roadmap/back navigation; Notebook source tabs; deck form open/close and review-card flip/end; billing monthly/yearly and Continue Free; mobile menu navigation were exercised.
- Dashboard statistics refresh message disappeared after the index fallback change.
- 38 isolated tests pass, covering profile creation races, old chat dates, missing indexes, permissions, sync, session verification, memberships, invitations, payment validation, and private Telegram command authorization.
- Production build passes. TypeScript and Functions syntax checks pass.
- Frontend and Functions dependency audits, including development dependencies, returned zero known vulnerabilities on 2026-10-04.

## Remaining release gates

This is not yet a verified complete live release. A rendered button alone does not prove its server operation succeeds.

- The separate new SAT group still rejects reads for the current account. Its membership repair requires the updated joinCommunity function to be deployed and successfully called by the member.
- Planner Recommendations returned an AI service error during browser verification. The deployed AI callable/provider configuration still needs successful verification.
- Deploy the matching Functions, Firestore rules/indexes and Storage rules together with the client, then verify real membership repair, message send, invitation acceptance and verified session completion.
- Payment settlement and Telegram delivery were not performed against the user's account. They require working provider credentials and webhooks. No payment or message was sent during this audit.
- The separate Firestore emulator rules suite needs a newer Java runtime than the installed Java 8; it has not been executed on this machine.
- Delete/reset actions and cloud writes were not exercised against production data. Existing user records and progress must remain intact.

No GitHub push or deployment was performed.

## Latest requested fixes

- Planner opens existing activities immediately while requesting the server study proof independently. Verified completion still requires the server proof.
- The earlier duplicate SAT entry is hidden from the joined-group list; no group, message, or membership was deleted.
- Metrics accepts legacy and Firestore timestamps and excludes sessions whose dates cannot be parsed.
- Profile links to @noviqq_bot. The server checks the configured token using Telegram getMe before issuing a link.
- Telegram supports /planner and /metrics for linked private chats using the existing user and planner records. Live token/webhook configuration and delivery remain unverified.
- Invitation delivery still needs an identified email provider. The current invitation-link flow does not send email, and a separate friend chat has not yet been implemented.
