import { Target, GraduationCap, BookOpen, FileText, Languages, ChartNoAxesCombined, School, CalendarDays, Clock3, Brain, ListTodo, Library, BellOff, Hourglass, HeartHandshake } from 'lucide-react';
import type { AppLocale } from '@/src/contexts/LocaleContext';
import type { OnboardingAnswers } from './onboardingState';

export const onboardingSteps = [
  { id: 'mainGoal' as keyof OnboardingAnswers, icon: Target, icons: [GraduationCap, FileText, Languages, ChartNoAxesCombined, BookOpen, School, CalendarDays] },
  { id: 'userType' as keyof OnboardingAnswers, icon: GraduationCap, icons: [School, GraduationCap, BookOpen, FileText, Languages, ChartNoAxesCombined, Library] },
  { id: 'struggle' as keyof OnboardingAnswers, icon: HeartHandshake, icons: [CalendarDays, Hourglass, BellOff, Library, Clock3, Brain, HeartHandshake] },
];

const en = {
  headline: "Let’s set up", headlineEnd: 'your study plan', badge: 'AI-POWERED LEARNING, BRIGHTER FUTURES',
  description: 'Answer a few quick questions so NOVIQ can design a personalized learning experience for you.',
  features: [['Personalized plan', 'Based on your goals'], ['Smarter practice', 'AI-powered content'], ['Better results', 'Track your progress']],
  hints: ['Choose one option to help us personalize your experience.', 'Choose one option so we can show the most relevant content.', 'Choose one option. We’ll focus on helping you here.'],
  descriptions: [
    ['Improve your English and get a higher band score', 'Build skills and reach your target score', 'Learn Chinese and pass your target level', 'Improve your overall language level', 'Do better in your current school subjects', 'Get ready for university admission exams', 'Build a regular study habit'],
    ['Currently in school', 'Currently at university', 'Focusing on IELTS', 'Focusing on SAT', 'Focusing on HSK', 'Improving language level', 'Preparing for admission'],
    ['Keep a regular study routine', 'Often delay my study', 'Get distracted easily', 'Find and organize resources', 'Manage my time effectively', 'Remember what I learn', 'Feel nervous during exams'],
  ],
  back: 'Back', next: 'Continue', finish: 'Finish setup', saving: 'Saving your plan…', privacy: 'Your answers help make NOVIQ yours.',
};
type Copy = typeof en;
export function getOnboardingDesignCopy(locale: AppLocale): Copy {
  if (locale === 'uz') return { ...en, headline: 'Keling, o‘qish', headlineEnd: 'rejangizni tuzamiz', badge: 'SUN’IY INTELLEKT BILAN YORQIN KELAJAK SARI', description: 'Bir nechta qisqa savolga javob bering. NOVIQ sizga mos o‘rganish muhitini tayyorlaydi.', features: [['Shaxsiy reja', 'Maqsadingizga mos'], ['Samarali mashqlar', 'AI yordamidagi materiallar'], ['Yaxshiroq natijalar', 'O‘sishingizni kuzating']], hints: ['Sizga mos reja uchun bitta javobni tanlang.', 'Sizga eng mos materiallarni tavsiya qilamiz.', 'Qaysi yo‘nalishda ko‘proq yordam kerak?'], descriptions: [ ['Ingliz tilingiz va IELTS ballingizni oshiring', 'Ko‘nikmalaringizni rivojlantiring', 'Xitoy tilini o‘rganib, darajangizni oshiring', 'Til bilish darajangizni yaxshilang', 'Maktab fanlarini yaxshiroq o‘zlashtiring', 'Kirish imtihonlariga tayyorlaning', 'Muntazam o‘qish odatini yarating'], ['Hozir maktabda o‘qiyman', 'Hozir universitetda o‘qiyman', 'IELTSga tayyorlanyapman', 'SATga tayyorlanyapman', 'HSKga tayyorlanyapman', 'Til darajamni oshiryapman', 'Kirish imtihonlariga tayyorlanyapman'], ['Muntazam o‘qishga qiynalaman', 'Darslarni keyinga qoldiraman', 'Tez chalg‘ib qolaman', 'Materiallarni tartibga solish qiyin', 'Vaqtimni samarali taqsimlash', 'O‘rganganlarimni eslab qolish', 'Imtihon oldidan xavotirlanaman'] ], back: 'Orqaga', next: 'Davom etish', finish: 'Sozlashni yakunlash', saving: 'Rejangiz saqlanmoqda…', privacy: 'Javoblaringiz NOVIQ’ni sizga moslashtiradi.' };
  if (locale === 'ru') return { ...en, headline: 'Давайте составим', headlineEnd: 'ваш учебный план', badge: 'УМНОЕ ОБУЧЕНИЕ, ЯРКОЕ БУДУЩЕЕ', description: 'Ответьте на несколько вопросов, чтобы NOVIQ подготовил обучение с учётом ваших целей.', features: [['Личный план', 'На основе ваших целей'], ['Умная практика', 'Материалы с ИИ'], ['Лучше результаты', 'Следите за прогрессом']], hints: ['Выберите один вариант для персонализации.', 'Поможем найти подходящие материалы.', 'Выберите то, в чём нужна помощь.'], descriptions: [ ['Улучшить английский и балл IELTS', 'Развить навыки и достичь цели', 'Выучить китайский и сдать HSK', 'Повысить уровень владения языком', 'Улучшить знания школьных предметов', 'Подготовиться к поступлению', 'Выработать привычку учиться'], ['Учусь в школе', 'Учусь в университете', 'Готовлюсь к IELTS', 'Готовлюсь к SAT', 'Готовлюсь к HSK', 'Повышаю уровень языка', 'Готовлюсь к поступлению'], ['Регулярно заниматься', 'Не откладывать занятия', 'Меньше отвлекаться', 'Организовать учебные материалы', 'Распределять время', 'Запоминать изученное', 'Справляться с тревогой'] ], back: 'Назад', next: 'Продолжить', finish: 'Завершить настройку', saving: 'Сохраняем ваш план…', privacy: 'Ваши ответы помогут настроить NOVIQ.' };
  return en;
}
