# Rasmdan AI dizayn — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Studiyadagi AI dizaynerga ilhom rasmini (va ixtiyoriy matnni) yuborib, katalogdan qo'llanadigan xona dizayn rejasini olish.

**Architecture:** Yangi `POST /rooms/{room_id}/ai-design/image` endpoint rasmni tekshiradi va kichraytiradi (`design_image.py`), alohida kunlik limitni oshiradi, so'ng mavjud `design_room()` ni rasm bloki bilan chaqiradi. LLM qatlami Anthropic uslubidagi rasm blokini OpenAI `image_url` formatiga o'giradi. Javob mavjud `/ai-design` bilan bir xil `DesignPlan`, shuning uchun web'dagi qo'llash oqimi o'zgarmaydi. Faqat `AiBuilderSheet` ga rasm tanlash qo'shiladi.

**Tech Stack:** FastAPI, Pillow, OpenAI-compatible chat API (`gpt-4.1-mini`), pytest; React 18, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-ai-design-from-image-design.md`

## Global Constraints

- Ruxsat etilgan turlar: `image/jpeg`, `image/png`, `image/webp`. Tur sarlavhadan ham, birinchi baytlardan ham tekshiriladi.
- Rasm hajmi chegarasi: 10 MB (`10 * 1024 * 1024` bayt).
- Kichraytirish: uzun tomon 1024 px gacha, kichik rasm kattalashtirilmaydi. Chiqish: RGB, EXIF'siz JPEG, sifat 85.
- `prompt`: ixtiyoriy, 500 belgigacha. Bo'sh yoki faqat bo'sh joy bo'lsa, "berilmagan" deb olinadi. `room_type`: ixtiyoriy, 20 belgigacha.
- Limit: `image_design` pool'i, `IMAGE_DESIGN_DAILY_LIMIT: int = 10`, `check_and_increment_budget_for` orqali. Rasmli chaqiruvda `call_llm(user_id=None)`, ya'ni `builder` pool'i hisoblanmaydi.
- Tartib: AI yoqilganmi → xona egasi → rasm tekshiruvi → limit → LLM. 404 va 415 limitni kamaytirmaydi.
- Rasm faqat xotirada: diskka, S3 ga, bazaga yoki logga yozilmaydi (logga faqat hajm va o'lcham).
- Xato matnlari (aynan shu):
  - 413: `"Rasm hajmi 10 MB dan oshmasligi kerak"`
  - 415: `"Faqat JPEG, PNG yoki WebP rasm yuklang"`
  - 429: `"Bugungi rasmdan dizayn limiti tugadi"`
- Mavjud `POST /rooms/{room_id}/ai-design` contract'i va testlari o'zgarmaydi.
- `master`ga merge = production deploy. Ish `feat/ai-design-image` branch'ida, PR orqali.

## Review Focus

1. **Shikastlangan fayl:** sarlavhasi to'g'ri, lekin ichi buzilgan JPEG yoki PNG (Pillow ocholmaydi) 500 emas, 415 qaytarishi kerak. Test Task 1 da.
2. **Juda katta o'lchamli kichik fayl:** masalan 20000×20000 px, kam baytli. Bu "decompression bomb", server xotirasini to'ldirmasdan 415 qaytarishi kerak. Test Task 1 da.
3. **Shaffof PNG:** RGBA rasm JPEG ga o'tganda shaffof joylar qora emas, oq bo'lishi kerak. Aks holda AI "qorong'i xona" deb o'qiydi. Test Task 1 da.
4. **Telefonda olingan surat:** EXIF'dagi burilish (orientation) EXIF o'chirilishidan oldin qo'llanishi kerak, aks holda AI yonboshlab yotgan rasmni ko'radi. Test Task 1 da.
5. **Rasmni olib tashlash:** foydalanuvchi rasmni ✕ bilan olib tashlasa, matn yana majburiy bo'ladi (kamida 3 belgi) va keyingi so'rov matnli `aiDesign` ga ketadi. Test Task 5 da.

---

### Task 1: Rasmni tekshirish va tayyorlash servisi

**Files:**
- Create: `backend/app/services/design_image.py`
- Test: `backend/tests/test_design_image.py`

**Interfaces:**
- Produces:
  - `MAX_DESIGN_IMAGE_BYTES = 10 * 1024 * 1024`
  - `class UnsupportedImage(Exception)`, `class ImageTooLarge(Exception)`
  - `@dataclass(frozen=True) class PreparedImage: media_type: str; data_b64: str; width: int; height: int`
  - `prepare_design_image(data: bytes, content_type: str | None) -> PreparedImage`

- [ ] **Step 1: Write the failing tests** (`test_design_image.py`; test rasmlarini Pillow bilan xotirada yasang, fayl yo'q)

```python
def test_jpeg_png_and_webp_are_accepted_and_come_out_as_jpeg(fmt, ctype)  # parametrize: JPEG/image/jpeg, PNG/image/png, WEBP/image/webp
    p = prepare_design_image(_img(fmt, 300, 200), ctype)
    assert p.media_type == "image/jpeg" and base64.b64decode(p.data_b64)[:3] == b"\xff\xd8\xff"
def test_a_header_that_lies_about_the_content_is_refused():
    with pytest.raises(UnsupportedImage): prepare_design_image(b"<script>alert(1)</script>" + b"0"*100, "image/jpeg")
def test_an_unlisted_type_is_refused():          # "image/heic", "image/gif", None
def test_more_than_10_mb_is_too_large():
    with pytest.raises(ImageTooLarge): prepare_design_image(b"\xff\xd8\xff" + b"0" * MAX_DESIGN_IMAGE_BYTES, "image/jpeg")
def test_a_big_image_is_shrunk_to_1024_on_its_long_side():   # 3000x1500 -> (1024, 512)
def test_a_small_image_is_not_enlarged():                    # 500x400 -> (500, 400)
def test_exif_is_gone_from_the_output():                     # input with GPS EXIF -> Image.open(out).getexif() == {}
# Review Focus
def test_a_truncated_file_with_a_good_header_is_unsupported():   # valid JPEG bytes cut to half
def test_a_decompression_bomb_is_unsupported():                  # PNG header claiming 20000x20000
def test_transparent_png_areas_become_white_not_black():         # RGBA fully transparent 10x10 -> output pixel (0,0) all channels >= 250
def test_exif_rotation_is_applied_before_it_is_dropped():        # 200x100 JPEG with Orientation=6 -> output (100, 200)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider tests/test_design_image.py`
Expected: collection error, chunki `app.services.design_image` hali yo'q.

- [ ] **Step 3: Implement `prepare_design_image` in `backend/app/services/design_image.py`**

Tartib:
1. Turni `{"image/jpeg","image/png","image/webp"}` bilan tekshirish.
2. Hajmni `MAX_DESIGN_IMAGE_BYTES` bilan tekshirish.
3. Birinchi baytlar: `\xff\xd8\xff`, `\x89PNG`, yoki `RIFF` + 8–12 baytlarda `WEBP`.
4. `Image.MAX_IMAGE_PIXELS` ni 40 mln qilib ochish, `img.load()`. `DecompressionBombError`, `DecompressionBombWarning` (`warnings.simplefilter("error", ...)`), `UnidentifiedImageError` va `OSError` → `UnsupportedImage`.
5. `ImageOps.exif_transpose`.
6. Alfa kanalli rasmni oq fonga `alpha_composite` qilish, keyin `RGB`.
7. `thumbnail((1024, 1024))`.
8. `save(format="JPEG", quality=85)`. `exif` argumenti berilmagani uchun EXIF yo'qoladi.

- [ ] **Step 4: Run them to verify they pass**

Run: same as Step 2
Expected: hammasi PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/design_image.py backend/tests/test_design_image.py
git commit -m "An inspiration image is checked, shrunk and stripped before the AI sees it"
```

---

### Task 2: LLM qatlamida rasm bloki

**Files:**
- Modify: `backend/app/services/llm.py` (`_to_openai_messages`, user content tarmog'i)
- Test: `backend/tests/test_llm_images.py`

**Interfaces:**
- Produces: `call_llm(messages=[{"role": "user", "content": [ {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "<b64>"}}, {"type": "text", "text": "..."} ]}])` qabul qiladi.

- [ ] **Step 1: Write the failing tests**

```python
def test_an_image_block_becomes_an_openai_image_url_part():
    out = _to_openai_messages([{"role": "user", "content": [IMG, {"type": "text", "text": "salom"}]}])
    assert out == [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,QUJD"}},
        {"type": "text", "text": "salom"}]}]
def test_text_only_messages_are_unchanged():          # str content and [text, tool_result] lists give the same output as before
```
(`IMG = {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "QUJD"}}`)

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider tests/test_llm_images.py`
Expected: birinchi test FAIL, chunki rasm tashlab yuboriladi.

- [ ] **Step 3: Implement**

User content ro'yxatida `image` bloki bo'lsa, xabar `content` ni OpenAI qismlar ro'yxati sifatida yuboring: rasmlar `image_url`, matnlar `{"type":"text"}`, tartib saqlanadi. Rasm bo'lmasa, hozirgi `"\n".join(text_parts)` yo'li o'zgarmaydi.

- [ ] **Step 4: Run them, plus the existing LLM tests**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider tests/test_llm_images.py tests/test_llm_budget.py tests/test_ai_designer.py`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/llm.py backend/tests/test_llm_images.py
git commit -m "The LLM layer passes image blocks through to the model"
```

---

### Task 3: `design_room` rasm bilan

**Files:**
- Modify: `backend/app/services/ai_designer.py` (`design_room`, yangi `_IMAGE_INSTRUCTIONS`, `_IMAGE_DEFAULT_PROMPT`)
- Test: `backend/tests/test_ai_designer.py` (`TestDesignRoom` ga qo'shiladi)

**Interfaces:**
- Consumes: `PreparedImage` (Task 1), rasm bloki formati (Task 2).
- Produces: `async def design_room(prompt: str, room: dict, furniture_items: list[dict], *, user_id: str, image: PreparedImage | None = None) -> DesignPlan`

- [ ] **Step 1: Write the failing tests** (mavjud `_reply`, `ROOM`, `ITEMS`, `GOOD` dan foydalaning)

```python
async def test_with_an_image_the_model_gets_the_picture_and_the_image_instructions(self):
    # image=PreparedImage("image/jpeg", "QUJD", 10, 10), prompt "faqat ranglarini ol"
    content = sent["messages"][0]["content"]
    assert content[0] == {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "QUJD"}}
    assert "faqat ranglarini ol" in content[1]["text"] and ad._IMAGE_INSTRUCTIONS in content[1]["text"] and "F1: Divan" in content[1]["text"]
    assert sent["user_id"] is None          # limit is counted by the router, in its own pool
async def test_with_an_image_and_no_prompt_the_default_prompt_is_used(self):   # prompt "" -> ad._IMAGE_DEFAULT_PROMPT in text
async def test_an_image_plan_is_checked_like_any_other(self):                  # reply with an invented furniture id -> dropped
async def test_without_an_image_nothing_changes(self):                          # content is still a str, user_id == "u"
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider tests/test_ai_designer.py`
Expected: yangi testlar FAIL (`image` argumenti yo'q).

- [ ] **Step 3: Implement**

`image` berilsa:
- foydalanuvchi xabari `[image_block, {"type": "text", "text": build_user_message(prompt or _IMAGE_DEFAULT_PROMPT, ...) + "\n\n" + _IMAGE_INSTRUCTIONS}]` bo'ladi;
- `call_llm(user_id=None, ...)`;
- qolgan argumentlar va keyingi mantiq (`validate_plan`, `reconcile_summary`) o'zgarmaydi.

Matnlar (aynan shu):

```python
_IMAGE_DEFAULT_PROMPT = "Rasmdagi interyer uslubini shu xonada takrorlang."
_IMAGE_INSTRUCTIONS = (
    "Foydalanuvchi ilhom rasmini yubordi. Rasmdan uslubni o'qing: devor rangi yoki oboy, "
    "pol turi va naqshi, chiroqlar kayfiyati, mebel turlari. Faqat yuqoridagi menyudan eng "
    "yaqinini tanlang. Foydalanuvchi matni rasmdan ustun turadi. summary da rasmdan nimani "
    "olganingizni va katalogda nima topilmaganini ochiq ayting. Rasmda xona bo'lmasa ham, "
    "undagi ranglar va kayfiyatdan foydalaning."
)
```

- [ ] **Step 4: Run them to verify they pass**

Run: same as Step 2
Expected: PASS (eski testlar ham).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_designer.py backend/tests/test_ai_designer.py
git commit -m "The AI designer can take its style from an inspiration image"
```

---

### Task 4: Endpoint, limit va umumiy yordamchi

**Files:**
- Modify: `backend/app/routers/ai.py`
- Modify: `backend/app/config.py` (`IMAGE_DESIGN_DAILY_LIMIT: int = 10`, `RENDER_DAILY_LIMIT` yonida)
- Test: `backend/tests/test_ai_design_image_router.py`

**Interfaces:**
- Consumes: `prepare_design_image`, `UnsupportedImage`, `ImageTooLarge` (Task 1); `design_room(..., image=)` (Task 3); `check_and_increment_budget_for(user_id, pool, limit)` va `BudgetExceededError` (`app.services.llm`).
- Produces:
  - `POST /api/v1/rooms/{room_id}/ai-design/image` (multipart: `image: UploadFile`, `prompt: str | None = Form(None, max_length=500)`, `room_type: str | None = Form(None, max_length=20)`) → `DesignPlan` dict.
  - `ai.py` ichida umumiy yordamchi `async def _run_design(room, prompt: str, room_type: str | None, db, user_id: str, image: PreparedImage | None = None) -> dict`: furniture ro'yxati, `_room_summary`, `design_room`, va `DesignError`→422, `BudgetExceededError`→429, boshqa xato→502. `/ai-design` ham shuni ishlatadi.

- [ ] **Step 1: Write the failing tests** (`_get_owned_room`, `design_room`, `check_and_increment_budget_for` patch qilinadi; mock DB `test_room_walls.py` kabi)

```python
def test_an_image_gives_the_same_plan_shape_as_the_text_designer()   # 200; body has title, summary, walls, floor, lights, furniture; design_room got image=PreparedImage, prompt "" when none sent
def test_prompt_and_room_type_are_passed_on()                         # prompt "  faqat ranglarini ol " -> "faqat ranglarini ol"; room_type "mehmonxona"
def test_someone_elses_room_is_404_and_costs_nothing()                # _get_owned_room raises 404 -> budget not called
def test_not_an_image_is_415_and_costs_nothing()                      # detail == "Faqat JPEG, PNG yoki WebP rasm yuklang"; budget not called
def test_too_large_is_413_and_costs_nothing()                         # detail == "Rasm hajmi 10 MB dan oshmasligi kerak"
def test_the_daily_limit_is_429()                                     # budget raises BudgetExceededError -> 429, detail == "Bugungi rasmdan dizayn limiti tugadi"; design_room not called
def test_the_limit_is_the_image_pool_with_its_own_cap()               # check_and_increment_budget_for awaited with (str(user.id), "image_design", 10)
def test_a_provider_failure_is_502() ; def test_an_unusable_plan_is_422()
def test_ai_switched_off_is_503()                                     # settings.AI_FEATURES_ENABLED False
def test_the_text_endpoint_still_works_through_the_shared_helper()   # POST /ai-design JSON -> 200, design_room called without image
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider tests/test_ai_design_image_router.py`
Expected: 404 yoki 405, chunki route hali yo'q.

- [ ] **Step 3: Implement**

`IMAGE_DESIGN_DAILY_LIMIT` ni config'ga qo'shing. `_run_design` ga chiqaring va `/ai-design` ni unga o'tkazing. Yangi route spec'dagi tartib bo'yicha ishlaydi:
1. `AI_FEATURES_ENABLED` → 503.
2. `_get_owned_room`.
3. `await image.read()` → `prepare_design_image(data, image.content_type)` (415, 413).
4. `check_and_increment_budget_for(str(current_user.id), "image_design", settings.IMAGE_DESIGN_DAILY_LIMIT)` (429).
5. `_run_design(..., image=prepared)`.

Logga faqat `width`, `height` va bayt hajmi yoziladi.

- [ ] **Step 4: Run the new tests and the full backend suite**

Run: `docker compose exec -T api python -m pytest -q -p no:cacheprovider`
Expected: hammasi PASS (oldingi 1077 ta va yangilari).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/ai.py backend/app/config.py backend/tests/test_ai_design_image_router.py
git commit -m "POST /rooms/{id}/ai-design/image designs a room from an inspiration image"
```

---

### Task 5: Web — AI sheet'da rasm

**Files:**
- Modify: `frontend/src/lib/api/ai.ts`
- Modify: `frontend/src/components/studio/AiBuilderSheet.tsx`
- Modify: `frontend/src/locale/uz.ts` (`uz.ai`)
- Test: `frontend/src/components/studio/AiBuilderSheet.test.tsx`

**Interfaces:**
- Consumes: Task 4 endpoint (multipart maydonlar: `image`, `prompt`, `room_type`).
- Produces: `export async function aiDesignFromImage(roomId: string, image: File, prompt?: string, roomType?: string): Promise<AiDesignPlan>`. FormData ishlatiladi, bo'sh `prompt` yuborilmaydi.

- [ ] **Step 1: Write the failing tests** (`vi.mock('@/lib/api')` ga `aiDesignFromImage` qo'shing; `URL.createObjectURL`/`revokeObjectURL` stub)

```tsx
it('shows a preview of the picked image and removes it with ✕')
it('lets an image go with an empty prompt, and names the button for it')      // button text "Rasmdan dizayn yaratish", enabled
it('sends the image with the prompt and room kind, and applies the plan')     // aiDesignFromImage('room-1', file, 'faqat ranglarini ol', 'mehmonxona'); plan applied as with aiDesign
it('refuses a wrong type or an over-10-MB file before sending')                // messages from uz.ai.rasm_turi_xato / uz.ai.rasm_hajmi_xato; aiDesignFromImage not called
it("shows the server's limit message on 429")                                  // rejects with Error('{"detail":"Bugungi rasmdan dizayn limiti tugadi"}') -> shown
// Review Focus 5
it('after the image is removed the prompt is required again and goes to the text designer')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && PATH=/Users/mac/.local/node/bin:$PATH npx vitest run src/components/studio/AiBuilderSheet.test.tsx`
Expected: yangi testlar FAIL.

- [ ] **Step 3: Implement**

`aiDesignFromImage` ni qo'shing. Sheet'da:
- `image: File | null` va `previewUrl` holatlari;
- yashirin `<input type="file" accept="image/jpeg,image/png,image/webp">` va "Rasm qo'shish" tugmasi;
- tur va 10 MB tekshiruvi tanlangan zahoti;
- `generate()` rasm bo'lsa `aiDesignFromImage`, bo'lmasa `aiDesign` chaqiradi;
- rasm bo'lsa tugma bo'sh matn bilan ham faol;
- object URL rasm olib tashlanganda va unmount'da bo'shatiladi.

`uz.ai` ga matnlar (aynan shu):

```ts
rasm_qoshish: "Rasm qo'shish",
rasm_olib_tashlash: "Rasmni olib tashlash",
rasm_placeholder: "Ixtiyoriy: masalan, faqat ranglarini ol",
rasmdan_yarat: "Rasmdan dizayn yaratish",
rasm_turi_xato: "Faqat JPEG, PNG yoki WebP rasm yuklang",
rasm_hajmi_xato: "Rasm hajmi 10 MB dan oshmasligi kerak",
```

- [ ] **Step 4: Run the sheet tests, the full suite and the type check**

Run: `cd frontend && PATH=/Users/mac/.local/node/bin:$PATH npx vitest run && PATH=/Users/mac/.local/node/bin:$PATH npx tsc --noEmit -p .`
Expected: hammasi PASS, tsc xatosiz.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/ai.ts frontend/src/components/studio/AiBuilderSheet.tsx frontend/src/components/studio/AiBuilderSheet.test.tsx frontend/src/locale/uz.ts
git commit -m "The studio's AI designer takes an inspiration image"
```

---

### Task 6: Haqiqiy sifat tekshiruvi, mobil handoff va PR

**Files:**
- Modify: `docs/MOBILE_QA_HANDOFF.md` (yangi bo'lim: "Rasmdan AI dizayn")

- [ ] **Step 1: Run the feature for real in the browser**

Local stack (`AI_FEATURES_ENABLED=true`, haqiqiy kalit) va studiyada AI sheet orqali 5 tagacha turli uslubdagi rasm sinanadi: oq skandinav, qorong'i loft, klassik, faqat rang palitrasi, telefonda burilgan surat. Har biri uchun yoziladi: rasm, `title`/`summary`, devor/pol/chiroq/mebel tanlovi rasmga mos keldimi (ha / qisman / yo'q). Bu jami 5 tagacha pullik chaqiruv.

Expected: 5 tadan kamida 4 tasida devor va pol tanlovi rasmga mos. `summary` katalogda yo'q narsani aytadi. Studiyada reja qo'llanadi, konsolda xato yo'q.

- [ ] **Step 2: Add the mobile handoff section**

`docs/MOBILE_QA_HANDOFF.md` ga qo'shing:
- endpoint va maydonlar jadvali;
- xato kodlari va matnlari (Global Constraints dagi matnlar);
- limit 10/kun, `image_design` pool'i;
- Flutter WebView'da `<input type="file">` uchun fayl tanlash ruxsati kerakligi;
- 2-bosqich: Pinterest ilovasidan "Share → andoza.ai".

- [ ] **Step 3: Commit, push and open the PR**

```bash
git add docs/MOBILE_QA_HANDOFF.md
git commit -m "Mobile handoff: AI design from an image"
git push -u origin feat/ai-design-image
gh pr create --base master --title "AI design from an inspiration image (Pinterest step 1)" --body "<summary, deploy note: no migration, IMAGE_DESIGN_DAILY_LIMIT=10, merge = deploy; quality-check table from Step 1>"
```

Expected: PR ochiladi va CI (backend, frontend) yashil. Merge'ni foydalanuvchi so'raganda qiling, chunki merge = deploy.
