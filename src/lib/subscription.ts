import { getLocalDayKey } from "@/src/lib/progressMath";
import { loadLocalData, makeSyncId, saveLocalData } from "@/src/lib/localStore";
import { writeDocWithQueue } from "@/src/lib/offlineSync";
import type {
  BillingCycle,
  PaymentProvider,
  SubscriptionState,
  UserProfile,
} from "@/src/types";

export const PRO_PRICING = {
  monthly: {
    amount: 39000,
    label: "39,000 UZS / month",
  },
  yearly: {
    amount: 299000,
    label: "299,000 UZS / year",
  },
} as const;

export const FREE_LIMITS = {
  aiTutorMessagesPerDay: 5,
  aiGeneratedQuizzesPerDay: 2,
  aiFlashcardGenerationsPerDay: 2,
} as const;

export const FREE_FEATURES = [
  "Exam Planner",
  "Daily Exam Missions",
  "XP System",
  "Streak System",
  "Progress Tracking",
  "Basic Exam Flashcards",
  "Basic Exam Quizzes",
  "Limited Noviq Tutor",
  "Daily Exam Analytics",
];

export const PRO_FEATURES = [
  "Unlimited Noviq Tutor",
  "Unlimited Exam Quizzes",
  "Unlimited Exam Flashcards",
  "AI Writing Evaluation",
  "AI Speaking Evaluation",
  "Weakness Intelligence",
  "Success Probability Engine",
  "Dynamic AI Roadmap",
  "Recovery Mode",
  "Advanced Analytics",
  "Priority AI Exam Processing",
  "Faster Exam Responses",
];

export const PAYMENT_METHODS: {
  id: PaymentProvider;
  label: string;
  region: "Uzbekistan" | "International";
}[] = [
  { id: "click", label: "Click", region: "Uzbekistan" },
  { id: "payme", label: "Payme", region: "Uzbekistan" },
  { id: "card", label: "Visa / Mastercard", region: "International" },
];

export const getDefaultSubscription = (): SubscriptionState => ({
  plan: "free",
  status: "active",
});

export const getSubscription = (
  profile?: UserProfile | null,
): SubscriptionState => profile?.subscription || getDefaultSubscription();

export const isPro = (profile?: UserProfile | null) => {
  const subscription = getSubscription(profile);
  if (subscription.plan !== "pro") return false;
  if (!["active", "trialing"].includes(subscription.status)) return false;
  if (!subscription.currentPeriodEnd) return false;
  return new Date(subscription.currentPeriodEnd).getTime() > Date.now();
};

export const getPlanLabel = (profile?: UserProfile | null) =>
  isPro(profile) ? "Noviq Pro" : "Free Plan";

const addBillingPeriod = (cycle: BillingCycle, from = new Date()) => {
  const next = new Date(from);
  if (cycle === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
};

export const buildProSubscription = (
  billingCycle: BillingCycle,
  provider: PaymentProvider,
  checkoutId?: string,
): SubscriptionState => {
  const startedAt = new Date();
  return {
    plan: "pro",
    status: "active",
    billingCycle,
    provider,
    startedAt: startedAt.toISOString(),
    currentPeriodEnd: addBillingPeriod(billingCycle, startedAt).toISOString(),
    cancelAtPeriodEnd: false,
    checkoutId,
  };
};

export const buildCanceledSubscription = (
  subscription: SubscriptionState,
): SubscriptionState => ({
  ...subscription,
  status: subscription.currentPeriodEnd ? subscription.status : "canceled",
  cancelAtPeriodEnd: true,
});

export const usageKey = (
  userId: string,
  feature: keyof NonNullable<UserProfile["usage"]>,
  dayKey = getLocalDayKey(),
) => `noviq:${userId}:usage:${feature}:${dayKey}`;

export const getLocalDailyUsage = (
  userId: string,
  feature: keyof NonNullable<UserProfile["usage"]>,
  dayKey = getLocalDayKey(),
) => loadLocalData<number>(usageKey(userId, feature, dayKey), 0);

export const saveLocalDailyUsage = (
  userId: string,
  feature: keyof NonNullable<UserProfile["usage"]>,
  value: number,
  dayKey = getLocalDayKey(),
) => saveLocalData(usageKey(userId, feature, dayKey), value);

export const recordCheckout = async ({
  userId,
  billingCycle,
  provider,
  amount,
}: {
  userId: string;
  billingCycle: BillingCycle;
  provider: PaymentProvider;
  amount: number;
}) => {
  void userId;
  void amount; // Price is selected on the server.
  const [{ httpsCallable }, { functions }] = await Promise.all([
    import("firebase/functions"),
    import("@/src/lib/firebase"),
  ]);
  const createCheckout = httpsCallable<
    { billingCycle: BillingCycle; provider: PaymentProvider },
    { checkoutId: string; checkoutUrl: string }
  >(functions, "createSubscriptionCheckout");
  const result = await createCheckout({ billingCycle, provider });
  return result.data;
};

export const recordSubscriptionChangeRequest = async ({
  userId,
  action,
  subscription,
}: {
  userId: string;
  action: "cancel_renewal" | "update_billing";
  subscription?: SubscriptionState;
}) => {
  const requestId = makeSyncId("subscription-request");
  const syncStatus = await writeDocWithQueue({
    userId,
    path: ["users", userId, "subscriptionRequests", requestId],
    data: {
      action,
      status: "pending",
      currentPlan: subscription?.plan || "free",
      currentStatus: subscription?.status || "inactive",
      createdAt: new Date().toISOString(),
    },
    merge: true,
  });

  return { requestId, syncStatus };
};

export const persistSubscription = async (
  userId: string,
  subscription: SubscriptionState,
) => {
  console.warn("Blocked client subscription write", {
    userId,
    plan: subscription.plan,
    status: subscription.status,
  });
  throw new Error(
    "Subscription status is server-owned and requires verified payment state.",
  );
};
