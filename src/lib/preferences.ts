import type { UserProfile } from "@/src/types";

export type NotificationPreferenceKey = "studyReminders" | "dailyStreakSummary" | "aiSourcePreviews";

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<NotificationPreferenceKey, boolean> = {
  studyReminders: true,
  dailyStreakSummary: true,
  aiSourcePreviews: true,
};

export const getNotificationPreferences = (profile?: Pick<UserProfile, "settings"> | null) => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  ...(profile?.settings?.notifications || {}),
});

export const isNotificationPreferenceEnabled = (
  profile: Pick<UserProfile, "settings"> | null | undefined,
  key: NotificationPreferenceKey
) => getNotificationPreferences(profile)[key] !== false;

export const getNotificationPreferenceKey = (notification: {
  id?: string;
  type?: string;
  preference?: NotificationPreferenceKey;
}): NotificationPreferenceKey | null => {
  if (notification.preference && notification.preference in DEFAULT_NOTIFICATION_PREFERENCES) {
    return notification.preference;
  }

  const id = notification.id || "";
  const type = notification.type || "";

  if (type === "streak" || id.startsWith("daily-")) return "dailyStreakSummary";
  if (type === "reminder" || type === "review" || id.startsWith("study-reminder-") || id.startsWith("deck-review-")) {
    return "studyReminders";
  }
  if (type === "ai" || id === "ai-tutor-stability-update" || id === "notebook-sources-update") {
    return "aiSourcePreviews";
  }

  return null;
};

export const shouldShowPreferenceNotification = (
  profile: Pick<UserProfile, "settings"> | null | undefined,
  notification: { id?: string; type?: string; preference?: NotificationPreferenceKey }
) => {
  const preferenceKey = getNotificationPreferenceKey(notification);
  return !preferenceKey || isNotificationPreferenceEnabled(profile, preferenceKey);
};
