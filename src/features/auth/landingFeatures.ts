import type { AppLocale } from "@/src/contexts/LocaleContext";
type Feature = { title: string; description: string };
const features: Record<AppLocale, Feature[]> = {
  en: [
    {title:"Exam Planning",description:"Daily plans adapt to exam date, target score, weak sections, and available study hours."},
    {title:"Vocabulary Decks",description:"Review IELTS vocabulary, SAT context words, HSK characters, and CEFR grammar patterns."},
    {title:"Timed Practice",description:"Run focused sessions for reading, listening, writing, speaking, math, and past-paper blocks."},
    {title:"Metrics",description:"Track progress over time with study metrics, streaks, and mastery insights."},
    {title:"Exam Tutor",description:"Get structured help for supported exams and academic subjects without generic AI clutter."},
    {title:"Academic Notebook",description:"Organize source notes, transcripts, and past-paper reflections for exam review."},
  ],
  uz: [
    {title:"Imtihon rejasi",description:"Kunlik reja imtihon sanasi, maqsadli ball, qiyin bo‘limlar va o‘qishga ajratilgan vaqtga moslashadi."},
    {title:"Lug‘at kartalari",description:"IELTS lug‘ati, SAT so‘zlari, HSK ierogliflari va CEFR grammatikasini takrorlang."},
    {title:"Vaqtli mashqlar",description:"O‘qish, tinglash, yozish, gapirish, matematika va oldingi imtihon savollari ustida diqqat bilan ishlang."},
    {title:"Natijalar",description:"O‘qish ko‘rsatkichlari, muntazamlik va mavzularni o‘zlashtirish orqali rivojlanishingizni kuzating."},
    {title:"AI imtihon ustozi",description:"Imtihonlar va o‘quv fanlari bo‘yicha tartibli yordam oling."},
    {title:"O‘quv daftari",description:"Imtihonga tayyorgarlik uchun manbalar, matnlar va oldingi savollar bo‘yicha qaydlarni tartiblang."},
  ],
  ru: [
    {title:"План подготовки",description:"Ежедневный план учитывает дату экзамена, целевой балл, сложные разделы и доступное время."},
    {title:"Словарные карточки",description:"Повторяйте лексику IELTS, слова SAT, иероглифы HSK и грамматику CEFR."},
    {title:"Практика на время",description:"Занимайтесь чтением, аудированием, письмом, речью, математикой и заданиями прошлых экзаменов."},
    {title:"Результаты",description:"Отслеживайте прогресс по учебным показателям, регулярности занятий и освоению тем."},
    {title:"AI-наставник",description:"Получайте структурированную помощь по экзаменам и учебным предметам."},
    {title:"Учебный блокнот",description:"Организуйте источники, тексты и заметки по заданиям прошлых экзаменов для повторения."},
  ],
};
export const getLandingFeatures = (locale: AppLocale) => features[locale];
