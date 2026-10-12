import { randomBytes, createHash } from 'node:crypto';

const tokenHash = token => createHash('sha256').update(token).digest('hex');
const validToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

export function createSessionService(db, { now = () => new Date(), random = randomBytes } = {}) {
  const sessions = db.collection('auth_sessions');
  const accounts = db.collection('auth_accounts');
  return {
    async ensureIndexes() {
      await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await sessions.createIndex({ userId: 1 });
    },
    async create(userId, remember = false) {
      if (typeof userId !== 'string' || !userId || typeof remember !== 'boolean') throw new Error('Invalid session request.');
      const account = await accounts.findOne({ _id: userId });
      if (!account || account.disabled) throw new Error('Account unavailable.');
      const token = random(32).toString('hex');
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + (remember ? 30 : 1) * 86400000);
      await sessions.insertOne({ _id: tokenHash(token), userId, createdAt, expiresAt });
      return { token, expiresAt };
    },
    async resolve(token) {
      if (!validToken(token)) return null;
      const session = await sessions.findOne({ _id: tokenHash(token) });
      // TTL deletion is asynchronous; enforce expiry ourselves on every request.
      if (!session || !(session.expiresAt instanceof Date) || session.expiresAt <= now()) return null;
      const account = await accounts.findOne({ _id: session.userId });
      if (!account || account.disabled) return null;
      return { uid: account._id, email: account.email || null,
        displayName: account.displayName || '', emailVerified: account.emailVerified === true };
    },
    async revoke(token) {
      if (validToken(token)) await sessions.deleteOne({ _id: tokenHash(token) });
    },
    async revokeAll(userId) {
      if (typeof userId !== 'string' || !userId) throw new Error('Invalid account.');
      await sessions.deleteMany({ userId });
    },
  };
}

export function sessionCookie(token, { secure = true, maxAge } = {}) {
  if (!validToken(token)) throw new Error('Invalid session token.');
  if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 2592000)) throw new Error('Invalid cookie lifetime.');
  return `${secure ? '__Host-' : ''}noviq_session=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}`;
}

export function requireTrustedOrigin(requestOrigin, allowedOrigin) {
  // Mandatory on cookie-authenticated mutations, including login/logout.
  if (typeof requestOrigin !== 'string' || requestOrigin !== allowedOrigin || !allowedOrigin) {
    throw new Error('Untrusted request origin.');
  }
}
