export type MongoAccount = { uid: string; email: string | null; displayName: string; emailVerified: boolean };

async function request(path: string, body?: Record<string, unknown>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Sign-in failed or session expired.' :
    response.status === 429 ? 'Too many sign-in attempts. Try again later.' : 'Authentication service unavailable.'), { status: response.status });
  return response.json();
}
function account(value: unknown): MongoAccount {
  if (!value || typeof value !== 'object' || !('uid' in value) || typeof value.uid !== 'string' ||
      !('email' in value) || !(value.email === null || typeof value.email === 'string') ||
      !('displayName' in value) || typeof value.displayName !== 'string' ||
      !('emailVerified' in value) || typeof value.emailVerified !== 'boolean') throw new Error('Invalid authentication response.');
  return value as MongoAccount;
}
export async function loginMongoAccount(email: string, password: string, remember = false) {
  return account((await request('login', { email, password, remember })).user);
}
export async function getMongoSession() {
  const result = await request('session');
  if (typeof result.isAdmin !== 'boolean') throw new Error('Invalid authentication response.');
  return { user: account(result.user), isAdmin: result.isAdmin };
}
export async function logoutMongoAccount() { await request('logout', {}); }
