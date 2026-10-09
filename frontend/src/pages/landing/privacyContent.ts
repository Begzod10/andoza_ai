import type { Lang } from "./i18n";

/**
 * The contact the policy tells people to write to (access / deletion requests).
 * Set it before the page goes live: the page shows a plain "contact" line only
 * when this is non-empty, and Google Play requires a way to reach the operator.
 */
export const PRIVACY_CONTACT = "";

export const PRIVACY_UPDATED = "2026-10-09";

export interface PrivacySection {
  title: string;
  /** Paragraphs and, where a string starts with "• ", bullet points. */
  body: string[];
}

export interface PrivacyDoc {
  title: string;
  updated: string;
  intro: string;
  sections: PrivacySection[];
  contactLabel: string;
  back: string;
}

const uz: PrivacyDoc = {
  title: "Maxfiylik siyosati",
  updated: "Oxirgi yangilanish",
  intro:
    "Bu hujjat andoza.ai veb-sayti va Andoza AI mobil ilovasi (keyingi o'rinlarda — «xizmat») qanday ma'lumot to'plashi, nima uchun ishlatishi va kimga ko'rsatishini tushuntiradi. Xizmatdan foydalanib, siz shu shartlar bilan tanishganingizni tasdiqlaysiz.",
  sections: [
    {
      title: "1. Qanday ma'lumot to'playmiz",
      body: [
        "• Hisob: foydalanuvchi nomi yoki telefon raqami, ismingiz (ixtiyoriy) va parol. Parol faqat shifrlangan (xesh) ko'rinishda saqlanadi.",
        "• Loyihalaringiz: xonalar, o'lchamlar, dizayn tanlovlari, smetalar va buyurtmalar tarixi.",
        "• Yuklagan rasm va skanlaringiz: xonani LiDAR bilan skanerlash natijasi, siz yuklagan fotosuratlar, do'kon egalari yuklagan mahsulot rasmlari, ustalarning ish rasmlari.",
        "• Do'kon yoki usta profili: nom, tuman, telefon, Telegram, narx oralig'i (profil tasdiqlangach ommaga ko'rinadi).",
        "• Murojaat va buyurtmalar: yetkazish manzili, telefon raqami, to'lov usuli (faqat tanlov sifatida, karta ma'lumotlari saqlanmaydi) va do'kon yoki ustaga yozgan xabaringiz.",
        "• Texnik ma'lumot: xavfsizlik uchun so'rovlar jurnali (masalan, IP manzil), suiiste'molga qarshi cheklovlar uchun.",
      ],
    },
    {
      title: "2. Ilova ruxsatlari",
      body: [
        "• Kamera: xonani skanerlash va mahsulot yoki ish rasmini olish uchun.",
        "• Galereya: rasm tanlash uchun.",
        "• LiDAR (qo'llab-quvvatlovchi iPhone'larda): xonaning shaklini o'lchash uchun.",
        "Joylashuvingizni (GPS) so'ramaymiz va to'plamaymiz.",
      ],
    },
    {
      title: "3. Ma'lumotdan qanday foydalanamiz",
      body: [
        "• Xonani 3D ko'rsatish, smeta hisoblash va dizayn takliflarini berish.",
        "• Hisobingizga kirishni ta'minlash (telefon raqamiga SMS kod yuboriladi).",
        "• Do'kon va ustalar bilan aloqani yo'lga qo'yish: siz yuborgan murojaatni tegishli do'kon yoki usta ko'radi.",
        "• Xavfsizlik, suiiste'molning oldini olish va xizmatni yaxshilash.",
        "Ma'lumotingizni sotmaymiz va reklama maqsadida uchinchi tomonlarga bermaymiz.",
      ],
    },
    {
      title: "4. Kimlarga uzatiladi",
      body: [
        "Xizmat ishlashi uchun quyidagi tashqi xizmatlardan foydalanamiz; ularga faqat kerakli ma'lumot yuboriladi:",
        "• SMS provayder (Eskiz yoki Playmobile): kirish kodini yuborish uchun telefon raqamingiz.",
        "• Sun'iy intellekt xizmatlari (OpenAI yoki Google Gemini): AI dizayner va tushuntirishlar uchun sizning matn so'rovingiz va xona haqidagi umumiy ma'lumot.",
        "• Tripo (3D model yaratish): mahsulot rasmidan 3D model yaratilganda o'sha rasm.",
        "• OpenStreetMap: ustalar xaritasini ko'rsatish uchun xarita bo'laklari so'raladi, bunda qurilmangizning IP manzili ko'rinadi.",
        "• Serverlar va fayl saqlash: ma'lumotlar xavfsiz serverlarda saqlanadi.",
        "Qonun talab qilgan hollarda vakolatli organlarga ma'lumot berishimiz mumkin.",
      ],
    },
    {
      title: "5. Ommaga ko'rinadigan ma'lumot",
      body: [
        "Tasdiqlangan do'kon va usta profillari (nom, tuman, aloqa ma'lumotlari, rasmlar) boshqa foydalanuvchilarga ko'rinadi. Ularni profil sozlamalarida tahrirlashingiz mumkin. Xonangizni «ulashish» havolasi orqali ulashsangiz, havolani olgan har kim uni ko'ra oladi.",
      ],
    },
    {
      title: "6. Saqlash va o'chirish",
      body: [
        "Ma'lumotlarni hisobingiz mavjud ekan saqlaymiz. Hisobingizni va unga bog'liq ma'lumotlarni (loyihalar, rasmlar, profil) o'chirishni so'rash uchun quyidagi aloqa manziliga yozing. So'rovni ko'rib chiqib, ma'lumotlarni qonuniy talablar doirasida o'chiramiz.",
      ],
    },
    {
      title: "7. Xavfsizlik",
      body: [
        "Ma'lumot uzatish HTTPS orqali himoyalanadi, parollar xesh ko'rinishida saqlanadi, SMS kod urinishlariga cheklov qo'yilgan. Hech bir tizim mutlaq xavfsiz emas, shuning uchun parolingizni begonalarga bermang.",
      ],
    },
    {
      title: "8. Bolalar",
      body: ["Xizmat 16 yoshga to'lmaganlar uchun mo'ljallanmagan va ularning ma'lumotini bila turib to'plamaymiz."],
    },
    {
      title: "9. O'zgarishlar",
      body: ["Siyosatni yangilasak, shu sahifada yangi sana bilan e'lon qilamiz."],
    },
  ],
  contactLabel: "Aloqa",
  back: "Bosh sahifaga",
};

const ru: PrivacyDoc = {
  title: "Политика конфиденциальности",
  updated: "Последнее обновление",
  intro:
    "Этот документ объясняет, какие данные собирают сайт andoza.ai и мобильное приложение Andoza AI (далее — «сервис»), зачем они нужны и кому показываются. Пользуясь сервисом, вы подтверждаете, что ознакомились с этими условиями.",
  sections: [
    {
      title: "1. Какие данные мы собираем",
      body: [
        "• Аккаунт: имя пользователя или номер телефона, имя (необязательно) и пароль. Пароль хранится только в зашифрованном (хеш) виде.",
        "• Ваши проекты: комнаты, размеры, выбор дизайна, сметы и история заказов.",
        "• Загруженные фото и сканы: результат LiDAR-сканирования комнаты, ваши фотографии, фото товаров от владельцев магазинов, фото работ мастеров.",
        "• Профиль магазина или мастера: название, район, телефон, Telegram, диапазон цен (после одобрения виден всем).",
        "• Обращения и заказы: адрес доставки, телефон, способ оплаты (только как выбор, данные карты не сохраняются) и ваше сообщение магазину или мастеру.",
        "• Технические данные: журнал запросов для безопасности (например, IP-адрес) и ограничений против злоупотреблений.",
      ],
    },
    {
      title: "2. Разрешения приложения",
      body: [
        "• Камера: для сканирования комнаты и съёмки фото товара или работы.",
        "• Галерея: для выбора фото.",
        "• LiDAR (на поддерживаемых iPhone): для измерения формы комнаты.",
        "Геолокацию (GPS) мы не запрашиваем и не собираем.",
      ],
    },
    {
      title: "3. Как мы используем данные",
      body: [
        "• Показ комнаты в 3D, расчёт сметы и предложения по дизайну.",
        "• Вход в аккаунт (на номер телефона отправляется SMS-код).",
        "• Связь с магазинами и мастерами: отправленное вами обращение видит соответствующий магазин или мастер.",
        "• Безопасность, защита от злоупотреблений и улучшение сервиса.",
        "Мы не продаём ваши данные и не передаём их третьим лицам для рекламы.",
      ],
    },
    {
      title: "4. Кому передаются данные",
      body: [
        "Для работы сервиса мы используем внешние сервисы; им передаются только необходимые данные:",
        "• SMS-провайдер (Eskiz или Playmobile): номер телефона для отправки кода входа.",
        "• Сервисы ИИ (OpenAI или Google Gemini): ваш текстовый запрос и общие сведения о комнате для ИИ-дизайнера и пояснений.",
        "• Tripo (создание 3D-моделей): фото товара, когда по нему создаётся 3D-модель.",
        "• OpenStreetMap: для показа карты мастеров запрашиваются фрагменты карты, при этом виден IP-адрес устройства.",
        "• Серверы и хранение файлов: данные хранятся на защищённых серверах.",
        "По требованию закона мы можем передать данные уполномоченным органам.",
      ],
    },
    {
      title: "5. Публично видимые данные",
      body: [
        "Одобренные профили магазинов и мастеров (название, район, контакты, фото) видны другим пользователям. Вы можете изменить их в настройках профиля. Если вы делитесь комнатой по ссылке, её увидит каждый, у кого есть ссылка.",
      ],
    },
    {
      title: "6. Хранение и удаление",
      body: [
        "Мы храним данные, пока существует ваш аккаунт. Чтобы удалить аккаунт и связанные данные (проекты, фото, профиль), напишите по контакту ниже. Мы рассмотрим запрос и удалим данные в рамках требований закона.",
      ],
    },
    {
      title: "7. Безопасность",
      body: [
        "Передача данных защищена HTTPS, пароли хранятся в виде хеша, на попытки ввода SMS-кода действуют ограничения. Ни одна система не абсолютно безопасна, поэтому не сообщайте пароль посторонним.",
      ],
    },
    {
      title: "8. Дети",
      body: ["Сервис не предназначен для лиц младше 16 лет, и мы сознательно не собираем их данные."],
    },
    {
      title: "9. Изменения",
      body: ["При обновлении политики мы опубликуем её на этой странице с новой датой."],
    },
  ],
  contactLabel: "Контакт",
  back: "На главную",
};

const en: PrivacyDoc = {
  title: "Privacy Policy",
  updated: "Last updated",
  intro:
    "This document explains what data the andoza.ai website and the Andoza AI mobile app (the \"service\") collect, why, and who can see it. By using the service you confirm that you have read these terms.",
  sections: [
    {
      title: "1. What we collect",
      body: [
        "• Account: username or phone number, your name (optional) and a password. The password is stored only as a hash.",
        "• Your projects: rooms, dimensions, design choices, estimates and order history.",
        "• Photos and scans you upload: LiDAR room scans, your photos, product photos from shop owners, work photos from craftsmen.",
        "• Shop or craftsman profile: name, district, phone, Telegram, price range (public once approved).",
        "• Requests and orders: delivery address, phone number, payment method (a choice only; card details are not stored) and your message to a shop or craftsman.",
        "• Technical data: a request log for security (such as the IP address) and abuse limits.",
      ],
    },
    {
      title: "2. App permissions",
      body: [
        "• Camera: to scan a room and take product or work photos.",
        "• Photo library: to pick pictures.",
        "• LiDAR (on supported iPhones): to measure the shape of a room.",
        "We do not ask for or collect your location (GPS).",
      ],
    },
    {
      title: "3. How we use it",
      body: [
        "• Show your room in 3D, calculate estimates and suggest designs.",
        "• Sign you in (a code is sent to your phone by SMS).",
        "• Connect you with shops and craftsmen: the shop or craftsman you contact sees your request.",
        "• Security, abuse prevention and improving the service.",
        "We do not sell your data or share it with third parties for advertising.",
      ],
    },
    {
      title: "4. Who receives it",
      body: [
        "We use outside services to run the app; they receive only what they need:",
        "• SMS provider (Eskiz or Playmobile): your phone number, to send the sign-in code.",
        "• AI services (OpenAI or Google Gemini): your text prompt and general information about the room, for the AI designer and explanations.",
        "• Tripo (3D model generation): a product photo when a 3D model is made from it.",
        "• OpenStreetMap: map tiles are requested to show the craftsmen map, which exposes your device's IP address.",
        "• Servers and file storage: data is kept on protected servers.",
        "We may disclose data to authorities where the law requires it.",
      ],
    },
    {
      title: "5. Publicly visible data",
      body: [
        "Approved shop and craftsman profiles (name, district, contact details, photos) are visible to other users. You can edit them in your profile settings. If you share a room by link, anyone with the link can view it.",
      ],
    },
    {
      title: "6. Retention and deletion",
      body: [
        "We keep data while your account exists. To have your account and its data (projects, photos, profile) deleted, write to the contact below. We will review the request and delete the data as the law allows.",
      ],
    },
    {
      title: "7. Security",
      body: [
        "Data in transit is protected by HTTPS, passwords are stored as hashes, and SMS code attempts are rate limited. No system is perfectly secure, so do not share your password.",
      ],
    },
    {
      title: "8. Children",
      body: ["The service is not meant for people under 16, and we do not knowingly collect their data."],
    },
    {
      title: "9. Changes",
      body: ["If we update this policy we will publish it on this page with a new date."],
    },
  ],
  contactLabel: "Contact",
  back: "Back to home",
};

export const PRIVACY: Record<Lang, PrivacyDoc> = { uz, ru, en };
