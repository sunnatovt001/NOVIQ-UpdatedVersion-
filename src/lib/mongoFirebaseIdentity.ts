import { auth } from './firebaseAuth';
import { mongoStudyRequest } from './mongoStudyClient';
import type { MongoAccount } from './mongoAuthApi';

// Explicitly opt-in: existing Firebase screens are not switched by this helper.
// Never accept a UID/email from caller input as the session identity.
export async function exchangeFirebaseIdentity() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required.');
  const idToken = await user.getIdToken(true);
  if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed.');
  const result = await mongoStudyRequest<{user:MongoAccount}>('/api/auth/firebase','POST',{idToken});
  if (auth.currentUser?.uid !== user.uid || result.user.uid !== user.uid) throw new Error('Account changed.');
  return result.user;
}
