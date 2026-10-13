import type { AppLocale } from "@/src/contexts/LocaleContext";

const copy = {
  en: {
    auth: "Sign in again to create an activity.",
    quota: "Your AI usage limit has been reached. Wait for it to reset before trying again.",
    timeout: "Creating the activity took too long. Try again; your plan is unchanged.",
    invalid: "The generated activity was incomplete or invalid. Try creating it again.",
    unknown: "Could not create this activity. Check your connection and try again; your plan is unchanged.",
  },
  uz: {
    auth: "Mashq yaratish uchun hisobga qayta kiring.",
    quota: "AI foydalanish limitingiz tugadi. Qayta urinishdan oldin limit yangilanishini kuting.",
    timeout: "Mashq yaratish juda uzoq davom etdi. Qayta urinib ko‘ring; rejangiz o‘zgarmagan.",
    invalid: "Yaratilgan mashq to‘liq emas yoki noto‘g‘ri. Uni qayta yaratib ko‘ring.",
    unknown: "Mashqni yaratib bo‘lmadi. Ulanishni tekshirib, qayta urinib ko‘ring; rejangiz o‘zgarmagan.",
  },
  ru: {
    auth: "Войдите в аккаунт снова, чтобы создать упражнение.",
    quota: "Лимит использования AI исчерпан. Дождитесь его обновления перед повторной попыткой.",
    timeout: "Создание упражнения заняло слишком много времени. Повторите попытку; план не изменён.",
    invalid: "Созданное упражнение неполное или некорректное. Попробуйте создать его снова.",
    unknown: "Не удалось создать упражнение. Проверьте соединение и повторите попытку; план не изменён.",
  },
};

export type PlannerActivityErrorKind = keyof typeof copy.en;

export const classifyPlannerActivityError = (error: unknown): PlannerActivityErrorKind => {
  const record = typeof error === "object" && error ? error as { code?: unknown; message?: unknown } : {};
  const diagnostic = `${String(record.code || "")} ${String(record.message || "")}`;
  const kind = /unauthenticated|sign in|signed in/i.test(diagnostic) ? "auth"
    : /resource-exhausted|daily.limit|usage.limit|quota|allowance/i.test(diagnostic) ? "quota"
    : /deadline|timeout|timed out|took too long/i.test(diagnostic) ? "timeout"
    : /invalid|malformed|incomplete|empty|JSON/i.test(diagnostic) ? "invalid"
    : "unknown";
  return kind;
};

export const getPlannerActivityErrorMessage = (kind: PlannerActivityErrorKind, locale: AppLocale) => copy[locale][kind];

export const getPlannerActivityError = (error: unknown, locale: AppLocale) =>
  getPlannerActivityErrorMessage(classifyPlannerActivityError(error), locale);
