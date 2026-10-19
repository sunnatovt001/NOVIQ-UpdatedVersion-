export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt?: string;
  isAdmin?: boolean;
  onboarded: boolean;
  onboardingAnswers?: {
    mainGoal?: string;
    userType?: string;
    struggle?: string;
  };
  goals: string[];
  currentLevel: string;
  dailyTargetMinutes: number;
  xp: number;
  level: number;
  levelName?: string;
  streak: number;
  lastActive: string;
  lastStudySessionAt?: string;
  totalStudySeconds?: number;
  xpAwarded?: Record<string, boolean>;
  telegramId?: string;
  showActionButtons?: boolean;
  subscription?: SubscriptionState;
  usage?: UserUsageState;
  settings?: UserSettings;
}

export type SubscriptionPlan = "free" | "pro";
export type BillingCycle = "monthly" | "yearly";
export type PaymentProvider =
  | "click"
  | "payme"
  | "card";

export interface SubscriptionState {
  trialUsed?: boolean;
  trialStartedAt?: string;
  trialEndsAt?: string;
  autoRenew?: boolean;
  plan: SubscriptionPlan;
  status: "active" | "trialing" | "past_due" | "canceled" | "inactive" | "expired";
  billingCycle?: BillingCycle;
  provider?: PaymentProvider;
  startedAt?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  checkoutId?: string;
}

export interface UserUsageState {
  aiTutor?: Record<string, number>;
  aiQuiz?: Record<string, number>;
  aiFlashcards?: Record<string, number>;
}

export interface UserSettings {
  preferredPaymentProvider?: PaymentProvider;
  proNudgeDismissedAt?: string;
  notifications?: {
    studyReminders?: boolean;
    dailyStreakSummary?: boolean;
    aiSourcePreviews?: boolean;
  };
}

export interface StudyPlan {
  id: string;
  userId: string;
  goal: string;
  targetDate: string;
  roadmap: RoadmapDay[];
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
}

export interface RoadmapDay {
  day: number;
  title: string;
  tasks: string[];
  completed: boolean;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  subject: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  userId: string;
  deckId: string;
  front: string;
  back: string;
  nextReview: string;
  easeFactor: number;
  interval: number;
  repetition: number;
}

export interface StudySession {
  id: string;
  userId: string;
  duration: number; // in seconds
  subject: string;
  category: 'focus' | 'revision' | 'quiz';
  xpEarned: number;
  timestamp: string;
}

export interface CommunityMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  roomId: string;
  timestamp: string;
}
