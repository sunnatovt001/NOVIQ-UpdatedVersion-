import type { AppLocale } from "@/src/contexts/LocaleContext";
export type AccountErrorCode = "permission" | "upload" | "network" | "timeout" | "unknown";
export const getAccountErrorCode = (error: unknown): AccountErrorCode => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (/permission-denied|missing or insufficient permissions/i.test(`${code} ${message}`)) return "permission";
  if (/storage\/unauthorized|unauthorized/i.test(`${code} ${message}`)) return "upload";
  if (/deadline-exceeded|timeout|timed out/i.test(`${code} ${message}`)) return "timeout";
  if (/network|offline|failed to fetch|unavailable/i.test(`${code} ${message}`)) return "network";
  return "unknown";
};
const copies: Record<AppLocale, Record<AccountErrorCode, string>> = {
  en: {
    permission:"This account cannot access its saved data. Sign in again; if the problem continues, contact support.",
    upload:"This account cannot upload files. Sign in again; if the problem continues, contact support.",
    network:"Account data is temporarily unavailable. Check your internet connection and try again.",
    timeout:"Loading your account took too long. Check your connection and try again.",
    unknown:"Your account could not be loaded. Try again; if the problem continues, contact support.",
  },
  uz: {
    permission:"Bu hisob saqlangan ma’lumotlarga kira olmayapti. Qayta kiring; muammo davom etsa, yordam xizmatiga murojaat qiling.",
    upload:"Bu hisob fayl yuklay olmayapti. Qayta kiring; muammo davom etsa, yordam xizmatiga murojaat qiling.",
    network:"Hisob ma’lumotlari vaqtincha mavjud emas. Internetni tekshirib, qayta urinib ko‘ring.",
    timeout:"Hisobni yuklash vaqti tugadi. Internetni tekshirib, qayta urinib ko‘ring.",
    unknown:"Hisobingizni yuklab bo‘lmadi. Qayta urinib ko‘ring; muammo davom etsa, yordam xizmatiga murojaat qiling.",
  },
  ru: {
    permission:"Аккаунт не может получить доступ к сохранённым данным. Войдите снова; если проблема сохраняется, обратитесь в поддержку.",
    upload:"Аккаунт не может загрузить файлы. Войдите снова; если проблема сохраняется, обратитесь в поддержку.",
    network:"Данные аккаунта временно недоступны. Проверьте интернет и попробуйте снова.",
    timeout:"Время загрузки аккаунта истекло. Проверьте подключение и попробуйте снова.",
    unknown:"Не удалось загрузить аккаунт. Попробуйте снова; если проблема сохраняется, обратитесь в поддержку.",
  },
};
export const getAccountErrorMessage = (code: string, locale: AppLocale) =>
  copies[locale][Object.prototype.hasOwnProperty.call(copies[locale], code) ? code as AccountErrorCode : "unknown"];
