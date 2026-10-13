import type { AppLocale } from "@/src/contexts/LocaleContext";
const en = {
  preparing: "Preparing your workspace", profileLoading: "Loading your profile",
  accountTitle: "Account access needs attention", retry: "Try again",
  invitation: "You have a friend invitation. Sign in with the invited email address to accept it.",
};
type Copy = {[K in keyof typeof en]: string};
const copies: Record<AppLocale, Copy> = {en,
  uz: {
    preparing: "O‘quv muhitingiz tayyorlanmoqda", profileLoading: "Profilingiz yuklanmoqda",
    accountTitle: "Hisobga kirishda muammo bor", retry: "Qayta urinish",
    invitation: "Sizga do‘stlik taklifi kelgan. Qabul qilish uchun taklif yuborilgan email bilan kiring.",
  },
  ru: {
    preparing: "Подготавливаем учебное пространство", profileLoading: "Загружаем профиль",
    accountTitle: "Проблема с доступом к аккаунту", retry: "Попробовать снова",
    invitation: "У вас есть приглашение в друзья. Войдите с приглашённым адресом email, чтобы принять его.",
  },
};
export const getAppCopy = (locale: AppLocale) => copies[locale];
