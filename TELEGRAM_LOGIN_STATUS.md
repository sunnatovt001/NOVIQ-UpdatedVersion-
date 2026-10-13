# Authentication checkpoint — 2026-10-13

The public site's main signup form still uses Firebase, not MongoDB. A read-only
inspection found email sign-in enabled and the Render hostname absent from the
authorized-domain list. The exact hostname noviq-updatedversion.onrender.com
was added and read back, preserving all prior entries and account/password data.
This fixes a confirmed configuration gap, not proof of the screenshot's precise
signup error or successful account creation. Retry and inspect the auth error
code if failure persists. No test production account was created.

Existing bot noviqq_bot getMe check succeeded without printing its token.
MongoDB Telegram endpoints are implemented with signed proof verification,
five-minute freshness, replay rejection, stable Telegram ID mapping, and no
username/email-based account takeover or implicit admin grant. Server tests: 22
passing; Telegram HTTP tests use synthetic credentials, not live user sessions.

Owner setup required before activation:
- BotFather /setdomain for noviqq_bot → noviq-updatedversion.onrender.com.
- Render server-only TELEGRAM_BOT_USERNAME=noviqq_bot and TELEGRAM_BOT_TOKEN
  from the owner's existing bot configuration; never send token in chat.
- Manually deploy the reviewed staging commit (auto-deploy remains off).

The Telegram widget/button and main-app Mongo auth integration are NOT complete.
Do not describe Telegram sign-in/sign-up as usable yet. GET
/api/auth/telegram-config exposes only enablement and public bot name, never token.
POST /api/auth/telegram requires the signed widget payload and exact site Origin;
username-only requests fail closed. Linking Telegram to an existing email/admin
account must require an authenticated, separately verified linking flow.

Reference: https://core.telegram.org/widgets/login
