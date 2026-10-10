import type { AppLocale } from "@/src/contexts/LocaleContext";

const COPY: Record<AppLocale, {
  close: string;
  defaultTitle: string;
  defaultMessage: string;
  tutorTitle: string;
  tutorMessage: string;
  includes: string;
  upgrade: string;
  keepFree: string;
}> = {
  en: {
    close: "Close upgrade prompt",
    defaultTitle: "You have reached today's free limit",
    defaultMessage: "Upgrade to Noviq Pro for higher limits and deeper exam support.",
    tutorTitle: "You have used today's free AI tutor messages.",
    tutorMessage: "Upgrade to Pro for a higher daily AI allowance and advanced exam assistance.",
    includes: "Pro includes higher Noviq Tutor limits, AI writing and speaking evaluation, weak-area analysis, and advanced analytics.",
    upgrade: "Upgrade to Pro",
    keepFree: "Keep Free",
  },
  uz: {
    close: "Pro taklifini yopish",
    defaultTitle: "Bugungi bepul limitga yetdingiz",
    defaultMessage: "Yuqoriroq limitlar va chuqurroq imtihon yordami uchun Noviq Pro’ga o‘ting.",
    tutorTitle: "Bugungi bepul AI tutor xabarlarini ishlatib bo‘ldingiz.",
    tutorMessage: "Yuqoriroq kunlik AI limiti va rivojlangan imtihon yordami uchun Pro’ga o‘ting.",
    includes: "Pro yuqoriroq Noviq Tutor limitlari, AI yozuv va nutq baholashi, zaif mavzular tahlili hamda rivojlangan analitikani o‘z ichiga oladi.",
    upgrade: "Pro’ga o‘tish",
    keepFree: "Bepul qolish",
  },
  ru: {
    close: "Закрыть предложение Pro",
    defaultTitle: "Бесплатный лимит на сегодня исчерпан",
    defaultMessage: "Перейдите на Noviq Pro для повышенных лимитов и расширенной помощи с экзаменами.",
    tutorTitle: "Бесплатные сообщения AI-тьютору на сегодня закончились.",
    tutorMessage: "Перейдите на Pro для повышенного дневного лимита AI и расширенной помощи с экзаменами.",
    includes: "Pro включает повышенные лимиты Noviq Tutor, AI-оценку письма и речи, анализ слабых тем и расширенную аналитику.",
    upgrade: "Перейти на Pro",
    keepFree: "Остаться на Free",
  },
};

export const getUpgradeCopy = (locale: AppLocale) => COPY[locale];
