import type { AppLocale } from "@/src/contexts/LocaleContext";

const en = {
  home: "Home", features: "Features", tracks: "Exam tracks", language: "Language",
  menu: "Open navigation", closeMenu: "Close navigation", skip: "Skip to content",
  eyebrow: "AI-powered learning, brighter futures",
  headline: ["Make exam prep", "make sense."],
  description: "Your AI study operating system for IELTS, SAT, HSK, CEFR, school subjects, and university entrance exams. Plan smarter. Practice better. Go further.",
  start: "Start free", explore: "Explore features", school: "School", university: "University",
  pause: "Pause hero animation", play: "Play hero animation", brainAlt: "Two NOVIQ student characters, one holding books and another a certificate, surrounded by learning illustrations",
  visualLabels: ["Plan smarter", "Practice better", "Keep learning"],
  benefits: [
    ["Smart exam planning", "Build a study plan around your goals, timeline and available time."],
    ["Focused practice", "Review vocabulary, work through topics and protect your study time."],
    ["AI Tutor", "Ask questions and get explanations, with AI usage limits based on your plan."]
  ],
  showcaseEyebrow: "Your all-in-one study space",
  showcaseTitle: ["Everything you need", "to achieve more."],
  showcaseDescription: "A focused workspace brings planning, flashcards, your AI tutor and study notes together — so the next useful step is always close.",
  showcasePoints: ["Personalized planning", "Connected study tools", "Exam-focused learning"],
  screenshotAlt: "Actual NOVIQ Today dashboard showing an empty study plan, study library and focus tools",
  mobileAlt: "Actual mobile NOVIQ dashboard with the Today, Plan, Tutor, Library and Focus navigation",
  screenshotCaption: "Actual NOVIQ interface · Empty account shown, not a student result.",
  featureEyebrow: "Powerful tools for every learner", featureTitle: "Built for real exam preparation.",
  featureDescription: "From planning to practice, vocabulary to notes — your tools stay in one focused workspace.",
  featureCards: [
    ["Exam Planning", "Plan around your exam date, target score and available study time."],
    ["Vocabulary Decks", "Organize vocabulary and review it with your own flashcard decks."],
    ["Timed Practice", "Use focused sessions for reading, revision and exam preparation."],
    ["Performance Metrics", "Follow recorded study activity, focus time and learning progress."],
    ["AI Exam Tutor", "Work through questions with structured AI explanations."],
    ["Academic Notebook", "Keep sources, study notes and exam reflections in one place."]
  ],
  ctaEyebrow: "Your next chapter starts here", ctaTitle: "Start your exam success journey today.",
  ctaDescription: "Create your account and bring your study tools together.",
  ctaNote: "Free account available. AI limits depend on your plan.",
  footer: "Crafted for modern students, everywhere.", copyright: "All rights reserved."
};
type Copy = Omit<typeof en, "headline" | "benefits" | "showcaseTitle" | "featureCards"> & {
  headline: string[]; benefits: string[][]; showcaseTitle: string[]; featureCards: string[][];
};
const copies: Record<AppLocale, Copy> = {
  en,
  uz: {
    home:"Bosh sahifa", features:"Vositalar", tracks:"Imtihonlar", language:"Til",
    menu:"Menyuni ochish",closeMenu:"Menyuni yopish",skip:"Asosiy mazmunga o‘tish",
    eyebrow:"AI bilan o‘rganish, yorqin kelajak",headline:["Imtihonga tayyorgarlik","endi tushunarli."],
    description:"IELTS, SAT, HSK, CEFR, maktab fanlari va universitetga kirish imtihonlari uchun yagona AI o‘quv muhiti. Yaxshiroq reja tuzing. Samarali mashq qiling. Oldinga intiling.",
    start:"Bepul boshlash",explore:"Vositalarni ko‘rish",school:"Maktab",university:"Universitet",
    pause:"Hero animatsiyasini to‘xtatish",play:"Hero animatsiyasini yoqish",brainAlt:"Kitob va sertifikat tutgan ikki NOVIQ student personaji va o‘quv illustratsiyalari",
    visualLabels:["Tartibli reja","Samarali mashq","Doim o‘rganing"],
    benefits:[["Aqlli imtihon rejasi","Maqsad, muddat va ajratilgan vaqt asosida o‘quv rejasini tuzing."],["Diqqatli mashqlar","Lug‘atni takrorlang, mavzularni o‘rganing va o‘qishga vaqt ajrating."],["AI ustoz","Savol va tushuntirishlar uchun yordam oling. AI limitlari tarifga bog‘liq."]],
    showcaseEyebrow:"Yagona o‘quv muhitingiz",showcaseTitle:["Kerakli vositalar","bir joyda."],
    showcaseDescription:"Reja, kartalar, AI ustoz va o‘quv qaydlaringiz birga — keyingi foydali qadam har doim yoningizda.",
    showcasePoints:["Shaxsiy reja","Bog‘langan vositalar","Imtihonga tayyorgarlik"],
    screenshotAlt:"NOVIQ Bugun sahifasi: bo‘sh o‘quv rejasi, kutubxona va diqqat vositalari",
    mobileAlt:"NOVIQ mobil interfeysi va asosiy navigatsiya",
    screenshotCaption:"Haqiqiy NOVIQ interfeysi · Bo‘sh hisob, o‘quvchi natijasi emas.",
    featureEyebrow:"Har bir o‘quvchi uchun vositalar",featureTitle:"Haqiqiy imtihon tayyorgarligi uchun.",
    featureDescription:"Rejadan mashqqacha, lug‘atdan qaydlargacha — vositalaringiz bir o‘quv muhitida.",
    featureCards:[["Imtihon rejasi","Imtihon sanasi, maqsadli ball va mavjud vaqtga mos reja tuzing."],["Lug‘at kartalari","Lug‘atni shaxsiy flashcard to‘plamlari bilan tartiblang va takrorlang."],["Vaqtli mashqlar","O‘qish, takrorlash va imtihon uchun diqqatli mashg‘ulotlar."],["O‘qish ko‘rsatkichlari","Qayd etilgan faollik, diqqat vaqti va rivojlanishni kuzating."],["AI imtihon ustozi","Savollarni tartibli AI tushuntirishlari bilan o‘rganing."],["O‘quv daftari","Manbalar, o‘quv qaydlari va fikrlaringizni birga saqlang."]],
    ctaEyebrow:"Keyingi bosqich shu yerdan boshlanadi",ctaTitle:"Imtihon tayyorgarligingizni bugun boshlang.",
    ctaDescription:"Hisob yarating va o‘quv vositalaringizni birlashtiring.",ctaNote:"Bepul hisob mavjud. AI limitlari tarifga bog‘liq.",
    footer:"Zamonaviy o‘quvchilar uchun yaratilgan.",copyright:"Barcha huquqlar himoyalangan."
  },
  ru: {
    home:"Главная",features:"Инструменты",tracks:"Экзамены",language:"Язык",
    menu:"Открыть меню",closeMenu:"Закрыть меню",skip:"Перейти к содержимому",
    eyebrow:"Обучение с AI, новые возможности",headline:["Подготовка к экзаменам","становится понятнее."],
    description:"Учебная AI-система для IELTS, SAT, HSK, CEFR, школьных предметов и вступительных экзаменов. Планируйте разумнее. Практикуйтесь лучше. Двигайтесь дальше.",
    start:"Начать бесплатно",explore:"Посмотреть инструменты",school:"Школа",university:"Университет",
    pause:"Остановить анимацию",play:"Включить анимацию",brainAlt:"Два персонажа-ученика NOVIQ с книгами и сертификатом среди учебных иллюстраций",
    visualLabels:["Умный план","Практика","Новые знания"],
    benefits:[["Умный план подготовки","Планируйте занятия с учётом целей, сроков и доступного времени."],["Практика с фокусом","Повторяйте слова, разбирайте темы и выделяйте время для учёбы."],["AI-наставник","Задавайте вопросы и получайте объяснения. Лимиты AI зависят от тарифа."]],
    showcaseEyebrow:"Единое учебное пространство",showcaseTitle:["Всё необходимое","для новых достижений."],
    showcaseDescription:"План, карточки, AI-наставник и заметки вместе — следующий полезный шаг всегда рядом.",
    showcasePoints:["Личный план","Связанные инструменты","Подготовка к экзаменам"],
    screenshotAlt:"Настоящая главная панель NOVIQ с пустым учебным планом, библиотекой и инструментами фокуса",
    mobileAlt:"Настоящий мобильный интерфейс NOVIQ с основной навигацией",
    screenshotCaption:"Настоящий интерфейс NOVIQ · Пустой аккаунт, не результат ученика.",
    featureEyebrow:"Инструменты для каждого ученика",featureTitle:"Для настоящей подготовки к экзаменам.",
    featureDescription:"От планирования до практики, от словаря до заметок — всё в одном пространстве.",
    featureCards:[["План подготовки","Учитывайте дату экзамена, целевой балл и доступное время."],["Словарные карточки","Организуйте и повторяйте слова в своих наборах карточек."],["Практика на время","Сосредоточенные занятия для чтения, повторения и экзаменов."],["Учебные показатели","Следите за записанной активностью, временем фокуса и прогрессом."],["AI-наставник","Разбирайте вопросы со структурированными объяснениями AI."],["Учебные заметки","Храните источники, заметки и размышления в одном месте."]],
    ctaEyebrow:"Новый этап начинается здесь",ctaTitle:"Начните подготовку к экзаменам сегодня.",
    ctaDescription:"Создайте аккаунт и объедините свои учебные инструменты.",ctaNote:"Доступен бесплатный аккаунт. Лимиты AI зависят от тарифа.",
    footer:"Для современных учеников, где бы вы ни были.",copyright:"Все права защищены."
  }
};
export const getPublicLandingCopy = (locale: AppLocale) => copies[locale];
export const landingFeatureRoutes = ["planner","flashcards","focus","analytics","tutor","notes"] as const;
