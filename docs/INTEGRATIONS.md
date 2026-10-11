# Tashqi integratsiyalar

Loyiha qaysi tashqi xizmatlar bilan ishlaydi, yangi integratsiyani qanday
qo'shish kerak va marketpleyslar hamda to'lov tizimlari bo'yicha nimalar
aniqlangan. Sozlamalar: [CONFIGURATION.md](CONFIGURATION.md).

## Hozirgi integratsiyalar

| Xizmat | Fayl | Nima uchun | Uslub |
|---|---|---|---|
| Eskiz / Playmobile | `app/core/sms.py` | OTP SMS | Oddiy funksiyalar, timeout 10 s, retry yo'q. Xato `False` qaytaradi. |
| CBU (Markaziy bank) | `app/services/currency.py` | USD/UZS kursi | Timeout 8 s, jarayon ichida 1 soatlik kesh. Xato bo'lsa oxirgi ma'lum kurs ishlatiladi. Test: `respx`. |
| Gemini + Google Search | `app/services/market_prices.py` | Smetadagi bozor narxlari | Redis kesh, bir vaqtda 4 so'rov, kunlik limit, katalog narxi bilan solishtirib tekshirish. Xato `None` qaytaradi. |
| OpenAI-mos LLM | `app/services/llm.py` | AI dizayner, smeta yordamchisi | OpenAI SDK, retry, foydalanuvchiga kunlik byudjet. |
| Tripo | `app/services/tripo.py` | Rasmdan 3D model | Klient klassi, `transport` orqali testlanadi, 429 da `Retry-After` ni hisobga oladi, `TripoError`. |
| MyArchitectAI | `app/services/myarchitect.py` | Render | Tripo bilan bir xil uslub, `MyArchitectError`. |

**Namuna sifatida** `tripo.py` va `myarchitect.py` uslubini oling. Ular eng
puxta yozilgan: aniq timeout, retry, o'z xato turi, log va test qilinadigan transport.

## Yangi integratsiya qo'shish: tekshiruv ro'yxati

1. **Klient** `app/services/<xizmat>.py` da, klass ko'rinishida:
   - `httpx.AsyncClient`, aniq `timeout` va `transport` parametri (testlar uchun);
   - 429 va 5xx da cheklangan retry (`Retry-After` ni hurmat qiling);
   - o'z xato turi (`<Xizmat>Error`). Chaqiruvchi tomon xatoni ushlab, foydalanuvchi oqimini buzmasligi kerak;
   - `structlog` bilan log: so'rov nomi, status, davomiylik. **Kalit va shaxsiy ma'lumotni log qilmang.**
2. **Sozlamalar** `config.py` ga (izoh bilan), `.env.example` va [CONFIGURATION.md](CONFIGURATION.md) ga.
   Kalit bo'lmasa funksiya o'chiq turishi kerak (`<XIZMAT>_ENABLED` yoki bo'sh kalit).
3. **Limit va kesh:** pullik yoki limitli API uchun Redis keshi (`app/core/cache.py`) va foydalanuvchi limiti.
4. **Fon ishi:** uzoq yoki davriy ish Celery vazifasi bo'ladi (`app/tasks/`, `celery_app.py` dagi `include` va `task_routes`).
   Davriy ish uchun `beat_schedule` (hozir bo'sh). Vazifa idempotent bo'lsin: qayta ishga tushganda ma'lumotni ikki marta yozmasin.
5. **Testlar:** haqiqiy tarmoqqa chiqmasin. `respx` yoki `httpx.MockTransport` ishlating. Muvaffaqiyat, xato, timeout va 429 holatlarini tekshiring.
6. **Hujjat:** shu faylga jadval qatori va xizmatning qisqa tavsifi.

## Marketpleyslar: Uzum Market

2026-10-11 holatiga ko'ra aniqlangan (rasmiy spetsifikatsiya
`https://api-seller.uzum.uz/api/seller-openapi/swagger/api-docs` dan o'qilgan).

**Uzum Seller OpenAPI** (`https://api-seller.uzum.uz/api/seller-openapi`):
- Kalitni sotuvchi o'z kabinetida yaratadi (seller.uzum.uz → "API-ключи").
- Sarlavha: `Authorization: <kalit>`, **`Bearer` so'zisiz**.
- Faqat sotuvchining **o'z** do'konlari ("собственных магазинов"):

| Guruh | Endpoint'lar |
|---|---|
| Do'konlar | `GET /v1/shops` |
| Mahsulotlar | `GET /v1/product/shop/{shopId}` (SKU'lar), `POST /v1/product/{shopId}/sendPriceData` (narxni o'zgartirish), shtrix-kod va yorliqlar |
| Qoldiqlar | `GET /v3/fbs/sku/stocks`, `POST /v2/fbs/sku/stocks` |
| Buyurtmalar (FBS/DBS) | `GET /v2/fbs/orders`, `GET /v1/fbs/order/{id}`, tasdiqlash, bekor qilish, yetkazish, qaytarish |
| Moliya | `GET /v1/finance/orders`, `GET /v1/finance/expenses` |
| Yuk xatlari va qaytarishlar | FBO/FBS invoice va return endpoint'lari |

**Muhim xulosalar:**
- Sotuvchilarni sinxronlash **mumkin**: do'kon o'z kalitini ilovaga beradi, biz uning mahsulot, narx, qoldiq va buyurtmalarini o'qiymiz va yangilaymiz.
- Uzum'dagi **barcha** sotuvchilar narxini o'qiydigan ochiq API **yo'q**. Sahifalarni avtomatik yig'ish (scraping) Uzum shartlariga zid bo'lishi mumkin, tavsiya qilinmaydi.
  - Muqobillar: do'konlarning o'z Uzum narxlari (sinxron orqali), Gemini bozor narxlari, Uzum bilan hamkorlik shartnomasi.
- API'da mahsulot kartochkasini yaratish endpoint'i ko'rinmadi. Mahsulotni Uzum'ga chiqarish kabinet orqali bo'ladi deb hisoblang.
- Kabinetning ichki API'si (`/api/seller`) hujjatlanmagan va ogohlantirishsiz o'zgarishi mumkin, uni ishlatmang.

## To'lov tizimlari: Click, Payme

Ikkalasi ham server-server **Merchant API** va webhook (to'lov holati xabari) beradi.
Ulanish uchun yuridik shaxs yoki YaTT bilan shartnoma va test (sandbox) kalitlari kerak.
Bizda hozir to'lov yozuvlari jadvali ham, imzosi tekshiriladigan webhook endpoint'lari ham yo'q.

## Integratsiyalar uchun hali yo'q poydevor

Birinchi marketpleys yoki to'lov ulanishidan oldin qilinadi:

| Nima | Nima uchun |
|---|---|
| Umumiy HTTP klient asosi (Tripo uslubida) | Har bir yangi xizmat timeout, retry va xatoni bir xil boshqarsin. |
| Do'kon kalitlarini shifrlab saqlash | Har do'konning Uzum kaliti alohida. Kalit oddiy matnda saqlanmasin (`cryptography` kutubxonasi o'rnatilgan). |
| Mahsulotlarda `source`, `external_id`, `url`, `stock`, `last_synced_at` | Tashqi mahsulotni bizdagisiga bog'lash, qayta sinxronda dublikat yaratmaslik (upsert). |
| Sinxron jurnali (har ishga tushirish: boshlandi, tugadi, nechta yozildi, xatolar) | Nima va qachon sinxronlanganini ko'rish, xatolarni topish. |
| Celery `beat_schedule` va qulf | Davriy sinxron va bir vaqtda ikki marta ishlamaslik. |
| Imzoli webhook endpoint'lari va to'lovlar jadvali | Click/Payme uchun shart. |
| Hamkorlar uchun API kalitlari va umumiy rate limit | Tashqi tizimlar bizning API'mizga ulanadigan bo'lsa. |
