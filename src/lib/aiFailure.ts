import type { AppLocale } from "@/src/contexts/LocaleContext";

const messages = {
  en: {
    configuration: "AI is not configured. Add GEMINI_API_KEY to the server environment and restart the server.",
    auth: "Sign in again before asking AI.",
    quota: "Your AI usage limit has been reached. Wait for it to reset before trying again.",
    timeout: "The AI response took too long. Try again; your question is retained.",
    invalid: "AI did not return a usable answer. Try again; your question is retained.",
    unknown: "Could not get an AI answer. Check your connection and try again; your question is retained.",
  },
  uz: {
    configuration: "AI server kaliti sozlanmagan. Server muhitiga GEMINI_API_KEY qo‘shib, serverni qayta ishga tushiring.",
    auth: "AI’dan so‘rashdan oldin hisobga qayta kiring.",
    quota: "AI foydalanish limitingiz tugadi. Qayta urinishdan oldin limit yangilanishini kuting.",
    timeout: "AI javobi juda uzoq davom etdi. Qayta urinib ko‘ring; savolingiz saqlanib turibdi.",
    invalid: "AI yaroqli javob qaytarmadi. Qayta urinib ko‘ring; savolingiz saqlanib turibdi.",
    unknown: "AI javobini olib bo‘lmadi. Ulanishni tekshirib, qayta urinib ko‘ring; savolingiz saqlanib turibdi.",
  },
  ru: {
    configuration: "AI не настроен. Добавьте GEMINI_API_KEY в окружение сервера и перезапустите сервер.",
    auth: "Войдите в аккаунт снова, прежде чем обращаться к AI.",
    quota: "Лимит использования AI исчерпан. Дождитесь его обновления перед повторной попыткой.",
    timeout: "Ответ AI занял слишком много времени. Попробуйте снова; ваш вопрос сохранён в чате.",
    invalid: "AI не вернул пригодный ответ. Попробуйте снова; ваш вопрос сохранён в чате.",
    unknown: "Не удалось получить ответ AI. Проверьте подключение и попробуйте снова; ваш вопрос сохранён в чате.",
  },
};

export type AiFailureKind = keyof typeof messages.en;
export const classifyAiFailure = (error: unknown): AiFailureKind => {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const diagnostic = `${String(record.code || "")} ${String(record.message || "")}`;
  if (/MISSING_GEMINI_API_KEY|AI_KEY_OR_PERMISSION|not configured|AI access is temporarily unavailable|API_KEY_INVALID/i.test(diagnostic)) return "configuration";
  if (/unauthenticated|sign in|signed in/i.test(diagnostic)) return "auth";
  if (/resource-exhausted|daily.limit|usage.limit|quota|allowance/i.test(diagnostic)) return "quota";
  if (/deadline|timeout|timed out|took too long/i.test(diagnostic)) return "timeout";
  if (/invalid|malformed|incomplete|empty|JSON/i.test(diagnostic)) return "invalid";
  return "unknown";
};
export const getAiFailureMessage = (kind: AiFailureKind, locale: AppLocale) => messages[locale][kind];
