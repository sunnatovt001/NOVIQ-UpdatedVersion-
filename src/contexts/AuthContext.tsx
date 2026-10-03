import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import { auth, authPersistenceReady, db } from "@/src/lib/firebase";
import { UserProfile } from "@/src/types";
import { getAppErrorMessage } from "@/src/lib/errors";
import { loadLocalData, removeLocalData, saveLocalData } from "@/src/lib/localStore";
import { calculateLevel, calculateLevelName, createInitialXpState, getCurrentStreak } from "@/src/lib/progress";
import { getDefaultSubscription } from "@/src/lib/subscription";
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
    let latestBaseProfile: UserProfile | null = null;
    let latestTrustedProgress: Partial<UserProfile> = {};
    let latestResolvedAdmin = false;

    const publishProfile = () => {
      if (!latestBaseProfile) return;
      setProfile(
        withCurrentProgressDisplay({
          ...withLocalProfilePatch(latestBaseProfile),
          ...latestTrustedProgress,
          isAdmin: latestResolvedAdmin,
        })
      );
      setIsAdmin(latestResolvedAdmin);
    };

    authPersistenceReady.finally(() => {
      if (isDisposed) return;

      unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribeProfile?.();
      unsubscribeTrustedProgress?.();
      unsubscribeProfile = undefined;
      unsubscribeTrustedProgress = undefined;
      latestBaseProfile = null;
      latestTrustedProgress = {};
      latestResolvedAdmin = false;
      setUser(firebaseUser);
      setAuthError("");

      if (!firebaseUser) {
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const userDocRef = doc(db, "users", firebaseUser.uid);
      const trustedProgressRef = doc(db, "users", firebaseUser.uid, "trusted", "progress");

      unsubscribeTrustedProgress = onSnapshot(
        trustedProgressRef,
        (snapshot) => {
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
          if (snapshot.exists()) {
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
          await firebaseUser.reload().catch(() => undefined);
          if (isDisposed || auth.currentUser?.uid !== firebaseUser.uid) return;
          const newProfile = createInitialProfile(firebaseUser);
          await runTransaction(db, async (transaction) => {
            const existing = await transaction.get(userDocRef);
            if (!existing.exists()) transaction.set(userDocRef, newProfile);
          }).catch((error) => {
            setAuthError(getAppErrorMessage(error));
          });
          if (isDisposed || auth.currentUser?.uid !== firebaseUser.uid) return;
          latestBaseProfile = newProfile;
          latestResolvedAdmin = false;
          publishProfile();
          setLoading(false);
        },
        (error) => {
          console.warn("Cloud profile listener failed", error);
          const cached = loadLocalData<UserProfile | null>(profileCacheKey(firebaseUser.uid), null);
          if (!cached || error.code === "permission-denied") setAuthError(getAppErrorMessage(error));
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
      unsubscribeProfile?.();
      unsubscribeTrustedProgress?.();
      unsubscribeAuth?.();
    };
  }, []);

  const signOut = () => auth.signOut();

  const updateLocalProfile = (patch: Partial<UserProfile>) => {
    if (!user) return;

    saveProfilePatch(user.uid, patch);
    const safePatch = filterClientProfilePatch(patch);
    setProfile((currentProfile) => (currentProfile ? { ...currentProfile, ...safePatch } : currentProfile));
  };

  const completeOnboarding = async (answers: { mainGoal: string; userType: string; struggle: string }) => {
    if (!user) return;

    const onboardingPatch = {
      onboarded: true,
      onboardingAnswers: answers,
      goals: [answers.mainGoal],
      currentLevel: "Beginner",
      dailyTargetMinutes: 30,
    };
    updateLocalProfile(onboardingPatch);

    const status = await writeDocWithQueue({ userId: user.uid, path: ["users", user.uid], kind: "update", data: onboardingPatch });
    if (status === "synced") clearLocalProfilePatch(user.uid);

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
