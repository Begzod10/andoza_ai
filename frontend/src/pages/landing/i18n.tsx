import { createContext, useContext, useEffect, useMemo, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Lang = "uz" | "ru" | "en";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "uz", label: "UZ" },
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
];

interface CardItem {
  title: string;
  desc: string;
}

interface PricingTier {
  name: string;
  price: string;
  features: string[];
  cta: string;
}

export interface ConveyorPair {
  problem: string;
  problemTip: string;
  solution: string;
  solutionTip: string;
}

export interface ConveyorDict {
  problemLabel: string;
  solutionLabel: string;
  machineTicks: string[];
  pairs: ConveyorPair[];
}

export interface Dict {
  nav: { login: string; start: string };
  hero: {
    eyebrow: string;
    title1: string;
    title2: string;
    subtitle: string;
    primary: string;
    secondary: string;
    note: string;
    mock: {
      note: string;
      reminderTitle: string;
      reminderTask: string;
      reminderRoom: string;
      projectsTitle: string;
      task1: string;
      task1date: string;
      task2: string;
      task2date: string;
      storesTitle: string;
    };
  };
  conveyor: ConveyorDict;
  problem: { heading: string; items: CardItem[] };
  solution: { heading: string; items: CardItem[] };
  how: { heading: string; steps: CardItem[] };
  pricing: {
    heading: string;
    popular: string;
    free: PricingTier;
    pro: PricingTier;
  };
  finalCta: { heading: string; subtitle: string; button: string };
  footer: {
    tagline: string;
    links: { dokon: string; ustalar: string; kirish: string };
    copyright: string;
  };
}

// ─── Dictionaries ──────────────────────────────────────────────────────────

const uz: Dict = {
  nav: { login: "Kirish", start: "Boshlash" },
  hero: {
    eyebrow: "Ta'mir uchun raqamli yordamchi",
    title1: "Xonangizni 3D'da ko'ring",
    title2: "ta'mirdan oldin",
    subtitle:
      "Skanerlang, dizayn qiling va aniq smeta oling — kerakli materiallarni bitta ilovadan sotib oling.",
    primary: "Bepul boshlash",
    secondary: "Qanday ishlaydi?",
    note: "Ro'yxatdan o'tish bepul · Karta talab qilinmaydi",
    mock: {
      note: "Xona o'lchamini kiriting — 3D model o'zi tayyor bo'ladi.",
      reminderTitle: "Eslatma",
      reminderTask: "Usta bilan uchrashuv",
      reminderRoom: "Mehmonxona — suvoq bosqichi",
      projectsTitle: "Loyihalarim",
      task1: "Mehmonxona — dizayn",
      task1date: "Bugun",
      task2: "Oshxona — smeta",
      task2date: "18-sen",
      storesTitle: "100+ do'kon",
    },
  },
  conveyor: {
    problemLabel: "Muammo",
    solutionLabel: "Yechim",
    machineTicks: ["Skanerlash", "Hisoblash", "Optimallashtirish"],
    pairs: [
      {
        problem: "Noaniq xarajat",
        problemTip: "Material va ish haqi qancha turishini oldindan bilib bo'lmaydi",
        solution: "Aniq smeta",
        solutionTip: "Har bir bosqich uchun aniq narx avtomatik hisoblanadi",
      },
      {
        problem: "Ko'p do'kon aylanish",
        problemTip: "Har xil narx uchun shahar bo'ylab yurishga to'g'ri keladi",
        solution: "Bitta do'kon",
        solutionTip: "100+ do'kon materiali bitta joyda, solishtirib xarid qiling",
      },
      {
        problem: "Ishonchsiz usta",
        problemTip: "Kim sifatli ishlashini oldindan bilish qiyin",
        solution: "Tekshirilgan usta",
        solutionTip: "Reyting va sharhlar bilan ishonchli ustalar",
      },
      {
        problem: "Uzoq rejalashtirish",
        problemTip: "Rejalashtirish haftalab cho'zilib ketadi",
        solution: "Tezkor 3D reja",
        solutionTip: "Bir necha daqiqada tayyor 3D reja va vizualizatsiya",
      },
      {
        problem: "Qo'lda hisob",
        problemTip: "Qo'lda hisob-kitob xatolarga to'la va sekin",
        solution: "Avtomatik hisob",
        solutionTip: "Material miqdori va narxi avtomatik hisoblanadi",
      },
      {
        problem: "Chalkash jarayon",
        problemTip: "Nimadan boshlashni va keyingi qadamni bilmaslik",
        solution: "Aniq bosqichlar",
        solutionTip: "Bosqichma-bosqich aniq reja bilan nazorat sizda",
      },
    ],
  },
  problem: {
    heading: "Ta'mir og'riqli bo'lishi shart emas",
    items: [
      {
        title: "Xarajat noaniq",
        desc: "Materiallar va ish haqi qancha turishini oldindan bilib bo'lmaydi",
      },
      {
        title: "Ko'p joyni aylanish",
        desc: "Har bir material uchun boshqa do'kon, boshqa narx",
      },
      {
        title: "Ishonchsiz usta",
        desc: "Kim sifatli ishlashini oldindan bilish qiyin",
      },
      {
        title: "Rejalashtirish uzoq",
        desc: "Hammasini qo'lda hisoblash haftalab cho'ziladi",
      },
    ],
  },
  solution: {
    heading: "Barchasi bitta ilovada",
    items: [
      {
        title: "3D skaner",
        desc: "Xonani skanerlang yoki o'lchamini kiriting — aniq 3D model",
      },
      {
        title: "Dizayn studiyasi",
        desc: "Devor, pol, mebel va oboyni real vaqtda tanlang",
      },
      {
        title: "Aniq smeta",
        desc: "Har bir bosqich uchun material va ish haqi avtomatik hisoblanadi",
      },
      {
        title: "Do'kon",
        desc: "100+ do'kondan materiallarni solishtiring va sotib oling",
      },
      {
        title: "Ustalar",
        desc: "Yaqin atrofdagi ishonchli ustalarni toping",
      },
      {
        title: "Bosqichma-bosqich",
        desc: "Korobkadan tayyor holatga — har bir qadam nazorat ostida",
      },
    ],
  },
  how: {
    heading: "Uch qadamda",
    steps: [
      {
        title: "Skanerlang",
        desc: "Xonani LiDAR yoki foto bilan skanerlang, yoki o'lchamini kiriting",
      },
      {
        title: "Dizayn qiling",
        desc: "3D studiyada materiallar va mebelni tanlang",
      },
      {
        title: "Smeta va xarid",
        desc: "Aniq smetani oling, material va usta toping",
      },
    ],
  },
  pricing: {
    heading: "Bepul boshlang",
    popular: "Tavsiya etiladi",
    free: {
      name: "Bepul",
      price: "0 so'm",
      features: ["Xonani skanerlash", "Dizayn studiyasi", "Taxminiy smeta"],
      cta: "Boshlash",
    },
    pro: {
      name: "Pro",
      price: "Tez kunda",
      features: ["Aniq smeta", "Cheksiz loyiha", "Ustuvor qo'llab-quvvatlash"],
      cta: "Boshlash",
    },
  },
  finalCta: {
    heading: "Ta'mirni bugun boshlang",
    subtitle: "Bir necha daqiqada birinchi loyihangizni yarating.",
    button: "Bepul boshlash",
  },
  footer: {
    tagline: "Ta'mir uchun raqamli yordamchi",
    links: { dokon: "Do'kon", ustalar: "Ustalar", kirish: "Kirish" },
    copyright: "© 2026 AndozaAI",
  },
};

const ru: Dict = {
  nav: { login: "Войти", start: "Начать" },
  hero: {
    eyebrow: "Цифровой помощник для ремонта",
    title1: "Увидьте свою комнату в 3D",
    title2: "до начала ремонта",
    subtitle:
      "Сканируйте, проектируйте и получайте точную смету — покупайте нужные материалы в одном приложении.",
    primary: "Начать бесплатно",
    secondary: "Как это работает?",
    note: "Регистрация бесплатна · Карта не требуется",
    mock: {
      note: "Введите размеры комнаты — 3D-модель создастся сама.",
      reminderTitle: "Напоминание",
      reminderTask: "Встреча с мастером",
      reminderRoom: "Гостиная — штукатурка",
      projectsTitle: "Мои проекты",
      task1: "Гостиная — дизайн",
      task1date: "Сегодня",
      task2: "Кухня — смета",
      task2date: "18 сен",
      storesTitle: "100+ магазинов",
    },
  },
  conveyor: {
    problemLabel: "Проблема",
    solutionLabel: "Решение",
    machineTicks: ["Сканирование", "Расчёт", "Оптимизация"],
    pairs: [
      {
        problem: "Неясные расходы",
        problemTip: "Заранее не узнать, сколько будут стоить материалы и работа",
        solution: "Точная смета",
        solutionTip: "Точная цена по каждому этапу считается автоматически",
      },
      {
        problem: "Много магазинов",
        problemTip: "Ради разных цен приходится колесить по всему городу",
        solution: "Один магазин",
        solutionTip: "Материалы 100+ магазинов в одном месте — сравнивайте и покупайте",
      },
      {
        problem: "Ненадёжный мастер",
        problemTip: "Трудно заранее понять, кто работает качественно",
        solution: "Проверенный мастер",
        solutionTip: "Надёжные мастера с рейтингом и отзывами",
      },
      {
        problem: "Долгое планирование",
        problemTip: "Планирование растягивается на недели",
        solution: "Быстрый 3D-план",
        solutionTip: "Готовый 3D-план и визуализация за несколько минут",
      },
      {
        problem: "Ручной подсчёт",
        problemTip: "Ручные расчёты медленные и полны ошибок",
        solution: "Авторасчёт",
        solutionTip: "Объём и стоимость материалов считаются автоматически",
      },
      {
        problem: "Запутанный процесс",
        problemTip: "Непонятно, с чего начать и что делать дальше",
        solution: "Чёткие этапы",
        solutionTip: "Пошаговый план — контроль всегда у вас",
      },
    ],
  },
  problem: {
    heading: "Ремонт не обязан быть мучением",
    items: [
      {
        title: "Непонятные расходы",
        desc: "Заранее не узнать, сколько будут стоить материалы и работа",
      },
      {
        title: "Беготня по магазинам",
        desc: "Для каждого материала — другой магазин и другая цена",
      },
      {
        title: "Ненадёжные мастера",
        desc: "Трудно заранее понять, кто работает качественно",
      },
      {
        title: "Долгое планирование",
        desc: "Всё считать вручную — это недели работы",
      },
    ],
  },
  solution: {
    heading: "Всё в одном приложении",
    items: [
      {
        title: "3D-сканер",
        desc: "Отсканируйте комнату или введите размеры — точная 3D-модель",
      },
      {
        title: "Дизайн-студия",
        desc: "Подбирайте стены, пол, мебель и обои в реальном времени",
      },
      {
        title: "Точная смета",
        desc: "Материалы и работа по каждому этапу считаются автоматически",
      },
      {
        title: "Магазин",
        desc: "Сравнивайте и покупайте материалы из 100+ магазинов",
      },
      {
        title: "Мастера",
        desc: "Находите надёжных мастеров рядом с вами",
      },
      {
        title: "Шаг за шагом",
        desc: "От коробки до готового ремонта — каждый шаг под контролем",
      },
    ],
  },
  how: {
    heading: "В три шага",
    steps: [
      {
        title: "Отсканируйте",
        desc: "Отсканируйте комнату через LiDAR или фото, либо введите размеры",
      },
      {
        title: "Спроектируйте",
        desc: "Выберите материалы и мебель в 3D-студии",
      },
      {
        title: "Смета и покупка",
        desc: "Получите точную смету, найдите материалы и мастера",
      },
    ],
  },
  pricing: {
    heading: "Начните бесплатно",
    popular: "Рекомендуем",
    free: {
      name: "Бесплатно",
      price: "0 сум",
      features: ["Сканирование комнаты", "Дизайн-студия", "Приблизительная смета"],
      cta: "Начать",
    },
    pro: {
      name: "Pro",
      price: "Скоро",
      features: ["Точная смета", "Неограниченные проекты", "Приоритетная поддержка"],
      cta: "Начать",
    },
  },
  finalCta: {
    heading: "Начните ремонт сегодня",
    subtitle: "Создайте свой первый проект за несколько минут.",
    button: "Начать бесплатно",
  },
  footer: {
    tagline: "Цифровой помощник для ремонта",
    links: { dokon: "Магазин", ustalar: "Мастера", kirish: "Войти" },
    copyright: "© 2026 AndozaAI",
  },
};

const en: Dict = {
  nav: { login: "Log in", start: "Get started" },
  hero: {
    eyebrow: "Your digital assistant for renovation",
    title1: "See your room in 3D",
    title2: "before you renovate",
    subtitle:
      "Scan, design and get an accurate estimate — buy all the materials you need from one app.",
    primary: "Start for free",
    secondary: "How it works?",
    note: "Free to sign up · No card required",
    mock: {
      note: "Enter the room size — the 3D model builds itself.",
      reminderTitle: "Reminder",
      reminderTask: "Meeting with a pro",
      reminderRoom: "Living room — plaster",
      projectsTitle: "My projects",
      task1: "Living room — design",
      task1date: "Today",
      task2: "Kitchen — estimate",
      task2date: "Sep 18",
      storesTitle: "100+ stores",
    },
  },
  conveyor: {
    problemLabel: "Problem",
    solutionLabel: "Solution",
    machineTicks: ["Scanning", "Calculating", "Optimizing"],
    pairs: [
      {
        problem: "Unclear costs",
        problemTip: "There's no way to know upfront what materials and labor will cost",
        solution: "Exact estimate",
        solutionTip: "An exact price for every stage, calculated automatically",
      },
      {
        problem: "Many stores",
        problemTip: "Driving across town chasing different prices for each material",
        solution: "One store",
        solutionTip: "Materials from 100+ stores in one place — compare and buy",
      },
      {
        problem: "Unreliable worker",
        problemTip: "It's hard to know in advance who does quality work",
        solution: "Verified pro",
        solutionTip: "Trusted pros with ratings and reviews",
      },
      {
        problem: "Slow planning",
        problemTip: "Planning drags on for weeks",
        solution: "Fast 3D plan",
        solutionTip: "A ready 3D plan and visualization in minutes",
      },
      {
        problem: "Manual math",
        problemTip: "Hand calculations are slow and full of mistakes",
        solution: "Auto calculation",
        solutionTip: "Material quantities and prices computed automatically",
      },
      {
        problem: "Messy process",
        problemTip: "Not knowing where to start or what comes next",
        solution: "Clear stages",
        solutionTip: "A step-by-step plan — you stay in control",
      },
    ],
  },
  problem: {
    heading: "Renovation doesn't have to be painful",
    items: [
      {
        title: "Unclear costs",
        desc: "There's no way to know upfront what materials and labor will cost",
      },
      {
        title: "Running around stores",
        desc: "A different store and a different price for every material",
      },
      {
        title: "Unreliable workers",
        desc: "It's hard to know in advance who does quality work",
      },
      {
        title: "Slow planning",
        desc: "Calculating everything by hand drags on for weeks",
      },
    ],
  },
  solution: {
    heading: "Everything in one app",
    items: [
      {
        title: "3D scanner",
        desc: "Scan your room or enter its dimensions — an accurate 3D model",
      },
      {
        title: "Design studio",
        desc: "Pick walls, floors, furniture and wallpaper in real time",
      },
      {
        title: "Accurate estimate",
        desc: "Materials and labor for every stage are calculated automatically",
      },
      {
        title: "Store",
        desc: "Compare and buy materials from 100+ stores",
      },
      {
        title: "Workers",
        desc: "Find trusted workers near you",
      },
      {
        title: "Step by step",
        desc: "From bare walls to finished — every step under control",
      },
    ],
  },
  how: {
    heading: "In three steps",
    steps: [
      {
        title: "Scan",
        desc: "Scan the room with LiDAR or a photo, or enter its dimensions",
      },
      {
        title: "Design",
        desc: "Choose materials and furniture in the 3D studio",
      },
      {
        title: "Estimate & buy",
        desc: "Get an accurate estimate, find materials and workers",
      },
    ],
  },
  pricing: {
    heading: "Start for free",
    popular: "Recommended",
    free: {
      name: "Free",
      price: "0 UZS",
      features: ["Room scanning", "Design studio", "Approximate estimate"],
      cta: "Get started",
    },
    pro: {
      name: "Pro",
      price: "Coming soon",
      features: ["Accurate estimate", "Unlimited projects", "Priority support"],
      cta: "Get started",
    },
  },
  finalCta: {
    heading: "Start your renovation today",
    subtitle: "Create your first project in just a few minutes.",
    button: "Start for free",
  },
  footer: {
    tagline: "Your digital assistant for renovation",
    links: { dokon: "Store", ustalar: "Workers", kirish: "Log in" },
    copyright: "© 2026 AndozaAI",
  },
};

const DICTS: Record<Lang, Dict> = { uz, ru, en };

// ─── Context ─────────────────────────────────────────────────────────────────

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Dict;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "andoza.landing.lang";

function readInitialLang(): Lang {
  if (typeof window === "undefined") return "uz";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "uz" || stored === "ru" || stored === "en") return stored;
  return "uz";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore storage errors (private mode etc.) */
    }
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang: setLangState, t: DICTS[lang] }),
    [lang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within a LanguageProvider");
  return ctx;
}
