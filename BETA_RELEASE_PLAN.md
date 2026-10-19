# NOVIQ: 100–200-person beta release

Target: 2026-10-14. Inspection: 2026-10-12.

## Current release decision: NO-GO

Read-only live inspection confirmed:
- All 36 required backend Functions are absent, including generateAiResponse.
- Cloud Billing is disabled. No billing or cloud deployment was performed.
- Auth already authorizes the Firebase web.app domain and noviqq.uz.
- Database delete protection is enabled; PITR is disabled and scheduled backups are empty.

Earlier local verification passed, but fixtures do not establish live AI, Auth,
Storage, security rules, or capacity. 100–200 registered testers are not the
same as 100–200 simultaneous AI requests. Capacity is not yet established.

## Owner decision required first

The existing free-only restriction conflicts with deploying this Functions
backend: Firebase requires Blaze. Owner must explicitly approve billing and
choose a budget, or approve a separate, narrower demo scope. Never expose an AI
provider key in the browser to work around this restriction.

For the beta, use the existing Firebase HTTPS web.app hostname if the owner
agrees; custom-domain DNS and branding need not delay a functional test.

## Release sequence after the decision

1. Owner configures billing, spending safeguards, and server credentials in
   the provider console. Do not send passwords, card details, or keys in chat.
2. Validate the configured Gemini model with an authenticated provider request;
   local configuration alone does not prove model availability or quota.
3. Review AI quotas, authentication, abuse controls, and spending safeguards.
   Confirm limits for the beta before opening invitations. Disable or clearly
   exclude unconfigured paid checkout/Telegram features from the beta scope.
4. Verify current rules with the isolated Firestore emulator, then deploy
   reviewed Functions, rules, and indexes. Wait for index readiness. Leave
   server metrics disabled until its deployment/backfill is separately verified.
5. Test a real owner-controlled account: signup/login, Planner save/reload,
   Tutor response, Notebook upload/reload, logout and account isolation.
   Create only labelled test records; never overwrite existing user data.
6. Check the actual HTTPS beta build on mobile and desktop. Run a bounded,
   explicitly agreed concurrency test using test accounts and a cost budget.
7. Record rollback artifacts, verify a recoverable backup, and assign an owner
   for error/quota monitoring and a private feedback channel. Firestore backup
   alone does not cover Auth accounts or Storage blobs.
8. Invite 10–20 people first; expand to 50 and then 100–200 only after observing
   real AI errors, response latency, save failures, and quota consumption.

No claim of a guaranteed two-day completion or zero-cost operation is made.
Do not bypass the live release gate just to meet the date.

Official requirement: https://firebase.google.com/docs/functions/quotas
Spending safeguards: https://firebase.google.com/docs/projects/billing/budget-alerts
