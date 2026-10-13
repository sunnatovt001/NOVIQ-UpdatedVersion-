import type { AppLocale } from "@/src/contexts/LocaleContext";

const reasons = {
  "Open the generated activity first.": ["Avval yaratilgan mashqni oching.", "Сначала откройте созданное упражнение."],
  "Answer every quiz question.": ["Testdagi barcha savollarga javob bering.", "Ответьте на все вопросы теста."],
  "Submit the quiz first.": ["Avval testni topshiring.", "Сначала отправьте тест."],
  "Submit the writing task.": ["Yozma ishni topshiring.", "Отправьте письменную работу."],
  "Add short notes after speaking.": ["Gapirish mashqidan so‘ng qisqa qaydlar yozing.", "Добавьте краткие заметки после устного упражнения."],
  "Finish the speaking exercise.": ["Gapirish mashqini yakunlang.", "Завершите устное упражнение."],
  "Review every flashcard.": ["Barcha kartalarni takrorlang.", "Повторите все карточки."],
} as const;

// Presentation only: the engine's requirements, scores and evidence stay intact.
export function localizePlannerValidation(reason: string, locale: AppLocale): string {
  if (locale === "en") return reason;
  const index = locale === "uz" ? 0 : 1;
  if (Object.prototype.hasOwnProperty.call(reasons, reason)) return reasons[reason as keyof typeof reasons][index];
  const timer = /^Study timer needs (\d+) more min\.$/.exec(reason);
  if (timer) return locale === "uz" ? `Taymerda yana ${timer[1]} daqiqa o‘qish kerak.` : `Нужно заниматься ещё ${timer[1]} мин. по таймеру.`;
  const writing = /^Write at least (\d+) words\.$/.exec(reason);
  if (writing) return locale === "uz" ? `Kamida ${writing[1]} ta so‘z yozing.` : `Напишите не менее ${writing[1]} слов.`;
  return reason;
}
