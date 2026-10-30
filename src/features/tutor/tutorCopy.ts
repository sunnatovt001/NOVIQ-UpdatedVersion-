export type TutorLanguage = "en-US" | "uz-UZ" | "ru-RU";

export const TUTOR_LANGUAGE_OPTIONS: Array<{
  value: TutorLanguage;
  label: string;
}> = [
  { value: "en-US", label: "English" },
  { value: "uz-UZ", label: "O‘zbekcha" },
  { value: "ru-RU", label: "Русский" },
];

const TUTOR_INTRO: Record<TutorLanguage, string> = {
  "en-US":
    "Ask a question or upload study material. I’ll tailor the explanation to your subject, exam and level.",
  "uz-UZ":
    "Savolingizni yozing yoki o‘quv materialini yuklang. Tushuntirishni faningiz, imtihoningiz va darajangizga moslayman.",
  "ru-RU":
    "Задайте вопрос или загрузите учебный материал. Я адаптирую объяснение к вашему предмету, экзамену и уровню.",
};

export const getTutorIntro = (language: TutorLanguage) =>
  TUTOR_INTRO[language];
