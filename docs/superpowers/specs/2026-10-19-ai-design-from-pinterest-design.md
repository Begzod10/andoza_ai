# Pinterest havolasidan AI dizayn (Pinterest integratsiyasining 2-bosqichi)

Sana: 2026-10-19. Holat: tasdiqlash uchun.
1-bosqich (rasm yuklash): [2026-10-19-ai-design-from-image-design.md](2026-10-19-ai-design-from-image-design.md). U production'da ishlayapti.

## Maqsad
Foydalanuvchi rasmni yuklab olib qayta yuklash o'rniga, Pinterest pin havolasini qo'yadi. Server pin rasmini oladi va uni 1-bosqichdagi "rasmdan dizayn" quvuriga beradi.

**Muvaffaqiyat mezoni:**
- studiyada pin havolasi qo'yilsa, rasm yuklagandagidek qo'llanadigan reja keladi;
- javobda qaysi rasm olinganini ko'rsatadigan `pin_image_url` bo'ladi;
- server faqat Pinterest'ning ma'lum hostlariga murojaat qiladi (SSRF yo'q);
- Pinterest tomondagi xato yoki noto'g'ri havola limitni yemaydi;
- 1-bosqich endpoint'i va uning mijozlari o'zgarmaydi.

## Doira
**Kiradi:**
- backend endpoint;
- Pinterest havolasini tekshirish va pin rasmini olish moduli;
- web studiyadagi AI sheet;
- testlar;
- mobil handoff bo'limi.

**Kirmaydi:**
- **Mobil "Share → andoza.ai"** — mobil repo, alohida sessiya. Handoff'da tasvirlanadi.
- **Doska yoki profil havolasidan bir nechta pin** — bitta pin.
- **Pinterest akkauntini ulash (OAuth)** — 3-bosqich, faqat talab bo'lsa.
- **Instagram, Houzz va boshqa saytlar.** Faqat Pinterest.
- **Pin sahifasi HTML'ini o'qish (scraping)** — qilinmaydi.

## Dalillar (2026-10-19 tekshiruv)
- Rasmiy v5 API boshqa odamlarning ommaviy pinlarini OAuth'siz bermaydi.
- Pinterest qoidalari scraping'ni taqiqlaganga o'xshaydi. Buni uchinchi tomon manbasi aytadi, Pinterest sahifasida tasdiqlanmagan.
- **oEmbed:** `https://www.pinterest.com/oembed.json?url=https://www.pinterest.com/pin/<id>/` 200 qaytaradi va `thumbnail_url` beradi (`https://i.pinimg.com/236x/…jpg`, 236 px).
  - mintaqaviy domen (`mx.pinterest.com`) ham ishlaydi;
  - slug'li havola (`/pin/<slug>--<id>/`) 400 qaytaradi, ID ajratilgandan keyin esa 200;
  - mavjud bo'lmagan ID uchun javob kelmadi (timeout).
- **pinimg CDN:** xuddi shu yo'lda `/736x/` va `/originals/` ham ochiq (200, `image/jpeg`, taxminan 100 KB).
- oEmbed ham, `736x` konvensiyasi ham Pinterest tomonidan hujjatlashtirilmagan.

## Asosiy qarorlar
1. **Server oEmbed orqali oladi.** Brauzerda olish (CORS va mijozlarda takrorlanadigan mantiq) va HTML'dan `og:image` o'qish (scraping) ham ko'rib chiqildi. oEmbed — Pinterest'ning pinlarni joylashtirish uchun bergan mexanizmi, so'rov esa foydalanuvchi bosganida bitta pin uchun yuboriladi.
2. **Qat'iy hostlar ro'yxati.** Server faqat shu hostlarga murojaat qiladi:
   - `pin.it` (qisqa havola);
   - Pinterest domenlari (pastdagi qoida);
   - `www.pinterest.com` (oEmbed, doimiy manzil);
   - `i.pinimg.com` (rasm).

   Avtomatik yo'naltirish hech qayerda yoqilmaydi.
3. **Imkon qadar katta rasm.** `/236x/` `/736x/` ga almashtiriladi. 736x bo'lmasa, oEmbed bergan asl `thumbnail_url` olinadi.
4. **1-bosqich quvuri o'zgarishsiz:** `prepare_design_image`, umumiy `image_design` limiti (`IMAGE_DESIGN_DAILY_LIMIT`), `design_room(image=…)` va `image_notes`.

## Backend

### API
`POST /api/v1/rooms/{room_id}/ai-design/pin`, `application/json`.

| Maydon | Turi | Majburiy | Cheklov |
|---|---|---|---|
| `url` | matn | ha | 500 belgigacha. Bo'sh joylar olib tashlanadi |
| `prompt` | matn | yo'q | 500 belgigacha. Bo'sh bo'lsa, "berilmagan" deb olinadi |
| `room_type` | matn | yo'q | 20 belgigacha |

**Javob (200):** 1-bosqich bilan bir xil `DesignPlan` (`image_notes` bilan birga) va qo'shimcha **`pin_image_url`**: serverning o'zi yuklab olgan pinimg rasm manzili.

**Xatolar:**

| Kod | Qachon | `detail` |
|---|---|---|
| 401 | login yo'q | standart |
| 404 | xona topilmadi yoki boshqa userniki | hozirgi |
| 422 | havola Pinterest pin havolasi emas (domen, sxema, yo'l yoki ID noto'g'ri; `pin.it` begona hostga yo'naltirdi yoki 3 tadan ortiq yo'naltirdi) | "Bu Pinterest pin havolasi emas" |
| 404 | oEmbed 400 yoki 404 qaytardi (pin yo'q yoki yopiq) | "Pin topilmadi yoki u yopiq" |
| 502 | Pinterest timeout yoki 5xx; javob JSON emas; `thumbnail_url` yo'q yoki `i.pinimg.com` da emas; rasm javobi `image/*` emas | "Pinterest hozir javob bermadi. Birozdan keyin urinib ko'ring" |
| 413 / 415 | pin rasmi 10 MB dan katta / `prepare_design_image` rad etdi | 1-bosqich matnlari |
| 429 / 503 / 422 / 502 | limit / AI o'chiq / AI reja bermadi / AI provayder xatosi | 1-bosqich bilan bir xil |

Pinterest'ning 422 va 404 holatlari xona tekshiruvidagi 404 dan `detail` matni bilan farqlanadi.

**Tartib:**
1. AI yoqilganmi.
2. Xona egasi.
3. Havolani tekshirish (`pin.it` uchun yo'naltirishlar ham).
4. Pin rasmini olish.
5. `prepare_design_image` (worker thread'da).
6. Limit.
7. `design_room`.

Shu tartib tufayli 3–5-qadamlardagi xatolar limitni yemaydi.

### Komponentlar
- **`app/services/pinterest_pin.py`** (yangi):
  - **`PIN_HOST_RE`.** Pinterest domenlari qoidasi:
    `^(?:[a-z]{2,3}\.)?pinterest\.(?:com|ca|co\.uk|com\.au|com\.mx|com\.br|co\.kr|de|fr|es|it|pt|ru|jp|kr|at|ch|cl|nz|se|dk|ie|ph|cz|hu|in|id)$`
    va alohida `pin.it`.
    - mos keladi: `www.pinterest.com`, `api.pinterest.com`, `mx.pinterest.com`, `pinterest.co.uk`, `ru.pinterest.com`;
    - mos kelmaydi: `pinterest.com.evil.com`, `evilpinterest.com`, `pinterest.evil`.
  - **`async resolve_pin_id(url: str, client: httpx.AsyncClient) -> str`:**
    - URL'ni tahlil qiladi: faqat `https`, port yo'q, foydalanuvchi ma'lumoti yo'q, host kichik harflarga o'tkazilib, oxiridagi nuqta olib tashlanib ro'yxat bilan solishtiriladi;
    - Pinterest domenida yo'l `/pin/<id>/` yoki `/pin/<slug>--<id>/`, ID esa 5–25 raqam; ID oxirgi raqamlar guruhidan olinadi;
    - `pin.it` bo'lsa, `HEAD` (405 kelsa `GET`) bilan `follow_redirects=False` ishlatiladi, `Location` olinadi va 1-qadamdan qayta tekshiriladi (ko'pi bilan 3 marta, har bir so'rovga 5 s);
    - xato bo'lsa `NotAPinUrl` ko'taradi.
  - **`async fetch_pin_image(pin_id: str, client: httpx.AsyncClient) -> PinImage`:**
    - oEmbed so'rovi (8 s timeout, `follow_redirects=False`). 400/404 → `PinNotFound`. Boshqa xato, JSON emas, `thumbnail_url` yo'q yoki uning hosti `i.pinimg.com` emas → `PinterestUnavailable`;
    - rasm manzillari: `thumbnail_url` dagi `/236x/` ni `/736x/` ga almashtirgan nomzod, keyin asl `thumbnail_url`;
    - har biri oqim bilan yuklanadi (10 s, `follow_redirects=False`). 404 bo'lsa keyingi nomzodga o'tiladi. Javob turi `image/*` emas yoki boshqa xato → `PinterestUnavailable`. Hajm `MAX_DESIGN_IMAGE_BYTES` dan oshsa → `ImageTooLarge` (o'qish shu zahoti to'xtatiladi);
    - natija: `PinImage(data: bytes, content_type: str, url: str)`.
  - Istisnolar: `NotAPinUrl`, `PinNotFound`, `PinterestUnavailable`.
- **`app/routers/ai.py`.** Yangi endpoint, `AiDesignPinRequest` (pydantic). Bitta `httpx.AsyncClient` so'rov davomida ishlatiladi. Rasm `run_in_threadpool(prepare_design_image, …)`, limit va `_run_design(..., image=prepared)` 1-bosqich bilan bir xil. Javobga `pin_image_url` qo'shiladi.
- **Log:** `ai_design.pin` — `pin_id`, olingan rasm o'lchami. Havolaning o'zi va rasm logga yozilmaydi.

## Web
`frontend/src/components/studio/AiBuilderSheet.tsx`:
- **Pinterest havolasi maydoni** (`type="url"`, label "Pinterest havolasi", placeholder "pinterest.com/pin/… yoki pin.it/…"). To'g'ri havola "📌 Pinterest pin" chipi bo'lib ko'rinadi, yonida ✕ bo'ladi.
- **Bitta manba:** havola qo'yilganda tanlangan rasm, rasm tanlanganda havola olib tashlanadi.
- **Brauzerda oldindan tekshiruv:** `https://` va host `pin.it` yoki `pinterest.` ni o'z ichiga olgan domen (soddalashtirilgan qoida, yakuniy tekshiruv serverda). Noto'g'ri bo'lsa, so'rov ketmaydi va "Bu Pinterest pin havolasi emas" chiqadi.
- **Havola bilan matn ixtiyoriy.** Tugma "Pinterest'dan dizayn yaratish".
- **Natija:** hozirgi oqim. `summary` yonida `pin_image_url` rasmi ("Shu pin asosida") ko'rsatiladi.
- **"Boshqa variant":** havola olib tashlanmaguncha saqlanadi.
- **API:** `frontend/src/lib/api/ai.ts` — `aiDesignFromPin(roomId, url, prompt?, roomType?)`. `AiDesignPlan` ga `pin_image_url?: string`.
- **Matnlar:** `frontend/src/locale/uz.ts` (`uz.ai.*`).

## Testlar
**Backend (pytest, tarmoqsiz, `httpx.MockTransport`):**
- `resolve_pin_id`:
  - oddiy, slug'li va mintaqaviy havolalar to'g'ri ID beradi;
  - rad etiladi: `http://`, port, foydalanuvchi ma'lumoti, begona domen, `pinterest.com.evil.com`, `evilpinterest.com`, doska yoki profil yo'li, ID'siz yo'l;
  - `pin.it` → `api.pinterest.com` → `www.pinterest.com/pin/…` zanjiri ID beradi;
  - begona hostga yo'naltirish va 4 ta yo'naltirish rad etiladi.
- `fetch_pin_image`:
  - 736x olinadi; 736x 404 bo'lsa 236x olinadi;
  - begona `thumbnail_url` hostiga so'rov yuborilmaydi;
  - oEmbed 400 → `PinNotFound`; 500, timeout yoki JSON emas → `PinterestUnavailable`;
  - rasm javobi `text/html` → `PinterestUnavailable`;
  - 10 MB dan oshgan oqim → `ImageTooLarge`;
  - so'rovlarning hech biri yo'naltirishni kuzatmaydi.
- Endpoint:
  - 200: reja va `pin_image_url`;
  - 422 holatida tarmoq chaqirilmaydi va limit yeyilmaydi; 404 va 502 limitni yemaydi;
  - 429 va 503;
  - limit `("image_design", IMAGE_DESIGN_DAILY_LIMIT)`.
- 1-bosqich testlari o'zgarishsiz o'tadi.

**Frontend (vitest):**
- havola qo'yilsa chip chiqadi, ✕ uni olib tashlaydi;
- havola bilan rasm bir-birini almashtiradi;
- noto'g'ri havolada so'rov ketmaydi;
- `aiDesignFromPin` havola, matn va xona turi bilan chaqiriladi;
- natijada "Shu pin asosida" rasmi bor;
- havola olib tashlangach, oqim matnli rejimga qaytadi.

**Haqiqiy tekshiruv (local):**
- 2–3 ta haqiqiy pin (oddiy, slug'li, mintaqaviy) bilan Pinterest so'rovlari (pullik emas). Haqiqiy `pin.it` havolasi topilsa, u ham sinanadi;
- 2 tagacha pullik AI chaqiruv, biri web UI orqali.

Natija PR tavsifiga yoziladi.

## Mobil handoff
`docs/MOBILE_QA_HANDOFF.md` ga 6-bo'lim:
- API contract va xato matnlari;
- **Share → andoza.ai:** Pinterest ilovasi ulashganda havolani (matn) beradi, mobil ilova uni `url` sifatida shu endpoint'ga yuboradi (Android share intent, iOS share extension).

## Deploy
- Migration ham, yangi sozlama ham yo'q.
- Production serveri `www.pinterest.com`, `pin.it` va `i.pinimg.com` ga HTTPS orqali chiqa olishi kerak. Birinchi deploy'dan keyin tekshiriladi.
- Merge = deploy.

## Xavflar
- **Hujjatlashtirilmagan mexanizmlar.** oEmbed va `736x` Pinterest tomonidan rasmiy hujjatlashtirilmagan. O'zgarsa: 736x yo'qolsa, 236x ga qaytiladi; oEmbed buzilsa, foydalanuvchi aniq 502 xabarini oladi. Rasm yuklash (1-bosqich) bunga bog'liq emas.
- **Sifat.** 736 px yetarli (model 1024 px gacha ko'radi). 236 px ga qaytilgan holatda sifat pasayadi.
- **Pinterest qoidalari.** Har foydalanuvchi harakati uchun bitta oEmbed va bitta rasm so'rovi. Ommaviy yig'ish, kesh yoki qidiruv yo'q.
