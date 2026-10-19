# Render staging setup

Confirmed repository: sunnatovt001/NOVIQ-UpdatedVersion-.
Local origin URL updated; remote main fetched without merging or overwriting.
Local branch is codex/foundation-redesign. Remote main has additional edits
to package-lock.json, UpgradeModal, upgradeCopy and Tutor; reconcile before
frontend publication. Do not force-push or silently replace remote main.

Backend service configuration (not deployed):

- Runtime: Node
- Root directory: server
- Build command: npm ci --ignore-scripts && npm test
- Start command: npm start
- Instance type: Free
- Health check: /health
- Auto deploy: disabled until the reviewed staging branch is approved

Server start uses Render environment variables, not a missing .env file.
On Render, host binds to 0.0.0.0 and platform PORT. Local startup remains
loopback via npm --prefix server run start:local.

Server-only environment: MONGODB_URI, MONGODB_DATABASE=noviq_staging,
APP_ORIGIN=<exact tested frontend origin>, NODE_VERSION=22. Do not put
credentials into Git, chat, logs, or VITE_* variables. Do not use production
database or guess APP_ORIGIN to make login pass.

Atlas network access must narrowly allow the selected Render service's outbound
addresses, after explicit owner approval; do not open 0.0.0.0/0 as a workaround.
The current direct-socket login IP limit needs a tested trusted-proxy policy
before production use behind Render. Frontend/API same-origin routing is not
yet configured. HTTP auth, AI, uploads, full admin and frontend cutover must
be verified together before promoting or inviting testers.

Source https://render.com/docs/web-services
