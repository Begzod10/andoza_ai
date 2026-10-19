# Pinterest havolasidan AI dizayn — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Studiyadagi AI dizaynerga Pinterest pin havolasini berib, pin rasmidan katalog bo'yicha xona dizayn rejasini olish.

**Architecture:** Yangi `app/services/pinterest_pin.py` havolani qat'iy hostlar ro'yxati bo'yicha tekshirib, pin ID'sini ajratadi (`pin.it` yo'naltirishlarini qo'lda kuzatadi), so'ng oEmbed orqali `thumbnail_url` ni olib, 736x rasmni yuklaydi. Yangi `POST /rooms/{room_id}/ai-design/pin` endpoint'i shu rasmni 1-bosqich quvuriga beradi: `prepare_design_image`, `image_design` limiti va `_run_design(image=…)`. Javobga `pin_image_url` qo'shiladi. Web sheet'ga havola maydoni qo'shiladi.

**Tech Stack:** FastAPI, httpx 0.28 (`AsyncClient`, testlarda `MockTransport`), pytest; React 18, vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-ai-design-from-pinterest-design.md`

## Global Constraints

- Hostlar qoidasi (aynan shu): `^(?:[a-z]{2,3}\.)?pinterest\.(?:com|ca|co\.uk|com\.au|com\.mx|com\.br|co\.kr|de|fr|es|it|pt|ru|jp|kr|at|ch|cl|nz|se|dk|ie|ph|cz|hu|in|id)$` va alohida `pin.it`. Rasm faqat `i.pinimg.com` dan.
- Host kichik harflarga o'tkaziladi va oxiridagi nuqta olib tashlanadi. Faqat `https`, port yo'q, foydalanuvchi ma'lumoti yo'q.
- Pin yo'li `/pin/<id>/` yoki `/pin/<slug>--<id>/`. ID 5–25 raqam, oxirgi raqamlar guruhi.
- `pin.it`: ko'pi bilan 3 ta yo'naltirish, har bir so'rovga 5 s, har bir `Location` qayta tekshiriladi.
- oEmbed: `https://www.pinterest.com/oembed.json?url=https://www.pinterest.com/pin/<id>/`, timeout 8 s. Rasm so'rovi timeout 10 s, oqim bilan, `MAX_DESIGN_IMAGE_BYTES` (10 MB) da to'xtatiladi.
- Hech bir so'rov yo'naltirishni o'zi kuzatmaydi (`follow_redirects=False`).
- Rasm nomzodlari: `thumbnail_url` dagi `/236x/` → `/736x/` nomzodi, keyin asl `thumbnail_url`. 404 kelsa keyingisiga o'tiladi.
- Tartib: AI → xona egasi → havola → pin rasmi → `prepare_design_image` (worker thread) → limit (`"image_design"`, `IMAGE_DESIGN_DAILY_LIMIT`) → `_run_design`. 3–5-qadam xatolari limitni yemaydi.
- Xato matnlari (aynan shu):
  - 422: `"Bu Pinterest pin havolasi emas"`
  - 404: `"Pin topilmadi yoki u yopiq"`
  - 502: `"Pinterest hozir javob bermadi. Birozdan keyin urinib ko'ring"`
- Logga havola va rasm yozilmaydi, faqat `pin_id` va o'lcham.
- 1-bosqich (`/ai-design/image`, `/ai-design`) contract'i va testlari o'zgarmaydi. `master`ga merge = production deploy.

## Review Focus

1. **Kuzatuv parametrli havola:** `?mt=login&utm_source=…` yoki `#` bilan, oldida va orqasida bo'sh joy bilan nusxalangan havola ham to'g'ri ID berishi kerak. Test Task 1 da.
2. **Katta harfli yoki nuqtali host:** `https://WWW.Pinterest.COM./pin/123456789/` ham ishlashi kerak. Test Task 1 da.
3. **`236x` bo'lmagan `thumbnail_url`:** masalan `/564x/`. U o'zgarishsiz ishlatilishi kerak, aks holda "nomzod" noto'g'ri yasalib 404 olinadi. Test Task 2 da.
4. **`Content-Length` sarlavhasiz katta rasm (chunked):** hajm chegarasi baribir ishlashi kerak. Test Task 2 da.
5. **Pin havolasini matn maydoniga qo'yish:** foydalanuvchi havolani asosiy matn maydoniga qo'ysa, u havola maydoniga ko'chirilishi kerak, aks holda URL matnli dizaynga prompt bo'lib ketadi. Test Task 4 da.

---

### Task 1: Pin havolasini tekshirish (`resolve_pin_id`)

**Files:**
- Create: `backend/app/services/pinterest_pin.py`
- Test: `backend/tests/test_pinterest_pin.py`

**Interfaces:**
- Produces:
  - `PIN_HOST_RE: re.Pattern`
  - `class NotAPinUrl(Exception)`, `class PinNotFound(Exception)`, `class PinterestUnavailable(Exception)`
  - `def pinterest_client() -> httpx.AsyncClient` — `follow_redirects=False`, standart timeout 10 s
  - `async def resolve_pin_id(url: str, client: httpx.AsyncClient) -> str`

- [ ] **Step 1: Write the failing tests** (`httpx.MockTransport` handler'i so'rovlarni qayd qiladi)

```python
@pytest.mark.parametrize("url, pin_id", [
    ("https://www.pinterest.com/pin/516647388484185204/", "516647388484185204"),
    ("https://mx.pinterest.com/pin/1128573987869737314/", "1128573987869737314"),
    ("https://www.pinterest.com/pin/30-scandinavian-living-room--816207132442097239/", "816207132442097239"),
    ("https://pinterest.co.uk/pin/123456789/", "123456789"),
    ("  https://www.pinterest.com/pin/123456789/?mt=login&utm_source=x#c  ", "123456789"),   # Review Focus 1
    ("https://WWW.Pinterest.COM./pin/123456789/", "123456789"),                               # Review Focus 2
])
async def test_pin_links_resolve_to_their_id_without_any_request(url, pin_id)   # assert result == pin_id; transport saw 0 requests

@pytest.mark.parametrize("url", [
    "http://www.pinterest.com/pin/123456789/", "https://www.pinterest.com:8443/pin/123456789/",
    "https://user@www.pinterest.com/pin/123456789/", "https://example.com/pin/123456789/",
    "https://pinterest.com.evil.com/pin/123456789/", "https://evilpinterest.com/pin/123456789/",
    "https://www.pinterest.com/someone/boards/", "https://www.pinterest.com/pin/abc/",
    "https://www.pinterest.com/pin/123/", "not a url", "",
])
async def test_anything_else_is_not_a_pin_url(url)                             # raises NotAPinUrl; 0 requests

async def test_a_pin_it_link_follows_its_redirects_to_the_pin()
    # pin.it/abc -> 301 api.pinterest.com/url_shortener/abc/redirect/ -> 302 www.pinterest.com/pin/987654321/ ; == "987654321"
    # every request had follow_redirects off (transport sees each hop separately)
async def test_a_pin_it_link_that_redirects_elsewhere_is_refused()             # Location https://evil.com/pin/1234567/ -> NotAPinUrl; evil.com never requested
async def test_more_than_3_redirects_is_refused()                              # 4 hops -> NotAPinUrl
async def test_a_pin_it_host_that_answers_405_to_head_is_asked_with_get()
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider tests/test_pinterest_pin.py`
Expected: collection error, chunki modul hali yo'q.

- [ ] **Step 3: Implement** `resolve_pin_id` va yordamchilarni `backend/app/services/pinterest_pin.py` da.

Tahlil `urllib.parse.urlsplit` bilan; host `hostname.rstrip(".").lower()`. ID `re.search(r"(\d{5,25})/?$", path_after_/pin/)` bilan olinadi. `pin.it` uchun `client.head(url)`, 405 bo'lsa `client.get(url)`. 3xx bo'lsa `Location` (`urljoin` bilan) olinadi va tekshiruvga qaytiladi.

- [ ] **Step 4: Run them to verify they pass**

Run: same as Step 2
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pinterest_pin.py backend/tests/test_pinterest_pin.py
git commit -m "A Pinterest pin link is checked against Pinterest's own hosts and reduced to its pin id"
```

---

### Task 2: Pin rasmini olish (`fetch_pin_image`)

**Files:**
- Modify: `backend/app/services/pinterest_pin.py`
- Test: `backend/tests/test_pinterest_pin.py`

**Interfaces:**
- Consumes: `MAX_DESIGN_IMAGE_BYTES`, `ImageTooLarge` (`app.services.design_image`); Task 1 istisnolari.
- Produces:
  - `@dataclass(frozen=True) class PinImage: data: bytes; content_type: str; url: str`
  - `async def fetch_pin_image(pin_id: str, client: httpx.AsyncClient) -> PinImage`

- [ ] **Step 1: Write the failing tests**

```python
async def test_the_736_version_of_the_oembed_thumbnail_is_fetched()
    # oembed -> {"thumbnail_url": "https://i.pinimg.com/236x/03/8b/x.jpg"}; i.pinimg.com/736x/03/8b/x.jpg -> 200 image/jpeg b"\xff\xd8\xffJPG"
    # result.url endswith "/736x/03/8b/x.jpg"; result.content_type == "image/jpeg"; oembed request url == OEMBED for "https://www.pinterest.com/pin/123456789/"
async def test_without_a_736_version_the_original_thumbnail_is_used()          # 736x -> 404, 236x -> 200
async def test_a_thumbnail_not_on_pinimg_is_never_requested()                  # thumbnail_url "https://evil.com/x.jpg" -> PinterestUnavailable; evil.com 0 requests
@pytest.mark.parametrize("status", [400, 404])
async def test_an_unknown_or_private_pin_is_not_found(status)                  # PinNotFound
async def test_pinterest_failing_is_unavailable()                              # oembed 500 / httpx.ReadTimeout / body "not json" -> PinterestUnavailable
async def test_an_image_response_that_is_not_an_image_is_unavailable()        # 736x -> 200 text/html
async def test_an_image_over_10_mb_is_too_large()                              # ImageTooLarge
async def test_no_request_follows_redirects()                                  # 736x -> 302 Location https://evil.com/ -> PinterestUnavailable; evil.com 0 requests
# Review Focus
async def test_a_thumbnail_that_is_not_236x_is_used_as_is()                     # "/564x/…" -> exactly one image request, to that url
async def test_a_chunked_image_without_content_length_still_stops_at_10_mb()  # streamed body, no Content-Length -> ImageTooLarge
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider tests/test_pinterest_pin.py`
Expected: Task 2 testlari FAIL (`fetch_pin_image` yo'q), Task 1 testlari PASS.

- [ ] **Step 3: Implement `fetch_pin_image`**

- oEmbed: `client.get(OEMBED, params={"url": canonical}, timeout=8)`;
- rasm: `client.stream("GET", url, timeout=10)` bilan `aiter_bytes()` va yig'ilgan hajmni tekshirish;
- host tekshiruvi `urlsplit(thumbnail_url).hostname == "i.pinimg.com"` va `scheme == "https"`;
- `httpx.HTTPError` va `ValueError` (JSON) → `PinterestUnavailable`.

- [ ] **Step 4: Run them to verify they pass**

Run: same as Step 2
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pinterest_pin.py backend/tests/test_pinterest_pin.py
git commit -m "A pin's image is fetched through oEmbed from i.pinimg.com, at 736 px when it exists"
```

---

### Task 3: Endpoint `POST /rooms/{room_id}/ai-design/pin`

**Files:**
- Modify: `backend/app/routers/ai.py`
- Test: `backend/tests/test_ai_design_pin_router.py`

**Interfaces:**
- Consumes: `pinterest_client`, `resolve_pin_id`, `fetch_pin_image`, `PinImage`, Task 1 istisnolari; 1-bosqichdagi `prepare_design_image`, `ImageTooLarge`, `UnsupportedImage`, `check_and_increment_budget_for`, `_run_design`, `_require_ai`, `_get_owned_room`.
- Produces: `class AiDesignPinRequest(BaseModel): url: str = Field(min_length=1, max_length=500); prompt: str | None = Field(None, max_length=500); room_type: str | None = Field(None, max_length=20)`. Endpoint 1-bosqich rejasi va `pin_image_url: str` bilan dict qaytaradi.

- [ ] **Step 1: Write the failing tests** (`test_ai_design_image_router.py` dagi `env` fixture uslubida; `resolve_pin_id`, `fetch_pin_image`, `design_room`, `check_and_increment_budget_for`, `_get_owned_room`, `_room_summary` patch qilinadi; `prepare_design_image` haqiqiy, `fetch_pin_image` haqiqiy JPEG qaytaradi)

```python
def test_a_pin_gives_the_plan_and_the_image_it_came_from()        # 200; body["pin_image_url"] == "https://i.pinimg.com/736x/x.jpg"; design_room got image=PreparedImage, prompt ""
def test_prompt_and_room_type_are_passed_on()
def test_not_a_pin_link_is_422_and_nothing_is_fetched_or_counted()   # resolve raises NotAPinUrl; detail == "Bu Pinterest pin havolasi emas"; fetch & budget not awaited
def test_an_unknown_pin_is_404_and_costs_nothing()                   # detail == "Pin topilmadi yoki u yopiq"
def test_pinterest_down_is_502_and_costs_nothing()                   # detail == "Pinterest hozir javob bermadi. Birozdan keyin urinib ko'ring"
def test_a_pin_image_over_10_mb_is_413_and_costs_nothing()
def test_a_pin_image_that_is_not_readable_is_415_and_costs_nothing()
def test_the_limit_is_the_shared_image_pool()                         # budget awaited with (str(user.id), "image_design", 10)
def test_the_daily_limit_is_429()                                     # detail == "Bugungi rasmdan dizayn limiti tugadi"
def test_ai_switched_off_is_503_before_anything_is_fetched()
def test_someone_elses_room_is_404_before_anything_is_fetched()
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider tests/test_ai_design_pin_router.py`
Expected: FAIL (route yoki import yo'q).

- [ ] **Step 3: Implement**

Endpoint `async with pinterest_client() as client:` ichida `resolve_pin_id`, keyin `fetch_pin_image` chaqiradi. Xatolar Global Constraints matnlari bilan HTTP kodlarga aylantiriladi. Keyin `run_in_threadpool(prepare_design_image, image.data, image.content_type)` → limit → `_run_design(room, (body.prompt or "").strip(), body.room_type, db, str(user.id), image=prepared)`. Natija dict'iga `pin_image_url=image.url` qo'shiladi. Log: `log.info("ai_design.pin", pin_id=..., width=..., height=...)`.

- [ ] **Step 4: Run the new tests and the full backend suite**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider`
Expected: hammasi PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/ai.py backend/tests/test_ai_design_pin_router.py
git commit -m "POST /rooms/{id}/ai-design/pin designs a room from a Pinterest pin"
```

---

### Task 4: Web — havola maydoni

**Files:**
- Modify: `frontend/src/lib/api/ai.ts`
- Modify: `frontend/src/components/studio/AiBuilderSheet.tsx`
- Modify: `frontend/src/locale/uz.ts`
- Test: `frontend/src/components/studio/AiBuilderSheet.test.tsx`

**Interfaces:**
- Consumes: Task 3 endpoint (JSON `{url, prompt?, room_type?}`).
- Produces:
  - `export async function aiDesignFromPin(roomId: string, url: string, prompt?: string, roomType?: string): Promise<AiDesignPlan>`;
  - `AiDesignPlan.pin_image_url?: string`;
  - `export function looksLikePinUrl(text: string): boolean` (`ai.ts` da): `https://` va host `pin.it` yoki `pinterest.` ni o'z ichiga olgan domen.

- [ ] **Step 1: Write the failing tests** (`aiDesignFromPin` mock'i qo'shiladi)

```tsx
it('turns a pasted pin link into a chip and removes it with ✕')               // label "Pinterest havolasi"; chip text "📌 Pinterest pin"; ✕ label "Havolani olib tashlash"
it('keeps one source: a link replaces the picked image, and an image replaces the link')
it('refuses a link that is not Pinterest before sending')                       // "https://example.com/x" -> "Bu Pinterest pin havolasi emas"; aiDesignFromPin not called
it('sends the link with the prompt and room kind, applies the plan and shows the pin it came from')
    // button "Pinterest'dan dizayn yaratish"; called ('room-1', url, 'faqat ranglarini ol', 'mehmonxona'); img alt "Shu pin asosida" src == plan.pin_image_url
it('after the link is removed the prompt is required again and goes to the text designer')
// Review Focus 5
it('a pin link pasted into the prompt box moves to the link field')           // textarea gets a pin url -> link chip shown, textarea empty
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && PATH=/Users/mac/.local/node/bin:$PATH npx vitest run src/components/studio/AiBuilderSheet.test.tsx`
Expected: yangi testlar FAIL.

- [ ] **Step 3: Implement**

`ai.ts` ga `aiDesignFromPin` va `looksLikePinUrl` qo'shiladi. Sheet'da:
- `pinUrl: string | null` holati va `<input type="url" aria-label="Pinterest havolasi">`; to'g'ri havola kiritilganda chip ko'rsatiladi;
- `setPinUrl` rasmni, `pickImage` havolani tozalaydi;
- textarea'ga `looksLikePinUrl` mos matn kelsa, u havolaga ko'chiriladi;
- `generate()`: pin bo'lsa `aiDesignFromPin`, rasm bo'lsa `aiDesignFromImage`, aks holda `aiDesign`;
- natijada `plan.pin_image_url` bo'lsa, `<img alt="Shu pin asosida">`.

`uz.ai` ga matnlar (aynan shu):

```ts
pin_label: "Pinterest havolasi",
pin_placeholder: "pinterest.com/pin/… yoki pin.it/…",
pin_chip: "📌 Pinterest pin",
pin_olib_tashlash: "Havolani olib tashlash",
pin_xato: "Bu Pinterest pin havolasi emas",
pindan_yarat: "Pinterest'dan dizayn yaratish",
pin_asosida: "Shu pin asosida",
```

- [ ] **Step 4: Run the full frontend suite and the type check**

Run: `cd frontend && PATH=/Users/mac/.local/node/bin:$PATH npx vitest run && PATH=/Users/mac/.local/node/bin:$PATH npx tsc --noEmit -p .`
Expected: hammasi PASS, tsc xatosiz.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/ai.ts frontend/src/components/studio/AiBuilderSheet.tsx frontend/src/components/studio/AiBuilderSheet.test.tsx frontend/src/locale/uz.ts
git commit -m "The studio's AI designer takes a Pinterest pin link"
```

---

### Task 5: Haqiqiy tekshiruv, mobil handoff va PR

**Files:**
- Modify: `docs/MOBILE_QA_HANDOFF.md` (6-bo'lim: "Pinterest havolasidan AI dizayn")

- [ ] **Step 1: Real Pinterest requests (free)**

Local'da konteyner ichidan `resolve_pin_id` va `fetch_pin_image` ni haqiqiy pinlar bilan chaqiring: `https://www.pinterest.com/pin/516647388484185204/`, slug'li `…--816207132442097239/`, `https://mx.pinterest.com/pin/1128573987869737314/`. Haqiqiy `pin.it` havolasi topilsa, u ham sinanadi.
Expected: har biri 736x JPEG qaytaradi (`content_type` `image/jpeg`, hajm 10 MB dan kichik).

- [ ] **Step 2: Real design calls (≤2 paid)**

Bitta pin bilan `curl` orqali endpoint, bitta pin bilan web UI'da AI sheet orqali.
Expected: 200, `pin_image_url` bor, reja qo'llanadi, konsolda xato yo'q. Natija jadvalda yoziladi.

- [ ] **Step 3: Add the mobile handoff section**

`docs/MOBILE_QA_HANDOFF.md` ga 6-bo'lim qo'shiladi:
- endpoint va maydonlar;
- xato kodlari va matnlari;
- umumiy limit;
- Share → andoza.ai: Pinterest ulashgan matndan URL'ni ajratib (`https://…` bo'lagi), shu endpoint'ga `url` sifatida yuborish.

- [ ] **Step 4: Commit, push and open the PR**

```bash
git add docs/MOBILE_QA_HANDOFF.md
git commit -m "Mobile handoff: AI design from a Pinterest pin"
git push -u origin feat/ai-design-pinterest
gh pr create --base master --title "AI design from a Pinterest pin link (Pinterest step 2)" --body "<summary, SSRF note, real-check table, deploy note: no migration, server must reach www.pinterest.com / pin.it / i.pinimg.com, merge = deploy>"
```

Expected: PR ochiladi, CI yashil. Merge'ni foydalanuvchi so'raganda qiling.
