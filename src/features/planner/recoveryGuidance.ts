import type { AppLocale } from "@/src/contexts/LocaleContext";
import type { RecoveryMode } from "./plannerTypes";
import { getPlannerCopy } from "./plannerCopy";

export const getRecoveryGuidance = (recovery: RecoveryMode | undefined, locale: AppLocale) => {
  const saved = recovery?.message.trim();
  return saved && recovery?.messageLocale === locale
    ? saved
    : getPlannerCopy(locale).recoveryGuidance;
};
