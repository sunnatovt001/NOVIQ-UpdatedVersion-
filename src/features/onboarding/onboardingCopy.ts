import type { AppLocale } from "@/src/contexts/LocaleContext";

const en = {
  setup: "Noviq setup", profile: "Academic exam profile",
  title: "Answer a few quick questions",
  description: "Choose one answer for each step. Noviq builds your exam preparation workspace automatically.",
  step: "Step {current} of {total}", opening: "Opening dashboard", moving: "Moving to next question",
  select: "Select one answer", failed: "Profile setup failed. Please try again.",
  eyebrows: ["Goal", "Profile", "Challenge"],
  titles: ["What's your main goal?", "What best describes you?", "What do you struggle with most?"],
  options: [
    ["Prepare for IELTS", "Prepare for SAT", "Prepare for HSK", "Reach a CEFR level", "Improve school grades", "Prepare for university entrance", "Stay consistent with exam prep"],
    ["High school student", "University student", "IELTS learner", "SAT learner", "HSK learner", "CEFR learner", "University entrance candidate"],
    ["Staying consistent", "Procrastination", "Distractions", "Organizing study materials", "Time management", "Remembering information", "Exam anxiety"],
  ],
};
type OnboardingCopy = typeof en;
const copies: Record<AppLocale, OnboardingCopy> = {
  en,
  uz: {
    setup: "Noviq sozlamalari", profile: "O‘qish va imtihon profili",
    title: "Bir nechta qisqa savolga javob bering",
    description: "Har bosqichda bitta javob tanlang. Noviq imtihonga tayyorgarlik muhitingizni avtomatik sozlaydi.",
    step: "{total} bosqichdan {current}-bosqich", opening: "Bosh sahifa ochilmoqda", moving: "Keyingi savolga o‘tilmoqda",
    select: "Bitta javob tanlang", failed: "Profilni sozlab bo‘lmadi. Qayta urinib ko‘ring.",
    eyebrows: ["Maqsad", "Profil", "Qiyinchilik"],
    titles: ["Asosiy maqsadingiz nima?", "Sizga qaysi ta’rif mos keladi?", "Sizga eng ko‘p nima qiyinchilik tug‘diradi?"],
    options: [
      ["IELTSga tayyorlanish", "SATga tayyorlanish", "HSKga tayyorlanish", "CEFR darajasiga erishish", "Maktab baholarini yaxshilash", "Universitetga kirishga tayyorlanish", "Imtihonga muntazam tayyorlanish"],
      ["Maktab o‘quvchisi", "Universitet talabasi", "IELTS o‘rganuvchisi", "SAT o‘rganuvchisi", "HSK o‘rganuvchisi", "CEFR o‘rganuvchisi", "Universitetga kirish abituriyenti"],
      ["Muntazam o‘qish", "Ishlarni keyinga qoldirish", "Chalg‘ish", "O‘quv materiallarini tartiblash", "Vaqtni boshqarish", "Ma’lumotni eslab qolish", "Imtihon xavotiri"],
    ],
  },
  ru: {
    setup: "Настройка Noviq", profile: "Учебный и экзаменационный профиль",
    title: "Ответьте на несколько коротких вопросов",
    description: "Выберите один ответ на каждом шаге. Noviq автоматически настроит пространство для подготовки к экзаменам.",
    step: "Шаг {current} из {total}", opening: "Открываем главную страницу", moving: "Переходим к следующему вопросу",
    select: "Выберите один ответ", failed: "Не удалось настроить профиль. Попробуйте снова.",
    eyebrows: ["Цель", "Профиль", "Трудности"],
    titles: ["Какова ваша главная цель?", "Какое описание вам подходит?", "Что вызывает больше всего трудностей?"],
    options: [
      ["Подготовка к IELTS", "Подготовка к SAT", "Подготовка к HSK", "Достижение уровня CEFR", "Улучшение школьных оценок", "Подготовка к поступлению в университет", "Регулярная подготовка к экзаменам"],
      ["Школьник", "Студент университета", "Изучаю IELTS", "Изучаю SAT", "Изучаю HSK", "Изучаю CEFR", "Абитуриент"],
      ["Регулярность занятий", "Прокрастинация", "Отвлекающие факторы", "Организация учебных материалов", "Управление временем", "Запоминание информации", "Тревога перед экзаменами"],
    ],
  },
};

export const getOnboardingCopy = (locale: AppLocale) => copies[locale];
// Stored values remain stable: existing Planner/profile logic consumes these English values.
export const onboardingOptionValue = (question: number, option: number) => en.options[question][option];
export const onboardingOptionLabel = (locale: AppLocale, question: number, value: string) => {
  const index = en.options[question].indexOf(value);
  return index < 0 ? value : copies[locale].options[question][index];
};
