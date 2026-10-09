import type { Lang } from "./i18n";

export interface DeleteAccountSection {
  title: string;
  /** Paragraphs and, where a string starts with "• ", bullet points. */
  body: string[];
}

export interface DeleteAccountDoc {
  title: string;
  intro: string;
  sections: DeleteAccountSection[];
  login: string;
  back: string;
}

const uz: DeleteAccountDoc = {
  title: "Hisobni o'chirish",
  intro: "andoza.ai hisobingizni va unga bog'liq ma'lumotlarni o'zingiz o'chirishingiz mumkin. Buning uchun alohida so'rov yozish shart emas.",
  sections: [
    {
      title: "Ilovada",
      body: ["• andoza.ai ilovasiga kiring.", "• Profil bo'limini oching.", "• \"Hisobni o'chirish\" tugmasini bosing, parolingizni kiriting (telefon kodi bilan kirgan bo'lsangiz parol so'ralmaydi) va tasdiqlang."],
    },
    {
      title: "Saytda",
      body: ["• Pastdagi \"Kirish\" tugmasi orqali hisobingizga kiring.", "• Profil → Hisobni o'chirish bo'limiga o'ting.", "• Ma'lumotlarni o'qib chiqib, o'chirishni tasdiqlang."],
    },
    {
      title: "Nima o'chiriladi",
      body: [
        "Tasdiqlagan zahoti quyidagilar butunlay o'chiriladi va tiklab bo'lmaydi:",
        "• hisobingiz va profilingiz;",
        "• barcha loyihalar, xonalar va dizaynlar;",
        "• yuklangan rasmlar va 3D modellar;",
        "• buyurtmalar;",
        "• do'kon yoki usta profili (agar bo'lsa).",
      ],
    },
    {
      title: "Nima saqlanishi mumkin",
      body: ["Xavfsizlik uchun server jurnallari (masalan, kirish urinishlari) cheklangan muddat saqlanishi mumkin, so'ng o'chiriladi. Ular sizning loyihalaringiz yoki rasmlaringizni o'z ichiga olmaydi."],
    },
  ],
  login: "Kirish",
  back: "Bosh sahifaga qaytish",
};

const ru: DeleteAccountDoc = {
  title: "Удаление аккаунта",
  intro: "Вы можете сами удалить аккаунт andoza.ai и связанные с ним данные. Отдельный запрос писать не нужно.",
  sections: [
    {
      title: "В приложении",
      body: ["• Войдите в приложение andoza.ai.", "• Откройте раздел «Профиль».", "• Нажмите «Удалить аккаунт», введите пароль (если вы входили по коду из SMS, пароль не нужен) и подтвердите."],
    },
    {
      title: "На сайте",
      body: ["• Войдите в аккаунт кнопкой «Войти» ниже.", "• Перейдите в Профиль → Удаление аккаунта.", "• Прочитайте, что будет удалено, и подтвердите."],
    },
    {
      title: "Что удаляется",
      body: [
        "Сразу после подтверждения безвозвратно удаляются:",
        "• аккаунт и профиль;",
        "• все проекты, комнаты и дизайны;",
        "• загруженные фото и 3D-модели;",
        "• заказы;",
        "• профиль магазина или мастера (если есть).",
      ],
    },
    {
      title: "Что может сохраниться",
      body: ["Серверные журналы в целях безопасности (например, попытки входа) могут храниться ограниченное время, затем удаляются. Они не содержат ваших проектов и фото."],
    },
  ],
  login: "Войти",
  back: "На главную",
};

const en: DeleteAccountDoc = {
  title: "Delete account",
  intro: "You can delete your andoza.ai account and its data yourself. You do not need to send a separate request.",
  sections: [
    {
      title: "In the app",
      body: ["• Sign in to the andoza.ai app.", "• Open Profile.", "• Tap \"Delete account\", enter your password (not needed if you signed in with a phone code) and confirm."],
    },
    {
      title: "On the website",
      body: ["• Sign in with the \"Sign in\" button below.", "• Go to Profile → Delete account.", "• Read what will be deleted and confirm."],
    },
    {
      title: "What is deleted",
      body: [
        "As soon as you confirm, the following is permanently deleted and cannot be restored:",
        "• your account and profile;",
        "• all projects, rooms and designs;",
        "• uploaded photos and 3D models;",
        "• orders;",
        "• your shop or craftsman (usta) profile, if you have one.",
      ],
    },
    {
      title: "What may be kept",
      body: ["Server logs kept for security (for example sign-in attempts) may be retained for a limited time and then removed. They do not contain your projects or photos."],
    },
  ],
  login: "Sign in",
  back: "Back to home",
};

export const DELETE_ACCOUNT: Record<Lang, DeleteAccountDoc> = { uz, ru, en };
