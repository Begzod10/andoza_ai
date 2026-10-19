# Rasmdan AI dizayn (Pinterest integratsiyasining 1-bosqichi)

Sana: 2026-10-19. Holat: tasdiqlash uchun.

## Maqsad
Foydalanuvchi ilhom rasmini yuklaydi (Pinterest skrinshoti, Instagram yoki o'zi olgan surat). AI rasmdagi uslubni o'qiydi va xonaga katalogdan dizayn rejasini tuzadi: devor, pol, chiroq va mebel. Hozirgi AI dizayn faqat jumla qabul qiladi, odamlar esa ta'mirni rasm tanlab rejalashtiradi.

**Muvaffaqiyat mezoni:**
- studiyada rasm (va ixtiyoriy matn) yuborilsa, hozirgi AI dizayn kabi qo'llanadigan reja keladi;
- reja faqat katalogdagi narsalardan iborat bo'ladi, `summary` esa rasmdan nima olinganini va katalogda nima yo'qligini aytadi;
- rasm hech qayerda saqlanmaydi (Starlette katta yuklamani so'rov davomida vaqtinchalik faylga yozishi mumkin, so'rov tugashi bilan u o'chiriladi);
- pullik chaqiruvlar alohida kunlik limit bilan cheklanadi;
- mavjud `/ai-design` endpoint'i va uning mijozlari (web, mobil) o'zgarmaydi.

## Doira
**Kiradi:**
- backend endpoint;
- LLM qatlamida rasm qo'llab-quvvatlash;
- web studiyadagi AI sheet;
- testlar;
- mobil uchun handoff bo'limi.

**Kirmaydi:**
- **Pinterest havolasidan rasm olish va "Share → andoza.ai"** — 2-bosqich.
- **Pinterest akkauntini ulash (OAuth)** — 3-bosqich, faqat talab bo'lsa.
- **Flutter ilovadagi native UI** — mobil repo, alohida sessiya.
- **Bir nechta rasm (moodboard).** Bu bosqichda bitta rasm.
- **Pinterest qidiruvini scraping qilish yoki pinlarni lenta qilib ko'rsatish** — hech qachon, bu qoidalarga zid.

## Asosiy qarorlar
1. **Alohida endpoint, bitta vision chaqiruv.** Ikki bosqichli variant (rasm → matn → hozirgi dizayn) va mavjud endpoint'ni kengaytirish ham ko'rib chiqildi. Alohida endpoint tanlandi, chunki:
   - hozirgi tekshiruv (`validate_plan`) va studiyadagi qo'llash mantig'i to'liq qayta ishlatiladi;
   - mavjud contract'ga tegilmaydi;
   - bitta chaqiruv ikkitadan tez va arzon.
2. **Rasm va ixtiyoriy matn.** Rasm asosiy manba, matn uni aniqlashtiradi ("faqat ranglarini ol"). Ikkalasi qarama-qarshi kelsa, matn ustun.
3. **Rasm saqlanmaydi.** Diskka, S3 ga, bazaga yoki logga yozilmaydi. Yagona istisno: Starlette 1 MB dan katta yuklamani so'rov davomida vaqtinchalik faylga yozadi va so'rov tugashi bilan o'chiradi. EXIF, jumladan joylashuv, olib tashlanadi. *(Yakuniy review'dan keyin aniqlashtirildi.)*
4. **Alohida limit pool.** `image_design` pool'i va `IMAGE_DESIGN_DAILY_LIMIT` sozlamasi (standart 10), renderlar va "rasmdan model" bilan bir xil andozada (`check_and_increment_budget_for`). Matnli `builder` pool'idan qo'shimcha hisoblanmaydi.

## Backend

### API
`POST /api/v1/rooms/{room_id}/ai-design/image`, `multipart/form-data`.

| Maydon | Turi | Majburiy | Cheklov |
|---|---|---|---|
| `image` | fayl | ha | JPEG, PNG yoki WebP. Tur sarlavhadan ham, birinchi baytlardan ham tekshiriladi. 10 MB gacha |
| `prompt` | matn | yo'q | 500 belgigacha. Bo'sh yoki faqat bo'sh joydan iborat bo'lsa, "berilmagan" deb olinadi |
| `room_type` | matn | yo'q | 20 belgigacha, `/ai-design` dagi bilan bir xil |

**Javob (200):** `/ai-design` bilan aynan bir xil `DesignPlan`: `title`, `summary`, `walls`, `floor`, `lights`, `furniture` va hokazo.

**Xatolar:**

| Kod | Qachon | `detail` |
|---|---|---|
| 401 | login yo'q | standart |
| 404 | xona topilmadi yoki boshqa userniki | hozirgi `_get_owned_room` |
| 413 | rasm 10 MB dan katta | "Rasm hajmi 10 MB dan oshmasligi kerak" |
| 415 | rasm emas yoki turi qo'llanmaydi | "Faqat JPEG, PNG yoki WebP rasm yuklang" |
| 422 | AI ishlatib bo'ladigan reja bermadi (`DesignError`) yoki forma maydonlari noto'g'ri | hozirgi uslubda |
| 429 | kunlik limit tugagan | "Bugungi rasmdan dizayn limiti tugadi" |
| 502 | provayder xatosi yoki timeout | hozirgi `/ai-design` matni |
| 503 | `AI_FEATURES_ENABLED` o'chiq | hozirgi `/ai-design` matni |

**Tartib:**
1. AI yoqilganini tekshirish.
2. Xona egasini tekshirish.
3. Rasmni tekshirish va tayyorlash.
4. Limitni oshirish.
5. LLM chaqiruvi.

Shu tartib tufayli noto'g'ri fayl yoki birovning xonasi limitdan hisoblanmaydi.

### Komponentlar
- **`app/services/design_image.py`** (yangi). `prepare_design_image(data: bytes, content_type: str) -> PreparedImage`:
  - tur va birinchi baytlarni tekshiradi;
  - hajm 10 MB dan oshmasligini tekshiradi;
  - Pillow bilan ochadi va uzun tomonini 1024 px gacha kichraytiradi (kichik rasm kattalashtirilmaydi);
  - RGB ga o'tkazadi va EXIF'siz JPEG (sifat 85) qilib saqlaydi;
  - `media_type="image/jpeg"` va base64 qaytaradi.
  - Xatolar maxsus istisno bilan chiqadi: `ImageTooLarge`, `UnsupportedImage`. Router ularni 413 va 415 ga aylantiradi.
- **`app/services/llm.py`.** `_to_openai_messages` Anthropic uslubidagi `{"type": "image", "source": {"type": "base64", "media_type": ..., "data": ...}}` blokini OpenAI'ning `{"type": "image_url", "image_url": {"url": "data:<media_type>;base64,<data>"}}` qismiga o'giradi. Matnli xabarlar avvalgidek qoladi.
- **`app/services/ai_designer.py`.** `design_room(prompt, room, furniture_items, *, user_id, image=None)`:
  - `image` berilsa, foydalanuvchi xabari rasm bloki va matn blokidan iborat bo'ladi;
  - matn blokida hozirgi `build_user_message` mazmuni va rasm ko'rsatmasi (`_IMAGE_INSTRUCTIONS`) bor;
  - `prompt` bo'sh bo'lsa, `build_user_message` ga "rasmdagi uslubni takrorla" degan standart ko'rsatma beriladi;
  - rasm bilan chaqiruvda `call_llm` ga `user_id=None` beriladi, chunki limitni router alohida pool'da hisoblaydi;
  - model, `validate_plan` va `reconcile_summary` o'zgarishsiz qoladi.
- **`_IMAGE_INSTRUCTIONS`** (prompt matni). Rasmdagi devor rangi yoki oboy, pol turi va naqshi, chiroq kayfiyati va mebel turlarini o'qish. Faqat berilgan menyudan eng yaqinini tanlash. `summary` faqat tanlangan dizaynni tasvirlaydi. Rasmdan nima olingani va katalogda nima topilmagani alohida `image_notes` maydonida aytiladi. Bu maydon `reconcile_summary` tekshiruvidan o'tmaydi va javobda qaytariladi, web uni `summary` ostida ko'rsatadi. *(Yakuniy review'dan keyin: `reconcile_summary` rejada yo'q narsalarni tilga olgan summary'ni almashtirib yuborardi.)* Rasmda xona ko'rinmasa ham (masalan, faqat rang palitrasi), undagi ranglar va kayfiyatdan foydalanish.
- **`app/routers/ai.py`.** Yangi endpoint. Furniture ro'yxatini olish, xona xulosasi va xatolarni qayta ishlash `/ai-design` bilan umumiy yordamchiga chiqariladi, takrorlanmaydi.
- **`app/config.py`.** `IMAGE_DESIGN_DAILY_LIMIT: int = 10`.

## Web

`frontend/src/components/studio/AiBuilderSheet.tsx`, mavjud formaga qo'shiladi:
- **"Rasm qo'shish" tugmasi** matn maydoni yonida, `accept="image/jpeg,image/png,image/webp"`. Tanlangan rasm kichik preview bo'lib ko'rinadi (`URL.createObjectURL`, sheet yopilganda yoki rasm olib tashlanganda bo'shatiladi), yonida ✕ bo'ladi.
- **Rasm tanlanganda:** matn ixtiyoriy bo'ladi, placeholder "Ixtiyoriy: masalan, faqat ranglarini ol" ga, tugma "Rasmdan dizayn yaratish" ga o'zgaradi.
- **Brauzerda oldindan tekshiruv:** tur va 10 MB. Xato bo'lsa, so'rov yuborilmaydi va mavjud xato blokida xabar chiqadi.
- **Natija:** `generate()` rasm bo'lsa `aiDesignFromImage`, bo'lmasa hozirgidek `aiDesign` chaqiradi. Undan keyingi qism (reja, qismlar, sheet yopilishi, `commit`) o'zgarmaydi.
- **"Boshqa variant":** rasm olib tashlanmaguncha saqlanadi, qayta yuborishda o'sha rasm ishlatiladi.
- **API:** `frontend/src/lib/api/ai.ts` ga `aiDesignFromImage(roomId, image: File, prompt?, roomType?)` qo'shiladi, `FormData` bilan. `apiClient` FormData'ga Content-Type qo'ymaydi.
- **Matnlar:** `frontend/src/locale/uz.ts` (`uz.ai.*`).

## Testlar
**Backend (pytest).** LLM mock qilinadi, pullik chaqiruv bo'lmaydi.
- `prepare_design_image`:
  - JPEG, PNG va WebP qabul qilinadi;
  - sarlavhasi soxta fayl → `UnsupportedImage`;
  - 10 MB dan katta → `ImageTooLarge`;
  - 3000 px rasm 1024 px ga tushadi, 500 px rasm o'zgarmaydi;
  - EXIF chiqishda yo'q.
- `_to_openai_messages`: rasm bloki `image_url` ga o'giriladi, matnli xabar o'zgarmaydi.
- `design_room(image=...)`:
  - xabarda rasm va ko'rsatma bor;
  - matn ham boradi;
  - bo'sh matnda standart ko'rsatma ishlatiladi;
  - natija `validate_plan` dan o'tadi;
  - `call_llm` ga `user_id=None` beriladi.
- Endpoint:
  - 200 holatda javob `DesignPlan` shaklida;
  - 404, 413, 415, 429, 502 va 503;
  - 415 va 404 holatlarida limit kamaymaydi;
  - `builder` limiti hisoblanmaydi.
- Mavjud `/ai-design` testlari o'zgarishsiz o'tadi.

**Frontend (vitest):**
- preview chiqadi va ✕ uni olib tashlaydi;
- rasm bilan bo'sh matnda tugma faol;
- noto'g'ri tur yoki hajmda xabar chiqadi va so'rov ketmaydi;
- yuborishda `aiDesignFromImage` rasm va matn bilan chaqiriladi va reja qo'llanadi;
- 429 da limit xabari chiqadi.

**Haqiqiy sifat tekshiruvi:** local'da 5 tagacha pullik chaqiruv, turli uslubdagi rasmlar bilan (oq skandinav, qorong'i loft, klassik va boshqalar). `summary` va tanlovlar rasmga mosligi qo'lda baholanadi. Natija PR tavsifiga yoziladi.

## Mobil handoff
`docs/MOBILE_QA_HANDOFF.md` ga yangi bo'lim qo'shiladi:
- API contract: yuqoridagi jadvallar;
- Flutter WebView'da fayl tanlash ruxsati (studiya WebView'da ochiladi);
- 2-bosqich g'oyasi: Pinterest ilovasidan "Share → andoza.ai".

## Deploy
- Migration yo'q.
- Yangi sozlama: `IMAGE_DESIGN_DAILY_LIMIT` (standart 10).
- Production'da `AI_FEATURES_ENABLED` yoqilgan bo'lsa, `master`ga merge qilinishi bilan ishga tushadi, chunki merge = deploy.

## Xavflar
- **Sifat.** Natija katalog bilan cheklangan, "Pinterest'dagining aynan o'zi" emas. `summary` buni ochiq aytadi.
- **Narx.** Har bir urinish pullik vision chaqiruvi. Kunlik limit va 1024 px gacha kichraytirish buni cheklaydi.
- **Model.** `AI_MODEL_BUILDER` rasm qabul qila oladigan model bo'lishi shart (hozir `gpt-4.1-mini`, qabul qiladi). Model rasmsiz modelga almashtirilsa, endpoint 502 qaytaradi. Bu holat logda ko'rinadi.
