import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  TwitterAuthProvider,
  updateProfile,
  type AuthProvider as FirebaseAuthProvider,
} from "firebase/auth";

import { app } from "./firebaseApp";
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();

const AUTH_REMEMBER_KEY = "noviq:auth-remember";

const readRememberPreference = () => {
  if (typeof window === "undefined") return true;

  try {
    return window.localStorage.getItem(AUTH_REMEMBER_KEY) !== "session";
  } catch {
    return true;
  }
};

const saveRememberPreference = (remember: boolean) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(AUTH_REMEMBER_KEY, remember ? "local" : "session");
  } catch {
    // Auth still works if the browser blocks localStorage.
  }
};

export const getRememberAuthPreference = readRememberPreference;

export const authPersistenceReady = setPersistence(
  auth,
  readRememberPreference() ? browserLocalPersistence : browserSessionPersistence
).catch((error) => {
  console.warn("Auth persistence setup failed", error);
});

const applyAuthPersistence = async (remember = true) => {
  saveRememberPreference(remember);
  await authPersistenceReady;
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
};

export type SocialAuthProviderId = "google" | "github" | "facebook" | "twitter";

const createSocialProvider = (providerId: SocialAuthProviderId): FirebaseAuthProvider => {
  switch (providerId) {
    case "github": {
      const provider = new GithubAuthProvider();
      provider.addScope("user:email");
      return provider;
    }
    case "facebook": {
      const provider = new FacebookAuthProvider();
      provider.addScope("email");
      return provider;
    }
    case "twitter":
      return new TwitterAuthProvider();
    case "google":
    default: {
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");
      return provider;
    }
  }
};

export const loginWithSocialProvider = async (providerId: SocialAuthProviderId, remember = true) => {
  try {
    await applyAuthPersistence(remember);
    const result = await signInWithPopup(auth, createSocialProvider(providerId));
    return result.user;
  } catch (error) {
    console.error("Social login failed", error);
    throw error;
  }
};

export const loginWithGoogle = async (remember = true) => loginWithSocialProvider("google", remember);

export const loginWithEmail = async (email: string, password: string, remember = true) => {
  await applyAuthPersistence(remember);
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
};

export const resetPasswordWithEmail = async (email: string) => {
  await sendPasswordResetEmail(auth, email.trim());
};

export const registerWithEmail = async (
  displayName: string,
  email: string,
  password: string,
  remember = true
) => {
  await applyAuthPersistence(remember);
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);

  if (displayName.trim()) {
    await updateProfile(result.user, { displayName: displayName.trim() });
  }

  // AuthProvider owns initial profile creation; a second full write here raced
  // against its listener and attempted to overwrite protected fields.
  return result.user;
};
