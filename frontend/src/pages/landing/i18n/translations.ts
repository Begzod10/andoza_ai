export type Locale = "uz" | "ru" | "en";

export interface LandingCopy {
  hero: {
    kirish: string;
    eyebrow: string;
    headlinePre: string;
    headlineHighlight: string;
    headlinePost: string;
    subheadline: string;
    ctaPrimary: string;
    ctaSecondary: string;
    disclaimer: string;
  };
  heroMock: {
    ready3d: string;
    estimateLabel: string;
    estimateNote: string;
    badge: string;
    // Cycled every 8s in HeroMock.tsx. Price is pre-converted per locale
    // (so'm for uz, rubles for ru, dollars for en) — this is illustrative
    // marketing content, not a live currency feed.
    rooms: { name: string; area: string; walls: string; price: string }[];
  };
  problem: {
    eyebrow: string;
    heading: string;
    pains: { title: string; desc: string }[];
  };
  solution: {
    eyebrow: string;
    heading: string;
    features: { title: string; desc: string }[];
  };
  howItWorks: {
    eyebrow: string;
    heading: string;
    steps: { title: string; desc: string }[];
  };
  pricing: {
    eyebrow: string;
    heading: string;
    tiers: {
      name: string;
      tagline: string;
      price: string;
      period: string;
      rooms: string;
      features: string[];
      cta: string;
      badge?: string;
    }[];
    disclosure: string;
  };
  finalCta: {
    headingPre: string;
    headingHighlight: string;
    subheading: string;
    cta: string;
  };
  footer: {
    rights: string;
  };
}

const uz: LandingCopy = {
  hero: {
    kirish: "Kirish",
    eyebrow: "Ta'mir uchun raqamli yordamchi",
    headlinePre: "Kvartirangizni ",
    headlineHighlight: "3D'da ko'ring",
    headlinePost: " — to'lashdan oldin",
    subheadline:
      "Xonangizni skanerlang, dizaynini soling, aniq smetasini oling va kerakli materiallarni bir joydan sotib oling — hammasi bitta ilovada.",
    ctaPrimary: "Bepul boshlash",
    ctaSecondary: "Qanday ishlaydi?",
    disclaimer: "Ro'yxatdan o'tish bepul · Karta talab qilinmaydi",
  },
  heroMock: {
    ready3d: "3D tayyor",
    estimateLabel: "Taxminiy smeta",
    estimateNote: "Faqat kerakli materiallar",
    badge: "Avtomatik hisob-kitob",
    rooms: [
      { name: "Mehmonxona", area: "18.4 m²", walls: "4 devor", price: "12 480 000 so'm" },
      { name: "Yotoqxona", area: "14.2 m²", walls: "4 devor", price: "8 650 000 so'm" },
      { name: "Oshxona", area: "10.6 m²", walls: "4 devor", price: "9 920 000 so'm" },
      { name: "Hammom", area: "5.8 m²", walls: "4 devor", price: "6 340 000 so'm" },
      { name: "Dahliz", area: "7.2 m²", walls: "3 devor", price: "4 150 000 so'm" },
    ],
  },
  problem: {
    eyebrow: "Muammo",
    heading: "Ta'mir — bu doim noaniqlik",
    pains: [
      {
        title: "Ko'rmay turib to'laysiz",
        desc: "Pulini to'lashdan oldin natijani ko'ra olmaysiz.",
      },
      {
        title: "Byudjet — taxmin",
        desc: "Necha pul ketishini hech kim aniq aytolmaydi.",
      },
      {
        title: "Xarid tarqoq",
        desc: "Har bir material uchun alohida do'kon, alohida narx.",
      },
      {
        title: "Usta shaffof emas",
        desc: "Qancha ish, qancha material ketganini bilmaysiz.",
      },
      {
        title: "Isrofgarchilik",
        desc: "Noto'g'ri hisoblangan miqdor — ortiqcha xarajat.",
      },
    ],
  },
  solution: {
    eyebrow: "Yechim",
    heading: "Bitta ilova — loyihadan xaridgacha",
    features: [
      {
        title: "3D'da ko'ring",
        desc: "Xonangizni LiDAR, 360° surat yoki qo'lda chizib skanerlang — natijani haqiqiy o'lchamda, real vaqtda 3D'da ko'ring.",
      },
      {
        title: "Aniq smeta",
        desc: "Har bir devor va sirt uchun avtomatik hisob-kitob — faqat kerakli materiallarga pul to'laysiz.",
      },
      {
        title: "Bir joyda xarid",
        desc: "Do'kon bo'limidan kerakli materiallarni to'g'ridan-to'g'ri buyurtma qiling.",
      },
      {
        title: "Ishonchli ustalar",
        desc: "Tajribali ustalarni topib, ish narxini oldindan bilib oling.",
      },
      {
        title: "Elektr va suvoq rejasi",
        desc: "Devordan elektr jihozlarigacha — har bir bosqich alohida rejalashtiriladi.",
      },
    ],
  },
  howItWorks: {
    eyebrow: "Qanday ishlaydi",
    heading: "4 qadamda — rejadan xaridgacha",
    steps: [
      {
        title: "Xonani skanerlang",
        desc: "LiDAR, 360° surat yoki qo'lda chizib o'lchamlarini kiriting.",
      },
      {
        title: "Dizaynni soling",
        desc: "Suvoq, bo'yoq, mebel va yoritishni 3D'da sozlang.",
      },
      {
        title: "Smetani oling",
        desc: "Aniq miqdor va narx bilan avtomatik hisob-kitob.",
      },
      {
        title: "Sotib oling yoki ustani chaqiring",
        desc: "Do'kon yoki Ustalar bo'limidan davom eting.",
      },
    ],
  },
  pricing: {
    eyebrow: "Tariflar",
    heading: "Har bir loyiha uchun mos reja",
    tiers: [
      {
        name: "START",
        tagline: "Birinchi loyihangiz uchun",
        price: "Bepul",
        period: "",
        rooms: "1 xona",
        features: ["3D xona dizayni", "Render", "Smeta hisob-kitobi"],
        cta: "Bepul boshlash",
      },
      {
        name: "PRO",
        tagline: "Innovatsiyani his qiling",
        price: "299 000",
        period: "so'm/oy",
        rooms: "2 xona",
        features: ["2 xona dizayni", "Render + 2 variant", "Avtomatik smeta"],
        cta: "PRO tanlash",
        badge: "Ommabop",
      },
      {
        name: "MAX",
        tagline: "Butun uy uchun",
        price: "999 000",
        period: "so'm/oy",
        rooms: "5–8 xona",
        features: ["5–8 xona 3D dizayni", "Butun uy loyihasi", "Batafsil smeta"],
        cta: "MAX tanlash",
        badge: "Eng foydali",
      },
    ],
    disclosure: "Tariflar tez orada faollashtiriladi — hozircha barcha imkoniyatlar bepul.",
  },
  finalCta: {
    headingPre: "Ta'mirni bugun ",
    headingHighlight: "rejalashtiring",
    subheading: "Ro'yxatdan o'ting va birinchi xonangizni bepul 3D'da ko'ring.",
    cta: "Bepul boshlash",
  },
  footer: {
    rights: "Barcha huquqlar himoyalangan.",
  },
};

const ru: LandingCopy = {
  hero: {
    kirish: "Войти",
    eyebrow: "Цифровой помощник для ремонта",
    headlinePre: "Увидьте квартиру ",
    headlineHighlight: "в 3D",
    headlinePost: " — ещё до того, как заплатите",
    subheadline:
      "Отсканируйте комнату, создайте дизайн, получите точную смету и купите нужные материалы — всё в одном приложении.",
    ctaPrimary: "Начать бесплатно",
    ctaSecondary: "Как это работает?",
    disclaimer: "Регистрация бесплатна · Карта не требуется",
  },
  heroMock: {
    ready3d: "3D готово",
    estimateLabel: "Примерная смета",
    estimateNote: "Только нужные материалы",
    badge: "Автоматический расчёт",
    rooms: [
      { name: "Гостиная", area: "18.4 m²", walls: "4 стены", price: "12 480 000 сум" },
      { name: "Спальня", area: "14.2 m²", walls: "4 стены", price: "8 650 000 сум" },
      { name: "Кухня", area: "10.6 m²", walls: "4 стены", price: "9 920 000 сум" },
      { name: "Ванная", area: "5.8 m²", walls: "4 стены", price: "6 340 000 сум" },
      { name: "Коридор", area: "7.2 m²", walls: "3 стены", price: "4 150 000 сум" },
    ],
  },
  problem: {
    eyebrow: "Проблема",
    heading: "Ремонт — это всегда неопределённость",
    pains: [
      {
        title: "Платите, не видя результата",
        desc: "Вы не можете увидеть результат до того, как заплатите.",
      },
      {
        title: "Бюджет — это догадки",
        desc: "Никто точно не скажет, сколько денег уйдёт.",
      },
      {
        title: "Покупки разбросаны",
        desc: "Для каждого материала — свой магазин, своя цена.",
      },
      {
        title: "Работа мастера непрозрачна",
        desc: "Вы не знаете, сколько работы и материалов ушло.",
      },
      {
        title: "Перерасход",
        desc: "Неверно посчитанное количество — лишние траты.",
      },
    ],
  },
  solution: {
    eyebrow: "Решение",
    heading: "Одно приложение — от проекта до покупки",
    features: [
      {
        title: "Смотрите в 3D",
        desc: "Отсканируйте комнату через LiDAR, 360°-фото или нарисуйте вручную — увидьте результат в реальном масштабе и в 3D в реальном времени.",
      },
      {
        title: "Точная смета",
        desc: "Автоматический расчёт для каждой стены и поверхности — вы платите только за нужные материалы.",
      },
      {
        title: "Покупки в одном месте",
        desc: "Заказывайте нужные материалы прямо из раздела «Магазин».",
      },
      {
        title: "Надёжные мастера",
        desc: "Найдите опытных мастеров и узнайте стоимость работы заранее.",
      },
      {
        title: "План электрики и штукатурки",
        desc: "От стен до электрики — каждый этап планируется отдельно.",
      },
    ],
  },
  howItWorks: {
    eyebrow: "Как это работает",
    heading: "4 шага — от плана до покупки",
    steps: [
      {
        title: "Отсканируйте комнату",
        desc: "Введите размеры через LiDAR, 360°-фото или вручную.",
      },
      {
        title: "Создайте дизайн",
        desc: "Настройте штукатурку, краску, мебель и освещение в 3D.",
      },
      {
        title: "Получите смету",
        desc: "Автоматический расчёт с точным количеством и ценой.",
      },
      {
        title: "Купите или вызовите мастера",
        desc: "Продолжите в разделе «Магазин» или «Мастера».",
      },
    ],
  },
  pricing: {
    eyebrow: "Тарифы",
    heading: "План под любой проект",
    tiers: [
      {
        name: "START",
        tagline: "Для первого проекта",
        price: "Бесплатно",
        period: "",
        rooms: "1 комната",
        features: ["3D-дизайн комнаты", "Рендер", "Расчёт сметы"],
        cta: "Начать бесплатно",
      },
      {
        name: "PRO",
        tagline: "Почувствуйте инновацию",
        price: "299 000",
        period: "сум/мес",
        rooms: "2 комнаты",
        features: ["Дизайн 2 комнат", "Рендер + 2 варианта", "Автоматическая смета"],
        cta: "Выбрать PRO",
        badge: "Популярный",
      },
      {
        name: "MAX",
        tagline: "Для всего дома",
        price: "999 000",
        period: "сум/мес",
        rooms: "5–8 комнат",
        features: ["3D-дизайн 5–8 комнат", "Проект всего дома", "Подробная смета"],
        cta: "Выбрать MAX",
        badge: "Выгоднее всего",
      },
    ],
    disclosure: "Тарифы скоро станут доступны — пока все возможности бесплатны.",
  },
  finalCta: {
    headingPre: "Начните ремонт ",
    headingHighlight: "уже сегодня",
    subheading: "Зарегистрируйтесь и посмотрите первую комнату в 3D бесплатно.",
    cta: "Начать бесплатно",
  },
  footer: {
    rights: "Все права защищены.",
  },
};

const en: LandingCopy = {
  hero: {
    kirish: "Log in",
    eyebrow: "A digital assistant for renovation",
    headlinePre: "See your apartment in ",
    headlineHighlight: "3D",
    headlinePost: " — before you pay",
    subheadline:
      "Scan your room, design it, get an accurate estimate, and buy the materials you need — all in one app.",
    ctaPrimary: "Start for free",
    ctaSecondary: "How it works?",
    disclaimer: "Free to sign up · No card required",
  },
  heroMock: {
    ready3d: "3D ready",
    estimateLabel: "Estimated cost",
    estimateNote: "Only what you actually need",
    badge: "Automatic calculation",
    rooms: [
      { name: "Living room", area: "18.4 m²", walls: "4 walls", price: "12,480,000 so'm" },
      { name: "Bedroom", area: "14.2 m²", walls: "4 walls", price: "8,650,000 so'm" },
      { name: "Kitchen", area: "10.6 m²", walls: "4 walls", price: "9,920,000 so'm" },
      { name: "Bathroom", area: "5.8 m²", walls: "4 walls", price: "6,340,000 so'm" },
      { name: "Hallway", area: "7.2 m²", walls: "3 walls", price: "4,150,000 so'm" },
    ],
  },
  problem: {
    eyebrow: "The problem",
    heading: "Renovation is always uncertain",
    pains: [
      {
        title: "You pay before you can see it",
        desc: "You can't see the result before you pay for it.",
      },
      {
        title: "Budgeting is guesswork",
        desc: "No one can tell you exactly how much it will cost.",
      },
      {
        title: "Shopping is scattered",
        desc: "A separate store and price for every material.",
      },
      {
        title: "Contractors aren't transparent",
        desc: "You don't know how much work or material actually went in.",
      },
      {
        title: "Wasted money",
        desc: "Wrong quantities mean money wasted.",
      },
    ],
  },
  solution: {
    eyebrow: "The solution",
    heading: "One app — from design to purchase",
    features: [
      {
        title: "See it in 3D",
        desc: "Scan your room with LiDAR, a 360° photo, or draw it by hand — see the real result, to scale, in 3D.",
      },
      {
        title: "Accurate estimate",
        desc: "Automatic calculation for every wall and surface — you only pay for the materials you actually need.",
      },
      {
        title: "One-stop shopping",
        desc: "Order exactly the materials you need straight from the Shop section.",
      },
      {
        title: "Trusted contractors",
        desc: "Find experienced contractors and know the price of the work upfront.",
      },
      {
        title: "Electrical & plastering plan",
        desc: "From walls to electrical fixtures — every stage is planned separately.",
      },
    ],
  },
  howItWorks: {
    eyebrow: "How it works",
    heading: "4 steps — from plan to purchase",
    steps: [
      {
        title: "Scan your room",
        desc: "Enter its dimensions via LiDAR, a 360° photo, or by hand.",
      },
      {
        title: "Design it",
        desc: "Set up plaster, paint, furniture, and lighting in 3D.",
      },
      {
        title: "Get your estimate",
        desc: "Automatic calculation with exact quantities and prices.",
      },
      {
        title: "Buy or call a contractor",
        desc: "Continue from the Shop or Contractors section.",
      },
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    heading: "A plan for every project",
    tiers: [
      {
        name: "START",
        tagline: "For your first project",
        price: "Free",
        period: "",
        rooms: "1 room",
        features: ["3D room design", "Render", "Estimate calculation"],
        cta: "Start for free",
      },
      {
        name: "PRO",
        tagline: "Feel the innovation",
        price: "299,000",
        period: "so'm/mo",
        rooms: "2 rooms",
        features: ["2-room design", "Render + 2 variants", "Automatic estimate"],
        cta: "Choose PRO",
        badge: "Popular",
      },
      {
        name: "MAX",
        tagline: "For the whole house",
        price: "999,000",
        period: "so'm/mo",
        rooms: "5–8 rooms",
        features: ["5–8 room 3D design", "Whole-house project", "Detailed estimate"],
        cta: "Choose MAX",
        badge: "Best value",
      },
    ],
    disclosure: "Paid plans launch soon — for now, every feature is free.",
  },
  finalCta: {
    headingPre: "Plan your renovation ",
    headingHighlight: "today",
    subheading: "Sign up and see your first room in 3D for free.",
    cta: "Start for free",
  },
  footer: {
    rights: "All rights reserved.",
  },
};

export const translations: Record<Locale, LandingCopy> = { uz, ru, en };
