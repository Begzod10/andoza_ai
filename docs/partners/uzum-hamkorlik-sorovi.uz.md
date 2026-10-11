# andoza.ai × Uzum Market: hamkorlik bo'yicha texnik so'rov

**Kimdan:** andoza.ai — [kompaniya rasmiy nomi, STIR]
**Kimga:** Uzum Market, hamkorlik va integratsiyalar bo'limi
**Sana:** [sana]
**Aloqa:** [ism, lavozim, telefon, e-mail, Telegram]

## 1. Biz kimmiz

andoza.ai — O'zbekistonda uy va kvartira ta'miri uchun onlayn platforma
(https://andoza.jumaniyozov.uz, veb va iOS ilova). Foydalanuvchi:

1. xonasini o'lchaydi: qo'lda yoki telefon LiDAR skaneri bilan;
2. 3D studiyada dizayn qiladi: devor, pol, shift qoplamalari, mebel, yoritish;
3. ta'mir **smetasini** oladi: qaysi materialdan qancha kerakligi va qancha turishi;
4. kerakli tovarlarni buyurtma qiladi yoki usta topadi.

Foydalanuvchilar soni: [son]. Oylik faol foydalanuvchilar: [son]. Oyiga tuziladigan smetalar: [son].

## 2. Nega Uzum Market

Smeta har bir foydalanuvchiga **aniq tovarlar ro'yxatini** beradi: bo'yoq, shpaklyovka,
oboy, laminat, plitka, santexnika, chiroqlar, mebel. Biz shu ro'yxatdagi har bir
qator yoniga Uzum Market'dagi mos tovarni, uning narxini va xarid havolasini
ko'rsatmoqchimiz.

**Uzum uchun foydasi:**
- xarid qilishga tayyor auditoriya: foydalanuvchi aynan nima va qancha kerakligini allaqachon bilgan bo'ladi;
- har bir o'tish va xarid kuzatiladigan havolalar orqali (affiliate yoki UTM);
- smeta orqali katta savat: bitta xona uchun o'nlab tovar.

## 3. Bizga kerak bo'lgan ma'lumotlar

### Kategoriyalar
Qurilish va ta'mir materiallari, bo'yoqlar va laklar, oboylar, pol qoplamalari
(laminat, parket, linoleum, plitka), devor va shift materiallari, santexnika,
elektr va yoritish, mebel, uy jihozlari va dekor.

### Har bir tovar bo'yicha maydonlar
| Maydon | Majburiy | Izoh |
|---|---|---|
| Tovar identifikatori (SKU/ID) | ha | Qayta yangilashda bir tovarni aniqlash uchun |
| Nomi (o'zbekcha va/yoki ruscha) | ha | |
| Kategoriya | ha | Uzum kategoriyalar daraxti |
| Narx va chegirmali narx (so'm) | ha | |
| Mavjudligi (bor yoki yo'q, qoldiq) | ha | |
| Tovar sahifasi havolasi | ha | Foydalanuvchini Uzum'ga yo'naltirish uchun |
| Asosiy rasm | ha | |
| O'lchov birligi va o'ram | tavsiya | m², litr, kg, dona, rulon. Masalan "10 l chelak", "rulon 10,05 × 1,06 m". Smetada miqdorni to'g'ri hisoblash uchun juda muhim. |
| Xususiyatlar (rang, o'lcham, material) | tavsiya | |
| Brend | tavsiya | |
| Reyting va sharhlar soni | ixtiyoriy | |
| Yetkazib berish muddati | ixtiyoriy | |

## 4. Format va texnik shartlar

Quyidagilardan birortasi bizga mos keladi. Qaysi biri Uzum uchun qulayligini bilmoqchimiz:

1. **REST API** (JSON): kategoriya, kalit so'z va SKU bo'yicha qidiruv, sahifalash (pagination).
2. **Feed fayl**: kuniga 1 marta yangilanadigan JSON, XML yoki YML fayl (barcha tovarlar yoki kategoriyalar bo'yicha).
3. **Kombinatsiya**: kunlik feed hamda narx va mavjudlik uchun tezkor API.

**Biz uchun maqbul parametrlar:**
- narx va mavjudlik yangilanishi: kuniga kamida 1 marta;
- autentifikatsiya: hamkorga beriladigan API kalit (server-server, foydalanuvchi ishtirokisiz);
- so'rov limitlari: Uzum belgilaydi, biz keshlaymiz va limitga rioya qilamiz;
- test (sandbox) muhiti yoki namunaviy ma'lumot — integratsiyani sinash uchun.

## 5. Biz taklif qiladigan shartlar

- Har bir tovar **"Uzum Market" belgisi** bilan va Uzum sahifasiga havola orqali ko'rsatiladi.
- Havolalarda Uzum bergan **affiliate yoki UTM identifikatori** bo'ladi. Biz o'tishlar statistikasini berishga tayyormiz.
- Narxlar ko'pi bilan [24] soat keshlanadi va eskirgan narx foydalanuvchiga belgilanadi.
- Ma'lumotlar faqat andoza.ai ichida foydalanuvchiga ko'rsatish uchun ishlatiladi. Uchinchi shaxslarga berilmaydi va qayta sotilmaydi.
- Uzum va bizning o'rtamizda **foydalanuvchilarning shaxsiy ma'lumotlari almashilmaydi**.
- Uzum talab qilsa, ma'lumotni ko'rsatishni darhol to'xtatamiz.

## 6. Birinchi bosqich doirasi

1. Uzum tovarlari faqat **smeta** va **katalog** sahifalarida, tegishli material qatori yonida ko'rsatiladi.
2. Xarid Uzum Market'ning o'zida amalga oshiriladi, biz faqat yo'naltiramiz.
3. Muddat: Uzum spetsifikatsiyasi va kalitlari olingandan keyin taxminan [2–4] hafta.

## 7. Bizdan savollar

1. Hamkorlar uchun katalog API yoki feed mavjudmi? Bor bo'lsa, hujjatini qanday olamiz?
2. Affiliate dasturi bormi va uning shartlari (komissiya, cookie muddati) qanday?
3. Tovar ma'lumotlari va rasmlarini ko'rsatish bo'yicha brend va huquqiy talablar qanday?
4. So'rov limitlari va yangilanish chastotasi qanday?
5. Test muhiti yoki namunaviy ma'lumot berish imkoni bormi?
6. Shartnoma uchun qanday hujjatlar kerak?

## 8. Bizning texnik tomonimiz

- Backend: Python (FastAPI), PostgreSQL, Redis, fon ishlari uchun Celery.
- Integratsiyada: faqat server-server so'rovlar va HTTPS. Uzum kaliti faqat serverda, shifrlangan holda saqlanadi.
- Ma'lumot fonda, jadval bo'yicha yangilanadi. Xatolar va limitlar kuzatiladi.
- Mas'ul texnik shaxs: [ism, aloqa].
