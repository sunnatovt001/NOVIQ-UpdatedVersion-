export type ExamMode =
  | "ielts"
  | "sat"
  | "hsk"
  | "cefr"
  | "school"
  | "entrance";

export type EnergyProfile = "morning" | "balanced" | "night";
export type PlannerView = "today" | "roadmap" | "activity";
export type TaskKind = "quiz" | "writing" | "speaking" | "flashcards" | "timed";

export type PlannerForm = {
  mode: ExamMode;
  goal: string;
  currentScore: string;
  targetScore: string;
  examDate: string;
  hoursPerDay: string;
  daysPerWeek: string;
  energyProfile: EnergyProfile;
  schoolSubject: string;
  weakTopics: string;
  sectionScores: Record<string, string>;
};

export type FocusSection = {
  name: string;
  current: number;
  target: number;
  gap: number;
  weight: number;
};

export type MissionTask = {
  id: string;
  label: string;
  minutes: number;
  xp: number;
  section: string;
  kind: TaskKind;
  difficulty: "foundation" | "improving" | "advanced";
  focusReason: string;
  scheduledWindow: string;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  weaknessTag: string;
};

export type FlashcardItem = {
  id: string;
  front: string;
  back: string;
  weaknessTag: string;
};

export type GeneratedActivity = {
  origin?: "ai";
  taskId: string;
  type: TaskKind;
  title: string;
  instructions: string;
  difficulty: MissionTask["difficulty"];
  generatedAt: string;
  successCriteria: string[];
  questions?: QuizQuestion[];
  writingPrompt?: string;
  speakingPrompt?: string;
  flashcards?: FlashcardItem[];
  minWords?: number;
};

export type TaskProgress = {
  status: "notStarted" | "inProgress" | "completed";
  elapsedSeconds: number;
  quizAnswers: Record<string, number>;
  reviewedCards: string[];
  writingText: string;
  speakingNotes: string;
  submitted: boolean;
  score?: number;
  mistakes: string[];
  completedAt?: string;
  xpAwarded?: number;
};

export type WeaknessEvent = {
  id: string;
  tag: string;
  section: string;
  source: string;
  createdAt: string;
  severity: number;
};

export type CompletedTaskRecord = {
  id: string;
  dateKey: string;
  taskId: string;
  section: string;
  kind: TaskKind;
  minutes: number;
  xp: number;
  score?: number;
  mistakes: string[];
  completedAt: string;
};

export type PlannerAchievement = {
  id: string;
  title: string;
  description: string;
  unlockedAt: string;
};

export type DailyReflection = {
  tasksCompleted: number;
  minutesStudied: number;
  xpEarned: number;
  strongestArea: string;
  needsImprovement: string;
  recommendation: string;
};

export type PlannerDailyStats = {
  dateKey: string;
  xpEarned: number;
  minutesStudied: number;
  missionCompleted: boolean;
  dailyStreak: number;
  missedDays: number;
  reflection?: DailyReflection;
};

export type RecoveryMode = {
  active: boolean;
  missedDays: number;
  message: string;
  messageLocale?: "en" | "uz" | "ru";
  adjustedAt: string;
};

export type PlannerState = {
  form: PlannerForm;
  missionDate: string;
  tasks: MissionTask[];
  taskProgress: Record<string, TaskProgress>;
  activities: Record<string, GeneratedActivity>;
  weaknesses: WeaknessEvent[];
  history: CompletedTaskRecord[];
  achievements: PlannerAchievement[];
  daily: PlannerDailyStats;
  recoveryMode?: RecoveryMode;
  localXp: number;
  lastOpenedDate: string;
  lastPlanKey: string;
};

export type Celebration = {
  type: "task" | "mission";
  title: string;
  subtitle: string;
  xp: number;
  bonusXp?: number;
};
