import { createHash } from 'node:crypto';
import { verifyLegacyPassword } from './legacyPassword.mjs';
import { requireTrustedOrigin, sessionCookie } from './sessions.mjs';
import { verifyTelegramIdentity } from './telegramIdentity.mjs';

export function readSessionToken(header) {
  if (typeof header !== 'string') return null;
  const parts = header.split(';').map(v => v.trim()).filter(v => v.startsWith('__Host-noviq_session='));
  return parts.length === 1 ? parts[0].slice('__Host-noviq_session='.length) : null;
}
async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw Object.assign(new Error(), { status: 415 });
  let bytes = 0; const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length; if (bytes > 4096) throw Object.assign(new Error(), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error(), { status: 400 }); }
}
export function createAuthApi(db, sessions, { origin, verify = verifyLegacyPassword, now = () => new Date(), telegramToken = '', telegramBotUsername = '' }) {
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
    const send = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path === '/api/auth/telegram-config' && request.method === 'GET') {
        const enabled = /^\d+:[A-Za-z0-9_-]{20,}$/.test(telegramToken) && /^[A-Za-z0-9_]{5,32}$/.test(telegramBotUsername);
        return send(200, { enabled, botUsername: enabled ? telegramBotUsername : null });
      }
      if (path === '/api/auth/session' && request.method === 'GET') {
        const user = await sessions.resolve(readSessionToken(request.headers.cookie));
        if (!user) return send(401, { error: 'Authentication required.' });
        const role = await db.collection('auth_roles').findOne({ _id: user.uid });
        return send(200, { user, isAdmin: role?.isAdmin === true });
      }
      if (request.method !== 'POST') return send(405, { error: 'Method not allowed.' });
      try { requireTrustedOrigin(request.headers.origin, origin); } catch { return send(403, { error: 'Untrusted request origin.' }); }
      if (path === '/api/auth/telegram') {
        const payload = await readJson(request);
        const identity = verifyTelegramIdentity(payload, telegramToken, Math.floor(now().getTime() / 1000));
        if (!identity) return send(401, { error: 'Telegram identity could not be verified.' });
        try {
          await db.collection('auth_telegram_proofs').insertOne({ _id: payload.hash, expiresAt: new Date(now().getTime() + 600000) });
        } catch (error) {
          if (error.code === 11000) return send(401, { error: 'Telegram authorization already used. Sign in again.' });
          throw error;
        }
        // Never link by mutable username/email or grant an admin role.
        const uid = `tg_${identity.telegramId}`;
        const accounts = db.collection('auth_accounts');
        try {
          await accounts.insertOne({ _id: uid, telegramId: identity.telegramId, telegramUsername: identity.username,
            displayName: identity.displayName, disabled: false, emailVerified: false, providers: ['telegram'], createdAt: now() });
        } catch (error) { if (error.code !== 11000) throw error; }
        const account = await accounts.findOne({ _id: uid });
        if (!account || account.telegramId !== identity.telegramId || account.disabled || account.mfaRequired) return send(401, { error: 'Telegram sign-in unavailable.' });
        const session = await sessions.create(uid, false);
        await sessions.revoke(readSessionToken(request.headers.cookie));
        response.setHeader('Set-Cookie', sessionCookie(session.token));
        return send(200, { user: await sessions.resolve(session.token) });
      }
      if (path === '/api/auth/logout') {
        await sessions.revoke(readSessionToken(request.headers.cookie));
        response.setHeader('Set-Cookie', sessionCookie('0'.repeat(64), { maxAge: 0 }));
        return send(200, { ok: true });
      }
      if (path !== '/api/auth/login') return send(404, { error: 'Not found.' });
      const body = await readJson(request);
      if (!body || typeof body.email !== 'string' || body.email.length > 254 || typeof body.password !== 'string' ||
          !body.password || Buffer.byteLength(body.password) > 1024 || (body.remember !== undefined && typeof body.remember !== 'boolean')) {
        return send(400, { error: 'Invalid login request.' });
      }
      const email = body.email.trim().toLowerCase(), timestamp = now();
      // Shared MongoDB counters: fixed ten-minute buckets. Do not trust forwarded IP headers.
      for (const [kind, value, ceiling] of [['email', email, 8], ['ip', request.socket.remoteAddress || 'unknown', 30]]) {
        const key = createHash('sha256').update(`${kind}:${value}:${Math.floor(timestamp.getTime() / 600000)}`).digest('hex');
        const counter = await db.collection('auth_login_limits').findOneAndUpdate({ _id: key },
          { $inc: { attempts: 1 }, $setOnInsert: { expiresAt: new Date(timestamp.getTime() + 1200000) } },
          { upsert: true, returnDocument: 'after' });
        if (!counter || counter.attempts > ceiling) return send(429, { error: 'Too many login attempts. Try later.' });
      }
      const account = await db.collection('auth_accounts').findOne({ email });
      const settings = await db.collection('auth_settings').findOne({ _id: 'legacy-firebase' });
      const dummy = { salt: 'AQID', passwordHash: Buffer.alloc(64).toString('base64') };
      const verified = await verify(body.password, account && !account.disabled && !account.mfaRequired ? account : dummy, settings?.hashConfig);
      if (!verified || !account || account.disabled || account.mfaRequired) return send(401, { error: 'Email or password is incorrect, or this sign-in method is unavailable.' });
      const previous = readSessionToken(request.headers.cookie);
      const session = await sessions.create(account._id, body.remember === true);
      await sessions.revoke(previous);
      response.setHeader('Set-Cookie', sessionCookie(session.token, body.remember ? { maxAge: 2592000 } : {}));
      return send(200, { user: await sessions.resolve(session.token) });
    } catch (error) {
      const status = [400, 413, 415].includes(error.status) ? error.status : 503;
      return send(status, { error: status === 503 ? 'Authentication service unavailable.' : 'Invalid login request.' });
    }
  };
}
