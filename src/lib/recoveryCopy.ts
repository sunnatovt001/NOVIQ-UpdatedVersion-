const COPY = {
  en: {
    title: "This page could not be loaded",
    retryHelp: "Check your connection and try again. Your saved data is unchanged.",
    reloadHelp: "Please reload to return to your workspace.",
    retry: "Retry page",
    reloadApp: "Reload app",
    reloadPage: "Reload page",
    loading: "Loading page…",
  },
  uz: {
    title: "Sahifani yuklab bo‘lmadi",
    retryHelp: "Aloqani tekshiring va qayta urinib ko‘ring. Saqlangan ma’lumotlaringiz o‘zgarmagan.",
    reloadHelp: "Ish maydoniga qaytish uchun sahifani qayta yuklang.",
    retry: "Qayta urinish",
    reloadApp: "Ilovani qayta yuklash",
    reloadPage: "Sahifani qayta yuklash",
    loading: "Sahifa yuklanmoqda…",
  },
  ru: {
    title: "Не удалось загрузить страницу",
    retryHelp: "Проверьте соединение и попробуйте снова. Сохранённые данные не изменились.",
    reloadHelp: "Перезагрузите страницу, чтобы вернуться в рабочее пространство.",
    retry: "Повторить",
    reloadApp: "Перезагрузить приложение",
    reloadPage: "Перезагрузить страницу",
    loading: "Загрузка страницы…",
  },
};

// Recovery also runs outside LocaleProvider when the app itself crashes.
export const getRecoveryCopy = () => {
  let locale = typeof document === "undefined" ? "en" : document.documentElement.lang;
  try { locale = window.localStorage.getItem("noviq-locale") || locale; } catch { /* Storage may be unavailable. */ }
  return COPY[locale === "uz" || locale === "ru" ? locale : "en"];
};
