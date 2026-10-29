import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { legacyProject } from './googleBridge.mjs';
let firebaseAuth;
function authority() {
  if (firebaseAuth) return firebaseAuth;
  const name = 'noviq-primary-auth';
  let app = getApps().find(item => item.name === name);
  if (!app) {
    const options = { projectId: legacyProject };
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (account.project_id !== legacyProject) throw new Error('Firebase identity project mismatch.');
      options.credential = cert(account);
    }
    app = initializeApp(options, name);
  }
  return firebaseAuth = getAuth(app);
}

// Firebase remains the identity authority. The MongoDB session is a transport
// credential only. Revocation/disabled-user checks happen on every exchange.
export async function verifyFirebaseIdentity(token, { verify = value => authority().verifyIdToken(value, true), now = () => Date.now(), includeClaims = false } = {}) {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || typeof token !== 'string' || token.length < 100 || token.length > 16000) return null;
  try {
    const claims = await verify(token), age = now() / 1000 - claims.iat;
    if (claims.aud !== legacyProject || claims.iss !== `https://securetoken.google.com/${legacyProject}` ||
        typeof claims.uid !== 'string' || !claims.uid || claims.uid.length > 128 || claims.sub !== claims.uid ||
        !Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) || claims.exp <= now() / 1000 ||
        age < -30 || age > 3600 || typeof claims.firebase?.sign_in_provider !== 'string') return null;
    return { uid: claims.uid, project: legacyProject,
      email: typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null,
      displayName: typeof claims.name === 'string' ? claims.name.slice(0, 300) : '',
      emailVerified: claims.email_verified === true, ...(includeClaims?{claims}: {}) };
  } catch { return null; }
}
