import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
export const legacyProject = 'gen-lang-client-0937997111';
const app = getApps().find(item => item.name === 'noviq-google-migration') || initializeApp({ projectId: legacyProject }, 'noviq-google-migration');
export async function verifyGoogleBridge(token, { verify = value => getAuth(app).verifyIdToken(value), now = () => Date.now() } = {}) {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || typeof token !== 'string' || token.length < 100 || token.length > 3500) return null;
  try {
    const claims = await verify(token);
    if (claims.aud !== legacyProject || claims.iss !== `https://securetoken.google.com/${legacyProject}` ||
        claims.firebase?.sign_in_provider !== 'google.com' || claims.email_verified !== true ||
        typeof claims.uid !== 'string' || !claims.uid || !Number.isFinite(claims.auth_time)) return null;
    const age = now() / 1000 - claims.auth_time;
    if (age < -30 || age > 300) return null;
    return { uid: claims.uid, project: legacyProject };
  } catch { return null; }
}
