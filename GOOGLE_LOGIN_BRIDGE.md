# Google login migration bridge

Temporary flow on /backend-check:
existing Firebase Google popup → client ID token → POST /api/auth/google →
Admin SDK verification → existing MongoDB UID → MongoDB session/role check.

No lookup/link by submitted email, no new accounts, no automatic admin grants,
and no password changes. Only imported Google-provider accounts from the legacy
project may use this bridge. MongoDB disabled/MFA-required accounts are rejected.
Claims must be from the correct project, Google provider, verified email and a
sign-in within five minutes. Emulator verification is rejected.

Uses firebase-admin token verification, not hand-rolled JWT validation. The normal
verification path checks signature/issuer/audience/expiry with public certificates;
Firebase server-side revocation checks are not enabled. This remains a migration
bridge and is NOT complete removal of Firebase authentication.

24 server tests pass, including Google mapping/claim rejection with injected
verified-claims fixtures. Real owner Google popup and deployed token verification
still require testing. Do not claim live login success based on fixture tests.

No new secret variables needed for this public-certificate verification path.
Render manual deploy is required because auto-deploy is off. Then use Continue
with Google on /backend-check with the existing owner account. Main app migration,
full admin operations, AI and upload work remain open.

Reference: https://firebase.google.com/docs/auth/admin/verify-id-tokens
