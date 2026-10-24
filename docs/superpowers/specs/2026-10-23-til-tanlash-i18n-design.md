# Til tanlash: o'zbek, rus, ingliz (web interfeysi va backend xabarlari)

Sana: 2026-10-23. Holat: tasdiqlash uchun.

## Maqsad
Hozir web ilova faqat o'zbekcha ishlaydi. Foydalanuvchi profil sahifasida tilni tanlay olishi kerak (O'zbekcha / Русский / English), va web interfeysdagi barcha matn hamda serverdan keladigan xato xabarlari shu tilda chiqishi kerak.

**Muvaffaqiyat mezoni:**
- profil sahifasidagi "Til" bo'limida til tanlanadi va butun web interfeys sahifani qayta yuklamasdan shu tilga o'tadi;
- kirgan foydalanuvchining tili akkauntida saqlanadi: boshqa brauzerda kirsa ham o'sha til chiqadi; kirmagan foydalanuvchining tanlovi brauzerda saqlanadi;
- interfeysda kalitsiz qolgan o'zbekcha matn yo'q (test tekshiradi), uchala til fayli bir xil kalitlarga ega;
- server xato xabarlari (`detail`) tanlangan tilda keladi; tarjimasi yo'q matn o'zbekcha qoladi, lekin test hamma matn lug'atda borligini tekshiradi;
- mobil ilova va boshqa mijozlar uchun hech narsa o'zgarmaydi (sarlavha yubormasa, o'zbekcha).

## Doira
**Kiradi:** react-i18next tizimi; `uz`/`ru`/`en` til fayllari; barcha web sahifa va komponentlardagi matnlar; profil va sahifa yuqorisidagi til tanlagich; `users.language` ustuni va `PATCH /auth/me`; `Accept-Language` bo'yicha backend xabarlari tarjimasi; pul, sana va son formatlari; `<html lang>`.

**Kirmaydi (keyingi bosqichlar):**
- AI javoblari (dizayn sarlavhasi, izohi, smeta yordamchisi) — o'zbekcha qoladi;
- katalog ma'lumotlari: mebel, material, do'kon nomlari va tayyor uslub nomlari (ular ma'lumot, interfeys matni emas); tayyor uslublar ro'yxatidagi *sarlavha va izohlar* interfeys bo'lgani uchun tarjima qilinadi, preset `id` lari o'zgarmaydi;
- mobil ilova;
- push bildirishnoma va SMS matnlari;
- kirill yozuvidagi o'zbek tili.

---

## 1. Frontend i18n tizimi
- Kutubxonalar: `i18next`, `react-i18next` (aniq versiyalar `package.json` da qotiriladi).
- Fayllar: `frontend/src/i18n/index.ts` (sozlash), `frontend/src/i18n/locales/uz.json` (manba), `ru.json`, `en.json`.
- Mavjud `frontend/src/locale/uz.ts` kalitlari `uz.json` ga o'z nomlari bilan ko'chiriladi va `uz.ts` o'chiriladi; uni ishlatgan 19 fayl `t("...")` ga o'tadi.
- Kalitlar bo'lim bo'yicha nomlanadi: `common.*`, `auth.*`, `profile.*`, `landing.*`, `projects.*`, `wizard.*`, `studio.*`, `ai.*`, `smeta.*`, `dokon.*`, `seller.*`, `admin.*`, `ustalar.*`, `privacy.*`, `errors.*`.
- TypeScript: `uz.json` resurs turidan kalitlar tipi chiqariladi (`declare module "i18next"` → `CustomTypeOptions`), noto'g'ri kalit `tsc` da xato beradi.
- O'zgaruvchilar `{{nomi}}`, ko'plik `_one`/`_other` (rus tili uchun `_few`/`_many` ham) i18next qoidasi bilan.
- Fallback tili `uz`. Tarjima yo'q kalit o'zbekcha ko'rsatiladi.
- Test muhitida til `uz` qotiriladi: mavjud testlar o'zbekcha matn bo'yicha ishlashda davom etadi.

## 2. Til tanlovi va saqlash
- **Holat:** `useLocale()` hook: `{ language, setLanguage }`; `language ∈ {"uz","ru","en"}`.
- **Boshlang'ich til tartibi:** (1) kirgan foydalanuvchining `user.language`; (2) `localStorage["andoza.lang"]`; (3) brauzer tili (`navigator.language` `ru*` → `ru`, `en*` → `en`); (4) `uz`.
- **O'zgartirish:** `setLanguage` i18next tilini almashtiradi, `localStorage` ga yozadi, `<html lang>` ni yangilaydi va foydalanuvchi kirgan bo'lsa `PATCH /auth/me {language}` yuboradi (xato bo'lsa interfeys tili baribir o'zgaradi, xabar ko'rsatilmaydi).
- **Kirish:** login/register javobidagi `user.language` qo'llanadi va `localStorage` ga yoziladi.
- **Profil sahifasi:** `ProfilePage.tsx` da "Til" bo'limi — uchta variant (`O'zbekcha`, `Русский`, `English` — har biri o'z tilida yoziladi), tanlangani belgilanadi.
- **Kirmaganlar uchun:** landing va auth sahifalarining yuqori qismida ixcham tanlagich (`LanguageSwitcher`, xuddi shu `setLanguage`).
- **Formatlar:** `formatUZS` va sana formatlari tilga qarab: pul birligi `so'm` / `сум` / `UZS`, raqam ajratgichi bo'shliq (uz, ru) yoki vergul (en). `Intl` locale: `uz-UZ`, `ru-RU`, `en-US`.

## 3. Backend
- **Migratsiya:** `users.language` — `String(5)`, `nullable=False`, `server_default='uz'`, `CHECK language IN ('uz','ru','en')`.
- **Schema:** `UserOut.language: str` (qo'shimcha maydon — eski mijozlar e'tiborsiz qoldiradi).
- **Endpoint:** `PATCH /api/v1/auth/me` body `{"language": "uz"|"ru"|"en"}` → `UserOut`; noto'g'ri qiymat 422. (Hozir `/auth/me` faqat `GET`.)
- **Xabarlar tarjimasi:**
  - `backend/app/i18n/messages.py`: `MESSAGES: dict[str, dict[str, str]]` — kalit o'zbekcha matnning o'zi, qiymat `{"ru": ..., "en": ...}`.
  - `request_language(request) -> "uz"|"ru"|"en"`: `Accept-Language` sarlavhasidan (birinchi mos til; bo'lmasa `uz`).
  - `main.py` dagi `StarletteHTTPException` handler: `detail` matn (str) bo'lsa va til `uz` bo'lmasa, `MESSAGES` dan tarjimani qo'yadi; topilmasa o'zbekcha qoldiradi. Ro'yxat ko'rinishidagi `detail` (pydantic) o'zgarmaydi.
  - Global 404 handler (`main.py`) barcha 404 matnini `"Not found"` ga almashtiradi; bu xulq o'zgarmaydi (u tarjimadan keyin ham `"Not found"` qoladi). O'z matnini qaytaradigan 404'lar (masalan, Pinterest pin) `JSONResponse` orqali keladi va ularning matni `translate_detail` bilan tarjima qilinadi.
  - Matn ichida o'zgaruvchi bo'lgan xabarlar (`f"... {x} ..."`) uchun `MESSAGES` kaliti shablon ko'rinishida bo'ladi (`"styles {ro'yxat} dan bo'lishi kerak"` kabi); bunday xabarlar router'da `translate_detail(template, **values)` orqali qurilishi uchun o'zgartiriladi. Ularning ro'yxati plan bosqichida aniqlanadi.
- **Test:** routerlardagi barcha o'zbekcha `detail="..."` satrlari skript bilan yig'iladi va `MESSAGES` da `ru` va `en` tarjimasi borligi tekshiriladi.

## 4. Frontend → backend
- `apiClient` har so'rovga `Accept-Language: <joriy til>` qo'shadi.
- Xato matnlari (`errorMessage`) serverdan kelganini ko'rsatadi — endi u tanlangan tilda bo'ladi.

## 5. Matnlarni ko'chirish tartibi
Matnlar bo'limlar bo'yicha, har biri alohida task:
1. tizim, `locale/uz.ts` ko'chirish, `common`, layout va navigatsiya;
2. auth va profil (til tanlagich bilan);
3. landing, maxfiylik va akkaunt o'chirish sahifalari;
4. loyihalar va wizard;
5. studiya (eng katta: panellar, menyular, AI sheet, tayyor uslublar);
6. smeta;
7. do'kon, sotuvchi, admin va usta sahifalari.

Har task: matnlarni kalitga ko'chirish, uchala tilga tarjima, testlar yashil, `tsc` toza.

## 6. Tarjima sifati
- Tarjimani AI (shu ishni bajaruvchi) tayyorlaydi; foydalanuvchi keyin ko'rib chiqadi.
- Qurilish va ta'mir atamalari bir xil bo'lishi uchun lug'at: `docs/i18n-glossary.md` (suvoq → штукатурка / plaster, shpaklovka → шпаклёвка / putty, galtel → потолочный плинтус / cornice, smeta → смета / estimate, usta → мастер / craftsman va hokazo).
- Brend nomi "andoza.ai" tarjima qilinmaydi.

## 7. Testlar
- **Kalitlar to'liqligi:** `uz.json`, `ru.json`, `en.json` kalitlari bir xil; bo'sh qiymat yo'q.
- **Kalitsiz matn qolmaganligi:** `src/**/*.tsx` (testlardan tashqari) JSX matn va `label`/`placeholder`/`title`/`aria-label` atributlarida o'zbekcha harf birikmalari (`o'`, `g'`, `sh`, `ch` bilan so'z) qolmaganini tekshiruvchi test; ruxsat berilgan istisnolar ro'yxati bilan (brend, til nomlari).
- **Til almashtirish:** profilda tanlash → matnlar rus/ingliz tiliga o'tadi, `localStorage` va `PATCH /auth/me` chaqiriladi; kirishda `user.language` qo'llanadi; boshlang'ich til tartibi.
- **Format:** `formatUZS` uch tilda.
- **Backend:** migratsiya upgrade/downgrade; `PATCH /auth/me` (to'g'ri, noto'g'ri qiymat, kirmagan → 401); `Accept-Language: ru` bilan 422/404/409 xabar ruscha; sarlavhasiz o'zbekcha; `MESSAGES` to'liqligi; pydantic ro'yxat xatolari o'zgarmasligi.
