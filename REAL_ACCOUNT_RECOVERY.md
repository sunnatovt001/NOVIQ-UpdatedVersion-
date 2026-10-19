# NOVIQ real-account recovery delivery

Implemented in the normal application checkout: C:/Users/User/Documents/NOVIQ. Normal development address: http://127.0.0.1:3000/ . No production deployment was performed.

## Account routing
The configured membership callable returned HTTP 404. Ordinary localhost development now uses an authenticated, loopback-only server endpoint: it verifies the Firebase ID token, derives the account ID from that token, reads that account's existing membership under its access rules, and applies the existing membership calculation. It does not grant PRO by email, URL, local storage, or a preview flag. Membership lookup failures have an explicit retry state. Account changes remount account-specific route state.

The user confirmed that their existing PRO account now receives the new interface and other accounts retain Free. Independent inspection of the separate automated Chrome session is still pending user sign-in. Fixture screenshots are labelled as fixtures and do not prove real-account totals.

## Data accuracy
Dashboard and Analytics consume actual owner-scoped study records, deduplicate stable session IDs, exclude breaks and unfinished/invalid records, and use explicit calendar time zones. Durations retain minutes and seconds rather than rounding up to fictional hours. Device-only activity is labelled. Loading and failed reads do not certify a zero. Planner totals read the current saved planner document with legacy fallback. Review retries deduplicate without collapsing distinct legacy attempts. Cross-account metric state is guarded.

Notebook edits are saved to private, owner-scoped durable drafts immediately and autosaved to the existing note. Reload recovery and remote-change conflicts preserve the draft. No invented historical activity was inserted into real accounts.

## Validation
- 220 application tests passed.
- 39 backend tests passed.
- Type checking and production build passed.
- 64 PRO browser captures: eight routes, both themes, 1600/820/390/320 widths.
- 16 Free before/after comparisons: zero changed pixels.
- Browser workflows cover task creation/completion, review persistence, actual one-minute totals, excluded break/pending sessions, immediate-reload draft recovery and autosave.
- Browser fixture tests use isolated records, not the real user's data.

Evidence: artifacts/real-account/comparisons/index.html, verification.log, data-browser.log, workflows.log, controls.log and free-comparison.json.

## Practical limits
This is a local development membership recovery, not a repair deployed to the missing production callable. The production endpoint still needs a separate deployment when authorized. Local checkout/payment activation is not fabricated. AI/provider availability remains dependent on the configured services.

The reference gallery documents intentional layout adaptations: existing NOVIQ navigation, real supported metrics instead of fictional GPA/attendance/work-life scores, a botanical SVG instead of a fern photograph, Sources/AI instead of an unsupported relationship graph, and two configured plans instead of four fictional hosting plans. Exact visual equivalence is not claimed.

The original checkout contains unrelated pre-existing changes. No blanket commit or reset was made. Synced project sources were not edited.
