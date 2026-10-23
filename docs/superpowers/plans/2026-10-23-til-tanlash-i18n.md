# Til tanlash (uz/ru/en) — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profilda til tanlanadi (O'zbekcha/Русский/English) va butun web interfeys hamda server xato xabarlari shu tilda chiqadi.

**Architecture:**
- **Backend:** `users.language` ustuni va `PATCH /auth/me`. Xato xabarlari `Accept-Language` bo'yicha `app/i18n/messages.py` lug'ati orqali global handler'da tarjima qilinadi.
- **Frontend:** react-i18next, `src/i18n/locales/{uz,ru,en}.json`, `useLocale()` hook, `apiClient` `Accept-Language` yuboradi.
- **Matnlarni ko'chirish:** matnlar bo'limlar bo'yicha kalitlarga ko'chiriladi. "Kalitsiz matn qolmasin" testi har task'da ko'chirilgan papkalar ro'yxatini kengaytiradi.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest (`docker exec andoza_ai-api-1 pytest`), React 18, TypeScript, vitest (`cd frontend && PATH=/Users/mac/.local/node/bin:$PATH npx vitest run`), i18next, react-i18next.

**Spec:** [docs/superpowers/specs/2026-10-23-til-tanlash-i18n-design.md](../specs/2026-10-23-til-tanlash-i18n-design.md)

## Global Constraints
- **Tillar:** `"uz"` (manba va fallback), `"ru"`, `"en"`. Til nomlari har biri o'z tilida: "O'zbekcha", "Русский", "English".
- **Brauzerda saqlash:** `localStorage["andoza.lang"]`. Boshlang'ich til tartibi: `user.language` → localStorage → `navigator.language` (`ru*`→ru, `en*`→en) → `uz`.
- **Test muhitida** til `uz` qotiriladi, mavjud testlarning o'zbekcha matnlari o'zgarmaydi.
- **Kalitlar** `uz.json` dan tiplanadi, noto'g'ri kalit `tsc` xatosi. O'zgaruvchilar `{{nomi}}`, ko'plik `_one`/`_other` (ru: `_few`/`_many` ham).
- **Pul birligi:** `so'm` / `сум` / `UZS`. Intl locale: `uz-UZ` / `ru-RU` / `en-US`.
- **Backend:**
  - `users.language` `String(5)` NOT NULL, standart `'uz'`, `CHECK IN ('uz','ru','en')`, migratsiya `1786000040` (down `1786000039`);
  - `UserOut.language`;
  - `PATCH /api/v1/auth/me {"language"}`.
- **Server xabarlari:** sarlavhasiz so'rov o'zbekcha javob oladi. Pydantic ro'yxat xatolari va global 404 "Not found" o'zgarmaydi.
- **Kirmaydi:** AI javoblari, katalog nomlari (mebel, material, do'kon), mobil, push/SMS, kirill. Brend "andoza.ai" tarjima qilinmaydi.
- **Atamalar:** `docs/i18n-glossary.md` (Task 3) hamma tarjimada majburiy.
- **Commit oxirida:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Merge** = production deploy (migratsiya bilan). Faqat foydalanuvchi aytganda.

## Review Focus
1. Kirgan foydalanuvchi tilini o'zgartirsa va `PATCH /auth/me` xato bersa (oflayn), interfeys baribir yangi tilda qolishi va tilni boshqa brauzerga o'tkazish keyingi muvaffaqiyatli o'zgartirishda bo'lishi kerak. Test Task 4 da.
2. Rus tilidagi ko'plik shakllari (`1 материал`, `3 материала`, `5 материалов`) noto'g'ri bo'lmasligi kerak. Hech bo'lmaganda bitta ko'plikli kalit uchun uch shakl testlanadi (Task 3).
3. `Accept-Language: ru-RU,ru;q=0.9,en;q=0.8` va `Accept-Language: de` kabi haqiqiy brauzer sarlavhalari: birinchisi `ru`, ikkinchisi `uz` bo'ladi. Test Task 2 da.
4. O'zgaruvchili (f-string) server xabarlari, masalan `styles … dan bo'lishi kerak`, tarjimada qiymatini yo'qotmasligi kerak. Test Task 2 da.
5. Til almashtirilganda allaqachon ochiq dialog yoki studiya paneli sahifani qayta yuklamasdan yangi tilga o'tishi kerak (`useTranslation` re-render). Test Task 4 da (ochiq profil sahifasida).

---

### Task 1: Backend: `users.language` va `PATCH /auth/me`

**Files:**
- Create: `backend/alembic/versions/1786000040_user_language.py`
- Modify: `backend/app/models/user.py`, `backend/app/schemas/auth.py` (`UserOut`, yangi `MeUpdate`), `backend/app/routers/auth.py` (`/me` ~282)
- Test: `backend/tests/test_user_language.py`

**Interfaces:**
- Produces:
  - `User.language: Mapped[str]`;
  - `UserOut.language: str`;
  - `LANGUAGES = ("uz", "ru", "en")` (`app/schemas/auth.py`);
  - `PATCH /api/v1/auth/me` → `UserOut`.

- [ ] **Step 1: Failing testlar** (auth testlaridagi mock naqshida):
  - `GET /auth/me` javobida `language == "uz"` (yangi foydalanuvchi);
  - `PATCH /auth/me {"language":"ru"}` → 200, `language == "ru"`, foydalanuvchi obyektida saqlangan;
  - `{"language":"de"}` → 422;
  - kirmagan → 401;
  - login javobidagi `user.language` mavjud.
- [ ] **Step 2:** Testlarni ishga tushirish. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.**
  - Model ustuni va migratsiya: `add_column` + `server_default` + `CheckConstraint` (`ck_users_language`); `downgrade` ikkalasini o'chiradi.
  - `MeUpdate(BaseModel): language: Literal["uz","ru","en"]`.
- [ ] **Step 4:** `docker exec andoza_ai-api-1 alembic upgrade head && alembic downgrade -1 && alembic upgrade head`, to'liq suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "Users keep the language they chose".

---

### Task 2: Backend: xato xabarlarini tarjima qilish

**Files:**
- Create: `backend/app/i18n/__init__.py`, `backend/app/i18n/messages.py`
- Modify: `backend/app/main.py` (`StarletteHTTPException` handler ~151) va o'zgaruvchili `detail=f"..."` bor router'lar (34 ta joy, `grep -rn 'detail=f"' backend/app/routers`)
- Test: `backend/tests/test_i18n_messages.py`

**Interfaces:**
- Produces:
  - `MESSAGES: dict[str, dict[str, str]]`;
  - `request_language(request: Request) -> str`;
  - `translate(text: str, lang: str) -> str`;
  - `def translate_detail(template: str, **values) -> TranslatableDetail`. Bu `str` ning bolasi: shablon va qiymatlarni o'zida saqlaydi, `str(...)` o'zbekcha matnni qaytaradi. Handler uni tanlangan tilda formatlaydi.

- [ ] **Step 1: Failing testlar:**

```python
@pytest.mark.parametrize(("header", "lang"), [
    (None, "uz"), ("ru", "ru"), ("ru-RU,ru;q=0.9,en;q=0.8", "ru"),
    ("en-US,en;q=0.9", "en"), ("de", "uz"), ("de,en;q=0.5", "en"), ("uz", "uz"),
])
def test_request_language(header, lang): ...

def test_a_known_message_is_translated(client):  # e.g. the materials 422 "Narx musbat bo'lishi kerak"
    r = client.post(..., headers={"Accept-Language": "ru"})
    assert r.json()["detail"] == MESSAGES["Narx musbat bo'lishi kerak"]["ru"]

def test_without_a_header_the_message_stays_uzbek(client): ...
def test_an_unknown_message_stays_uzbek(): assert translate("Noma'lum xabar", "ru") == "Noma'lum xabar"
def test_a_message_with_values_keeps_them():  # Review Focus 4
    d = translate_detail("styles {allowed} dan bo'lishi kerak", allowed="neoklassika, klassik")
    assert str(d) == "styles neoklassika, klassik dan bo'lishi kerak"
    assert "neoklassika, klassik" in translate(d, "en")
def test_pydantic_list_details_are_untouched(client): ...  # 422 list stays a list with English msg
def test_every_router_message_has_ru_and_en():
    # collects every detail="..." literal and every translate_detail("...") template
    # under app/routers (and app/services raising HTTPException) with a regex
    for text in collected: assert MESSAGES.get(text, {}).keys() >= {"ru", "en"}, text
```

- [ ] **Step 2:** Testlarni ishga tushirish. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.**
  - `request_language` `Accept-Language` sarlavhasini q-qiymati bo'yicha saralaydi va birinchi `uz|ru|en` (prefiks bo'yicha) tilni oladi, aks holda `"uz"`.
  - Handler: `detail` `str` bo'lsa, `translate(detail, lang)`.
  - 34 ta `detail=f"..."` joy `translate_detail("…{x}…", x=…)` ga o'tkaziladi.
  - `MESSAGES` ga barcha matnlarning ru/en tarjimalari yoziladi (`docs/i18n-glossary.md` Task 3 da yaratiladi; bu task'da atamalar spec 6-bo'limidagi kabi).
- [ ] **Step 4:** To'liq suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "Server messages come in the caller's language".

---

### Task 3: Frontend i18n asosi

**Files:**
- Create:
  - `frontend/src/i18n/index.ts`, `frontend/src/i18n/locales/{uz,ru,en}.json`, `frontend/src/i18n/useLocale.ts`, `frontend/src/i18n/types.d.ts`;
  - `frontend/src/i18n/__tests__/locales.test.ts`, `frontend/src/i18n/__tests__/untranslated.test.ts`;
  - `docs/i18n-glossary.md`.
- Modify:
  - `frontend/package.json` (`i18next`, `react-i18next`, aniq versiyalar);
  - `frontend/src/main.tsx` (i18n import);
  - `frontend/src/test-setup.ts` (til `uz`);
  - `frontend/src/lib/api/client.ts` (`Accept-Language`);
  - `frontend/src/lib/utils.ts` (`formatUZS`, `formatUZSCompact` tilga qarab);
  - `frontend/src/locale/uz.ts` ni ishlatgan 19 fayl (`t()` ga); `frontend/src/locale/uz.ts` o'chiriladi.

**Interfaces:**
- Produces:
  - `type Language = "uz" | "ru" | "en"`, `LANGUAGES: { id: Language; label: string }[]`;
  - `useLocale(): { language: Language; setLanguage(l: Language): void }`. Task 4 bunga server saqlashni qo'shadi;
  - `initialLanguage(userLanguage?: string | null): Language`;
  - `applyLanguage(l: Language): void` (i18next + localStorage + `<html lang>`);
  - `currentLanguage(): Language` (`apiClient` uchun).
  - Barcha keyingi task'lar `useTranslation()` dan `t` oladi.
- `untranslated.test.ts` eksport qiladi `MIGRATED_DIRS: string[]`. Keyingi task'lar unga o'z papkalarini qo'shadi.

- [ ] **Step 1: Failing testlar:**
  - `locales.test.ts`: uch faylning kalitlar to'plami bir xil (ichma-ich kalitlar yoyilgan holda); bo'sh qiymat yo'q; `{{var}}` lar mos keladi.
  - `utils` testi: `formatUZS(1250000)` uz `"1 250 000 so'm"`, ru `"1 250 000 сум"`, en `"1,250,000 UZS"`. Raqam ajratgichi aynan shunday (ru da Intl "  " NBSP qo'ysa, oddiy bo'shliqqa almashtiriladi).
  - Ko'plik (Review Focus 2): `common.items` uchun ru `1 → "1 элемент"`, `3 → "3 элемента"`, `5 → "5 элементов"`.
  - `initialLanguage`: spec tartibi bo'yicha 4 ta holat.
  - `apiClient` so'rovida `Accept-Language` joriy til bilan.
  - `untranslated.test.ts`: `MIGRATED_DIRS` dagi fayllarda JSX matn va `label|placeholder|title|aria-label|alt` atributlarida o'zbekcha so'z (regex `\b\w*(o'|g'|o‘|g‘)\w*\b` yoki `\b(va|uchun|bilan|qilish|yo'q)\b`) yo'q, `ALLOW` ro'yxatidan tashqari. Bu task'da `MIGRATED_DIRS = ["src/i18n", ...uz.ts ni ishlatgan fayllar]`.
- [ ] **Step 2:** vitest. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.**
  - `uz.ts` kalitlari `uz.json` ga aynan ko'chiriladi va `ru.json`/`en.json` ga tarjima qilinadi.
  - `types.d.ts`: `CustomTypeOptions { defaultNS: "translation"; resources: { translation: typeof uz } }`.
  - `docs/i18n-glossary.md` spec 6-bo'limidagi atamalar bilan va kamida 30 ta qurilish/studiya atamasi bilan yoziladi (Task 2 tarjimalari bilan mos).
- [ ] **Step 4:** vitest to'liq va tsc. Kutilgan natija: PASS va 0.
- [ ] **Step 5:** Commit: "Translations foundation: i18next with uz, ru and en".

---

### Task 4: Til tanlagich, auth, profil, layout va UI komponentlari

**Files:**
- Create: `frontend/src/components/layout/LanguageSwitcher.tsx` (+ test)
- Modify:
  - `frontend/src/pages/profile/*`, `frontend/src/pages/auth/*`, `frontend/src/components/layout/*`, `frontend/src/components/ui/*`;
  - `frontend/src/store/authStore.ts` (login/me'dan `user.language` → `applyLanguage`);
  - `frontend/src/lib/api/auth.ts` (`updateMe(patch: { language: Language }): Promise<User>`);
  - `frontend/src/i18n/useLocale.ts` (kirgan bo'lsa `updateMe`);
  - `untranslated.test.ts` (`MIGRATED_DIRS` ga papkalar).

**Interfaces:** Consumes: Task 1 `PATCH /auth/me`, Task 3 `useLocale`, `applyLanguage`, `initialLanguage`.

- [ ] **Step 1: Failing testlar:**
  - profil sahifasida "Til" bo'limi uchta variant bilan; "Русский" bosilsa sarlavhalar ruschaga o'tadi, `localStorage["andoza.lang"] === "ru"`, `updateMe({language:"ru"})` chaqiriladi;
  - `updateMe` rad etilsa, interfeys ruscha qoladi va xato ko'rsatilmaydi (Review Focus 1);
  - ochiq profil sahifasi qayta yuklanmasdan yangilanadi (Review Focus 5);
  - login javobida `language: "en"` bo'lsa, interfeys inglizcha;
  - `LanguageSwitcher` landing/auth sarlavhasida ishlaydi, `updateMe` ni kirmaganda chaqirmaydi.
- [ ] **Step 2:** vitest. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.** Matnlar kalitlarga ko'chiriladi va uch tilga tarjima qilinadi.
- [ ] **Step 4:** vitest to'liq va tsc. Kutilgan natija: PASS va 0.
- [ ] **Step 5:** Commit: "Language picker on the profile; auth, profile and layout translated".

---

### Task 5: Landing, maxfiylik, akkaunt o'chirish, ulashish va skan sahifalari

**Files:** Modify: `frontend/src/pages/landing/*`, `frontend/src/pages/LandingPage.tsx`, `frontend/src/pages/PrivacyPage.tsx`, `frontend/src/pages/DeleteAccountPage.tsx`, `frontend/src/pages/share/*`, `frontend/src/pages/scan/*`. Bu sahifalarning matnlarini beradigan `frontend/src/lib/*` fayllari ham shu task'ga kiradi. `LanguageSwitcher` landing sarlavhasida qo'yiladi. `MIGRATED_DIRS` kengaytiriladi.

- [ ] **Step 1:** Mavjud testlar uz bilan o'tishi kerak. Yangi test: landing `ru` tilida render bo'lganda bosh sarlavha `ru.json` dagi qiymat bo'ladi. `untranslated.test.ts` yangi papkalar bilan FAIL beradi.
- [ ] **Step 2–4:** Ko'chirish va tarjima. Maxfiylik siyosati matni to'liq tarjima qilinadi. Natijada vitest PASS va tsc 0 bo'lishi kerak.
- [ ] **Step 5:** Commit: "Landing, privacy, account and share pages translated".

### Task 6: Loyihalar, wizard, ustalar, hooks

**Files:** `frontend/src/pages/projects/*`, `pages/wizard/*`, `components/wizard/*`, `pages/ustalar/*`, `hooks/*` va ularga tegishli `lib/*` matnlari. Qadamlar Task 5 dagi kabi. Commit: "Projects, wizard and craftsmen translated".

### Task 7: Studiya 1-qism: `pages/studio/*`

**Files:** `frontend/src/pages/studio/**` (57 fayl). Qadamlar Task 5 dagi kabi. Commit: "Studio pages translated".

### Task 8: Studiya 2-qism: `components/studio/*`, `features/studio/*` va studiya `lib` matnlari

**Files:**
- `frontend/src/components/studio/**`, `frontend/src/features/studio/**`;
- studiya matnlarini beradigan `lib` fayllar: `aiDesignPresets.ts` (`label`, `title`, `summary`; `id` o'zgarmaydi), `lightCatalog.ts` nomlari, `ceilingDesigns.ts`, `furnitureStyles.ts`, `oboyPatterns.ts`, `trimProfiles.ts` (label'lar), `uz.ai.dizayner_misollar`.
- `lib` dagi label massivlari `labelKey` bilan beriladi va komponent `t(labelKey)` qiladi. Mavjud testlar `label` ni o'qisa, ular `t` orqali o'zgartiriladi.

Qadamlar Task 5 dagi kabi. Commit: "Studio components translated".

### Task 9: Smeta, do'kon, sotuvchi, admin va qolgan `lib`

**Files:** `frontend/src/pages/smeta/*`, `components/smeta/*`, `pages/dokon/**`, `components/dokon/*`, `pages/seller/*` va qolgan `lib/**` matnlari (`adminMaterials.ts` kategoriya/birlik/smeta nomlari). `MIGRATED_DIRS` `["src"]` ga aylanadi: butun frontend tekshiriladi.

- [ ] **Step 1:** `untranslated.test.ts` `MIGRATED_DIRS = ["src"]` bilan FAIL. Smeta sahifasi `en` tilida render bo'lganda "JAMI XARAJAT" o'rniga `en.json` qiymati chiqadi.
- [ ] **Step 2–4:** Ko'chirish va tarjima. Natijada vitest to'liq PASS, tsc 0, `untranslated.test.ts` PASS bo'lishi kerak.
- [ ] **Step 5:** Commit: "Estimate, shop, seller and admin translated". Push, PR ochish va bog'lash. Merge faqat foydalanuvchi aytganda.

---

## Yakuniy ko'rib chiqish
Barcha task'lardan keyin butun branch eng kuchli modeldagi bitta yangi reviewer bilan ko'rib chiqiladi (Review Focus ro'yxati bilan). U tarjima sifatini ham tanlab tekshiradi: har tildan 30 ta tasodifiy kalit, atamalar lug'atiga mosligi. Critical va Important topilmalar bitta fix pass'da tuzatiladi.
