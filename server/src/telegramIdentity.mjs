import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
const allowed = new Set(['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']);
// Telegram Login Widget proof. A username alone is NEVER authentication.
export function verifyTelegramIdentity(payload, token, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token) ||
      !payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).some(key => !allowed.has(key)) ||
      !/^\d{1,16}$/.test(String(payload.id)) || !/^\d{1,12}$/.test(String(payload.auth_date)) ||
      typeof payload.first_name !== 'string' || !payload.first_name ||
      !/^[a-f0-9]{64}$/.test(payload.hash || '')) return null;
  for (const [key, value] of Object.entries(payload)) {
    if (!['id', 'auth_date'].includes(key) && typeof value !== 'string') return null;
    if (String(value).length > 1024) return null;
  }
  const age = nowSeconds - Number(payload.auth_date);
  if (!Number.isFinite(age) || age < -30 || age > 300) return null;
  const data = Object.keys(payload).filter(key => key !== 'hash').sort().map(key => `${key}=${payload[key]}`).join('\n');
  const secret = createHash('sha256').update(token).digest();
  const expected = createHmac('sha256', secret).update(data).digest();
  if (!timingSafeEqual(expected, Buffer.from(payload.hash, 'hex'))) return null;
  return { telegramId: String(payload.id), displayName: [payload.first_name, payload.last_name].filter(Boolean).join(' '),
    username: typeof payload.username === 'string' ? payload.username : null };
}
