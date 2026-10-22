import React, { createContext, useContext, useEffect, useState } from "react";
import { withDeadline } from "@/src/lib/asyncRequest";
import { getProfileAvatar } from '@/src/lib/profileAvatar';
import { isReadOnlyAudit } from "@/src/lib/auditMode";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, authPersistenceReady } from "@/src/lib/firebaseAuth";
import { UserProfile } from "@/src/types";
import { getAccountErrorCode } from "@/src/features/auth/accountErrors";
import { loadLocalData, removeLocalData, saveLocalData } from "@/src/lib/localStore";
import { calculateLevel, calculateLevelName, createInitialXpState, getCurrentStreak } from "@/src/lib/progressMath";
import { getDefaultSubscription } from "@/src/lib/subscription";
import { hasCompletedOnboarding, legacyOnboardingProfilePatch, onboardingProfilePatch, validOnboardingAnswers } from '@/src/features/onboarding/onboardingState';
import { getQueuedOperation, useOfflineSyncQueue, writeDocWithQueue } from "@/src/lib/offlineSync";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  completeOnboarding: (answers: { mainGoal: string; userType: string; struggle: string }) => Promise<void>;
  updateLocalProfile: (patch: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const createInitialProfile = (firebaseUser: User): UserProfile => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email || "",
  displayName: firebaseUser.displayName || "",
  photoURL: firebaseUser.photoURL || "",
  createdAt: new Date().toISOString(),
  isAdmin: false,
  onboarded: false,
  // Missing onboardingCompleted also means incomplete. Keep bootstrap compatible
  // with deployed legacy rules until the new onboarding rules are released.
  goals: [],
  currentLevel: "Beginner",
  dailyTargetMinutes: 30,
  ...createInitialXpState(),
  streak: 0,
  lastActive: new Date().toISOString(),
  totalStudySeconds: 0,
  subscription: getDefaultSubscription(),
  usage: {},
  settings: {},
});

const profilePatchKey = (uid: string) => `noviq:${uid}:profilePatch`;
const profileCacheKey = (uid: string) => `noviq:${uid}:profile`;

const CLIENT_PROFILE_FIELDS = new Set<keyof UserProfile>([
  "displayName",
  "photoURL",
  "onboarded",
  "onboardingAnswers",
  "goals",
  "currentLevel",
  "dailyTargetMinutes",
  "showActionButtons",
  "settings",
]);

const filterClientProfilePatch = (patch: Partial<UserProfile>) =>
  Object.fromEntries(
    Object.entries(patch).filter(([key]) => CLIENT_PROFILE_FIELDS.has(key as keyof UserProfile))
  ) as Partial<UserProfile>;

const withLocalProfilePatch = (profile: UserProfile): UserProfile => ({
  ...profile,
  ...filterClientProfilePatch(loadLocalData<Partial<UserProfile>>(profilePatchKey(profile.uid), {})),
});

const clearLocalProfilePatch = (uid: string) => removeLocalData(profilePatchKey(uid));

const progressDateToIso = (value: unknown) => {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  if (typeof value === "object" && value !== null) {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === "function") {
      const parsed = timestamp.toDate();
      return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }
    if (typeof timestamp.seconds === "number") {
      const parsed = new Date(timestamp.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }
  }
  return undefined;
};

const finiteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildTrustedProgressPatch = (data: Record<string, unknown>): Partial<UserProfile> => {
  const xp = finiteNumber(data.xp);
  const level = finiteNumber(data.level) || (xp !== undefined ? calculateLevel(xp) : undefined);
  const lastActive = progressDateToIso(data.lastActive);
  const lastStudySessionAt = progressDateToIso(data.lastStudySessionAt);
  const rawStreak = finiteNumber(data.streak);
  const totalStudySeconds = finiteNumber(data.totalStudySeconds);
  const patch: Partial<UserProfile> = {};

  if (xp !== undefined) patch.xp = xp;
  if (level !== undefined) patch.level = level;
  if (typeof data.levelName === "string") patch.levelName = data.levelName;
  else if (xp !== undefined) patch.levelName = calculateLevelName(xp);
  if (rawStreak !== undefined) patch.streak = getCurrentStreak(rawStreak, lastActive);
  if (lastActive) patch.lastActive = lastActive;
  if (lastStudySessionAt) patch.lastStudySessionAt = lastStudySessionAt;
  if (totalStudySeconds !== undefined) patch.totalStudySeconds = totalStudySeconds;
  if (data.xpAwarded && typeof data.xpAwarded === "object") {
    patch.xpAwarded = data.xpAwarded as Record<string, boolean>;
  }

  return patch;
};

const withCurrentProgressDisplay = (profile: UserProfile): UserProfile => ({
  ...profile,
  level: profile.level || calculateLevel(profile.xp || 0),
  levelName: profile.levelName || calculateLevelName(profile.xp || 0),
  streak: getCurrentStreak(profile.streak || 0, profile.lastActive),
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  useOfflineSyncQueue(user?.uid);

  const saveProfilePatch = (uid: string, patch: Partial<UserProfile>) => {
    const safePatch = filterClientProfilePatch(patch);
    if (Object.keys(safePatch).length === 0) return;

    const key = profilePatchKey(uid);
    const currentPatch = loadLocalData<Partial<UserProfile>>(key, {});
    saveLocalData(key, { ...filterClientProfilePatch(currentPatch), ...safePatch, uid });
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let unsubscribeTrustedProgress: (() => void) | undefined;
    let unsubscribeAuth: (() => void) | undefined;
    let isDisposed = false;
    let accountRevision = 0;
    let latestBaseProfile: UserProfile | null = null;
    let latestTrustedProgress: Partial<UserProfile> = {};
    let latestResolvedAdmin = false;

    let loadTimer: ReturnType<typeof setTimeout>;
    const deadline = () => {
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => {
        if (isDisposed) return;
        const current = auth.currentUser;
        const cached = current ? loadLocalData<UserProfile | null>(profileCacheKey(current.uid), null) : null;
        if (cached) { latestBaseProfile = cached; latestResolvedAdmin = false; publishProfile(); }
        else setAuthError("timeout");
        setLoading(false);
        console.error("Auth/profile initialization timed out");
      }, 15000);
    };
    const publishProfile = () => {
      if (!latestBaseProfile) return;
      clearTimeout(loadTimer);
      setProfile(
        withCurrentProgressDisplay({
          ...withLocalProfilePatch(latestBaseProfile),
          ...latestTrustedProgress,
          isAdmin: latestResolvedAdmin,
        })
      );
      setIsAdmin(latestResolvedAdmin);
    };

    deadline();
    withDeadline(authPersistenceReady, 10000).catch(error => console.error("Auth persistence deadline", error)).finally(() => {
      if (isDisposed) return;

      unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      const revision = ++accountRevision;
      unsubscribeProfile?.();
      unsubscribeTrustedProgress?.();
      unsubscribeProfile = undefined;
      unsubscribeTrustedProgress = undefined;
      latestBaseProfile = null;
      latestTrustedProgress = {};
      latestResolvedAdmin = false;
      deadline();
      setUser(firebaseUser);
      setAuthError("");
      setProfile(null);
      setIsAdmin(false);
      setLoading(Boolean(firebaseUser));

      if (!firebaseUser) {
        clearTimeout(loadTimer);
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      let backend;
      try {
        backend = await withDeadline(Promise.all([
          import("firebase/firestore"),
          import("@/src/lib/firebase"),
        ]), 10000);
      } catch (error) {
        if (isDisposed || revision !== accountRevision) return;
        clearTimeout(loadTimer);
        setAuthError(getAccountErrorCode(error));
        setLoading(false);
        return;
      }
      if (isDisposed || revision !== accountRevision || auth.currentUser?.uid !== firebaseUser.uid) return;
      const [{ doc, onSnapshot, runTransaction }, { db }] = backend;
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const trustedProgressRef = doc(db, "users", firebaseUser.uid, "trusted", "progress");

      unsubscribeTrustedProgress = onSnapshot(
        trustedProgressRef,
        (snapshot) => {
          if (isDisposed || revision !== accountRevision || auth.currentUser?.uid !== firebaseUser.uid) return;
          latestTrustedProgress = snapshot.exists()
            ? buildTrustedProgressPatch(snapshot.data() as Record<string, unknown>)
            : {};
          publishProfile();
        },
        (error) => {
          console.warn("Trusted progress listener failed", error);
        }
      );

      unsubscribeProfile = onSnapshot(
        userDocRef,
        async (snapshot) => {
          if (isDisposed || revision !== accountRevision || auth.currentUser?.uid !== firebaseUser.uid) return;
          if (snapshot.exists()) {
            setAuthError("");
            const rawProfile = snapshot.data() as UserProfile;
            const profileData = { ...rawProfile, displayName: rawProfile.displayName || firebaseUser.displayName || "" };
            const queued = getQueuedOperation("update", ["users", firebaseUser.uid]);
            if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && (!queued || queued.status === "synced")) clearLocalProfilePatch(firebaseUser.uid);
            saveLocalData(profileCacheKey(firebaseUser.uid), profileData);
            latestBaseProfile = profileData;
            latestResolvedAdmin = Boolean(profileData.isAdmin);
            publishProfile();

            setLoading(false);
            return;
          }

          const cached = loadLocalData<UserProfile | null>(profileCacheKey(firebaseUser.uid), null);
          if (cached && snapshot.metadata.fromCache && !navigator.onLine) {
            latestBaseProfile = cached;
            latestResolvedAdmin = false;
            publishProfile();
            setLoading(false);
            return;
          }
          await withDeadline(firebaseUser.reload(), 10000).catch(error => console.warn("Auth user refresh failed", error));
          if (isDisposed || revision !== accountRevision || auth.currentUser?.uid !== firebaseUser.uid) return;
          const newProfile = createInitialProfile(firebaseUser);
          const resolvedProfile = await withDeadline(runTransaction(db, async (transaction) => {
            const existing = await transaction.get(userDocRef);
            if (existing.exists()) return existing.data() as UserProfile;
            if (isReadOnlyAudit) throw new Error("Create profiles outside read-only audit mode.");
            transaction.set(userDocRef, newProfile);
            return newProfile;
          }), 15000).catch((error) => {
            if (isDisposed || revision !== accountRevision || auth.currentUser?.uid !== firebaseUser.uid) return null;
            console.error("Profile bootstrap failed", error);
            setAuthError(getAccountErrorCode(error));
            return cached;
          });
          if (isDisposed || revision !== accountRevision || auth.currentUser?.uid !== firebaseUser.uid) return;
          latestBaseProfile = resolvedProfile;
          latestResolvedAdmin = Boolean(resolvedProfile?.isAdmin);
          publishProfile();
          setLoading(false);
        },
        (error) => {
          if (isDisposed || revision !== accountRevision || auth.currentUser?.uid !== firebaseUser.uid) return;
          console.warn("Cloud profile listener failed", error);
          const cached = loadLocalData<UserProfile | null>(profileCacheKey(firebaseUser.uid), null);
          if (!cached || error.code === "permission-denied") setAuthError(getAccountErrorCode(error));
          latestBaseProfile = withLocalProfilePatch(cached || createInitialProfile(firebaseUser));
          latestResolvedAdmin = false;
          publishProfile();
          setLoading(false);
        }
      );

      });
    });

    return () => {
      isDisposed = true;
      clearTimeout(loadTimer);
      unsubscribeProfile?.();
      unsubscribeTrustedProgress?.();
      unsubscribeAuth?.();
    };
  }, []);

  const signOut = () => auth.signOut();

  // Migrate missing/legacy defaults once and keep the choice in the profile.
  // Custom uploads and provider photos are preserved by the resolver.
  useEffect(() => {
    if (!profile || !user || isReadOnlyAudit) return;
    const photoURL = getProfileAvatar(profile);
    if (photoURL === profile.photoURL) return;
    updateLocalProfile({ photoURL });
    void writeDocWithQueue({ userId: user.uid, path: ['users', user.uid], kind: 'update', data: { photoURL } })
      .catch(error => console.warn('Default avatar sync pending', error));
  }, [user?.uid, profile?.photoURL, profile?.subscription]);

  const updateLocalProfile = (patch: Partial<UserProfile>) => {
    if (!user) return;

    saveProfilePatch(user.uid, patch);
    const safePatch = filterClientProfilePatch(patch);
    setProfile((currentProfile) => (currentProfile ? { ...currentProfile, ...safePatch } : currentProfile));
  };

  const completeOnboarding = async (answers: { mainGoal: string; userType: string; struggle: string }) => {
    if (!user || auth.currentUser?.uid !== user.uid) throw new Error('Sign in to finish setup.');
    if (isReadOnlyAudit) throw new Error('Setup cannot be saved in read-only mode.');
    if (!validOnboardingAnswers(answers)) throw new Error('Complete every setup question.');
    const uid = user.uid;
    const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('@/src/lib/firebase');
    const ref = doc(db, 'users', uid);
    // A transaction needs the server. Offline/failed writes must never unlock
    // the dashboard or be mistaken for completed onboarding in local storage.
    const persist = (legacy = false) => runTransaction(db, async transaction => {
      if (auth.currentUser?.uid !== uid) throw new Error('Account changed during setup.');
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('Profile is unavailable. Please retry.');
      const current = snapshot.data() as UserProfile;
      if (hasCompletedOnboarding(current)) return current;
      // Older deployed rules accept the original profile fields only. Do not
      // override an explicit completion flag with the legacy schema.
      if (legacy && current.onboardingCompleted !== undefined) throw new Error('Profile setup rules need updating.');
      const patch = legacy ? legacyOnboardingProfilePatch(answers) : onboardingProfilePatch(answers, serverTimestamp());
      transaction.update(ref, patch);
      return { ...current, ...patch } as UserProfile;
    });
    let saved: UserProfile;
    try { saved = await persist(); }
    catch (error) {
      if ((error as { code?: string })?.code !== 'permission-denied') throw error;
      saved = await persist(true);
    }
    if (auth.currentUser?.uid !== uid) return;
    clearLocalProfilePatch(uid);
    setProfile(current => current?.uid === uid ? { ...current, ...saved } : current);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError, isAdmin, signOut, completeOnboarding, updateLocalProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
