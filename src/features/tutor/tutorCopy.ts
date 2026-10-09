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
    "Hello!\nI’m Saidamin, your Noviq Tutor. I’ll help you improve for IELTS, SAT, HSK, CEFR, school subjects, or university entrance exams.\nAsk a question or upload study material. I’ll connect the answer to your goal, level, and mistakes.",
  "uz-UZ":
    "Assalomu alaykum!\nMen Saidamin, Noviq Tutorman. IELTS, SAT, HSK, CEFR, maktab fanlari yoki universitet imtihonlarida natijangizni oshirishga yordam beraman.\nSavol yozing yoki o‘quv materialini yuklang. Javobni maqsadingiz, darajangiz va xatolaringizga bog‘layman.",
  "ru-RU":
    "Здравствуйте!\nЯ Саидамин, ваш Noviq Tutor. Я помогу улучшить результаты по IELTS, SAT, HSK, CEFR, школьным предметам или вступительным экзаменам.\nЗадайте вопрос или загрузите учебный материал. Я свяжу ответ с вашей целью, уровнем и ошибками.",
};

export const getTutorIntro = (language: TutorLanguage) =>
  TUTOR_INTRO[language];
