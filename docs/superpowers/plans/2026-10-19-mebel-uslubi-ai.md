# Mebel uslubini AI bilan qo'yish — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uslubi hech kim qo'ymagan mebelga AI uslub qo'yadi. Bu admin tugmasi bilan yoki uslubsiz yuklashda fonda ishga tushadi. Qo'lda qo'yilgan uslubga AI tegmaydi.

**Architecture:** `furniture.styles_source` (`NULL` | `'manual'` | `'ai'`) kim qo'yganini saqlaydi. Ishning o'zini AI xizmati (`furniture_style_ai.py`), Celery vazifasi (`tasks/furniture_styles.py`) va navbatga qo'yish yordamchisi (`furniture_style_queue.py`) bajaradi. Admin endpoint barcha `NULL` larni navbatga qo'yadi, frontend'da esa tugma va "AI qo'ygan" yozuvi qo'shiladi.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Celery, OpenAI-compatible `call_llm`, pytest (`docker exec andoza_ai-api-1 pytest`), React, vitest (`cd frontend && PATH=/Users/mac/.local/node/bin:$PATH npx vitest run`).

**Spec:** [docs/superpowers/specs/2026-10-19-mebel-uslubi-ai-design.md](../specs/2026-10-19-mebel-uslubi-ai-design.md)

## Global Constraints
- `styles_source` qiymatlari faqat `None`, `"manual"`, `"ai"`.
- Uslublar va tartib: `FURNITURE_STYLES` (`backend/app/schemas/admin_catalog.py`). AI natijasi ko'pi bilan 3 ta.
- AI faqat `styles_source IS NULL` mebelga yozadi. Yozish shartli: `UPDATE … WHERE id = :id AND styles_source IS NULL`.
- AI chaqiruvi: `model=settings.AI_MODEL_BUILDER`, `user_id=None`.
- Admin endpoint: `POST /api/v1/admin/furniture/classify-styles` → `{"queued": N}`; AI o'chiq bo'lsa 503 `"AI hozir o'chirilgan"`.
- Matnlar:
  - tugma: "AI bilan uslub qo'yish";
  - natija: "{N} ta model navbatga qo'yildi. Bir necha daqiqada uslublar paydo bo'ladi.";
  - N = 0: "Uslubi qo'yilmagan model yo'q.";
  - dialog: "AI qo'ygan — tekshirib, kerak bo'lsa tuzating".
- Navbatga qo'yish yuklashni hech qachon buzmaydi (broker xatosi log qilinadi).
- Commit oxirida: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Merge = production deploy va migratsiya. Faqat foydalanuvchi aytganda, CI yashil bo'lgach.

## Review Focus
1. Sotuvchi PATCH'da faqat narxni o'zgartirsa, `styles_source` `NULL` qolishi kerak (aks holda AI uni hech qachon ko'rmaydi). Test Task 1 da.
2. AI javobi JSON emas, markdown ichida JSON, yoki `styles` matn bo'lsa: xato emas, `[]` yoki to'g'ri o'qilgan ro'yxat chiqishi kerak. Test Task 2 da.
3. Vazifa ishlayotganda sotuvchi uslubni qo'lda qo'ysa, AI uni bosib ketmasligi kerak. Shartli UPDATE testi Task 3 da.
4. Thumbnail S3 da yo'q yoki rasm emas bo'lsa, vazifa rasmsiz davom etishi kerak. Test Task 3 da.
5. Admin tugmani tez-tez ikki marta bossa, ikki so'rov ketmasligi kerak (tugma bloklanadi). Test Task 5 da.

---

### Task 1: `styles_source`: migratsiya, model va kim yozishi

**Files:**
- Create: `backend/alembic/versions/1786000039_furniture_styles_source.py` (`down_revision = "1786000038"`)
- Modify: `backend/app/models/furniture.py` (`styles` ostiga)
- Modify: `backend/app/schemas/seller.py` (`SellerFurnitureOut`), `backend/app/schemas/admin_catalog.py` (`FurnitureAdminOut`)
- Modify: `backend/app/routers/seller.py` (upload ~213, PATCH ~330, serializer), `backend/app/routers/admin_catalog.py` (upload ~240, PATCH ~440, serializer)
- Test: `backend/tests/test_seller.py`, `backend/tests/test_admin_catalog.py`

**Interfaces:** Produces: `Furniture.styles_source: Mapped[str | None]`. Javoblarda `styles_source: str | None = None`.

- [ ] **Step 1: Failing testlar** (mavjud styles testlari uslubida, ikkala router uchun):
  - uslubli yuklash → `res.json()["styles_source"] == "manual"`, saqlangan obyektda `styles_source == "manual"`;
  - uslubsiz yuklash → `styles_source is None`;
  - PATCH `{"styles": []}` → `"manual"`;
  - PATCH `{"price_uzs": 5}` (`styles` yo'q) → `styles_source` o'zgarmaydi (`None` qoladi);
  - PATCH `{"styles": None}` → o'zgarmaydi.

  Fixture mock modellarga `styles_source=None` qo'shiladi.
- [ ] **Step 2:** `docker exec andoza_ai-api-1 pytest tests/test_seller.py tests/test_admin_catalog.py -q`. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.**
  - Model: `styles_source: Mapped[str | None] = mapped_column(String(10), nullable=True, comment=...)`.
  - Migratsiya: `add_column`, keyin `op.execute("UPDATE furniture SET styles_source = 'manual' WHERE styles <> '{}'")`; `downgrade` ustunni o'chiradi.
  - Upload: natija bo'sh bo'lmasa `styles_source="manual"`.
  - PATCH: `styles` normalize qilingan har qanday holatda `f.styles_source = "manual"`.
  - Serializerlar `styles_source=f.styles_source`.
- [ ] **Step 4:** `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` (konteynerda), so'ng to'liq backend suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "Furniture remembers who set its styles".

---

### Task 2: AI xizmati

**Files:** Create: `backend/app/services/furniture_style_ai.py`. Test: `backend/tests/test_furniture_style_ai.py`.

**Interfaces:**
- Consumes: `FURNITURE_STYLES`, `PreparedImage` (`app.services.design_image`), `call_llm` (`app.services.llm`).
- Produces:
  - `async def classify_furniture_styles(name_uz: str, category: str, image: PreparedImage | None) -> list[str]`;
  - `def parse_styles_answer(text: str) -> list[str]`.

- [ ] **Step 1: Failing testlar.** `call_llm` `monkeypatch` bilan almashtiriladi va `LLMMessage(content=[TextBlock(text=...)])` qaytaradi (`app.services.llm` dagi tiplar).

```python
@pytest.mark.parametrize(("text", "styles"), [
    ('{"styles": ["hitech", "zamonaviy"]}', ["zamonaviy", "hitech"]),
    ('```json\n{"styles": ["loft"]}\n```', ["loft"]),
    ('{"styles": ["barokko", "milliy", "milliy"]}', ["milliy"]),
    ('{"styles": ["klassik","neoklassika","loft","milliy"]}', ["neoklassika", "klassik", "loft"]),  # first 3, then catalog order
    ('{"styles": "hitech"}', []),
    ("bilmayman", []),
])
def test_the_answer_is_read_safely(text, styles):
    assert parse_styles_answer(text) == styles

async def test_with_a_picture_the_model_sees_it(fake_llm):
    await classify_furniture_styles("Divan", "divan", PreparedImage(media_type="image/jpeg", data_b64="eA==", width=10, height=10))
    content = fake_llm.calls[0]["messages"][0]["content"]
    assert any(b.get("type") == "image" for b in content)
    assert fake_llm.calls[0]["user_id"] is None

async def test_without_a_picture_only_the_name_goes(fake_llm):
    await classify_furniture_styles("Hi-Tech stol", "stol", None)
    content = fake_llm.calls[0]["messages"][0]["content"]
    assert not any(isinstance(b, dict) and b.get("type") == "image" for b in content)
```

- [ ] **Step 2:** Testni ishga tushirish. Kutilgan natija: FAIL (modul yo'q).
- [ ] **Step 3: Implementatsiya.**
  - Prompt spec'ning 2-bo'limidagi uslub belgilari bilan yoziladi.
  - `parse_styles_answer` birinchi `{` va oxirgi `}` orasini `json.loads` qiladi, `ai_designer.py:125` dagi kabi.
  - Rasm bloki `ai_designer.py:371` dagi formatda beriladi.
  - `max_tokens=200`, `temperature=0`.
- [ ] **Step 4:** Testlar va to'liq suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "AI reads a furniture model's styles from its picture and name".

---

### Task 3: Celery vazifasi va yuklashda navbatga qo'yish

**Files:**
- Create: `backend/app/tasks/furniture_styles.py`, `backend/app/services/furniture_style_queue.py`
- Modify: `backend/celery_app.py` (`Celery("uytamir", include=[...])` ro'yxatiga `"app.tasks.furniture_styles"` qo'shiladi; usiz worker vazifani tanimaydi), `backend/app/routers/seller.py` va `backend/app/routers/admin_catalog.py` (upload)
- Test: `backend/tests/test_furniture_style_task.py`, `test_seller.py`, `test_admin_catalog.py`

**Interfaces:**
- Consumes: Task 2 `classify_furniture_styles`; Task 1 `styles_source`.
- Produces:
  - `classify_furniture_styles_task` (Celery), argumenti `furniture_id: str`. Nom berilmaydi: standart nom `app.tasks.furniture_styles.classify_furniture_styles_task` bo'ladi va `celery_app.py` dagi `"app.tasks.*": {"queue": "default"}` yo'nalishiga tushadi, uni prod worker tinglaydi (`-Q default,media`). Boshqacha nom berilsa, vazifa hech kim tinglamaydigan navbatga ketadi;
  - async yadro `async def run_classification(furniture_id: str) -> dict` (`{"status": "classified"|"skipped"|"failed", "styles": list[str]}`);
  - `enqueue_style(furniture_id: str) -> None`;
  - `enqueue_style_after_commit(db, furniture_id: str) -> None`.
- DB o'qish va yozish `async def _load(furniture_id) -> tuple[name_uz, category, thumbnail_key, styles_source] | None` va `async def _save(furniture_id, styles) -> bool` (shartli UPDATE; yozilgan qatorlar soni 1 bo'lsa `True`) orqali bo'ladi. Testlar ularni almashtiradi. Bu `test_optimize_model_task.py` dagi `_Rows` naqshi.

- [ ] **Step 1: Failing testlar** (`test_furniture_style_task.py`, `_load`/`_save`/`download_file`/`classify_furniture_styles`/`cache_delete_prefix` monkeypatch qilinadi):
  - `NULL` mebel → `_save(id, ["loft"])` chaqiriladi, `status == "classified"`, kesh `"furniture:"` prefiksi bilan tozalanadi;
  - `styles_source == "manual"` → AI chaqirilmaydi, `"skipped"`;
  - mebel yo'q → `"skipped"`;
  - `_save` `False` qaytarsa (shu orada qo'lda qo'yilgan) → `"skipped"`, kesh tozalanmaydi;
  - AI istisno ko'tarsa → `_save` chaqirilmaydi, `"failed"`;
  - `download_file` xato bersa yoki rasm emas bo'lsa → AI `image=None` bilan chaqiriladi;
  - `settings.AI_FEATURES_ENABLED=False` → AI chaqirilmaydi, `"skipped"`.

  Yana bitta test: `celery_app.app.tasks` da `app.tasks.furniture_styles.classify_furniture_styles_task` bor va `celery_app.app.amqp.router.route({}, that_name)['queue'].name == 'default'` (yoki routes lug'atidan aniqlangan navbat `default`).

  `test_seller.py` / `test_admin_catalog.py` da `enqueue_style_after_commit` mock qilinadi:
  - uslubsiz yuklash → bir marta chaqiriladi;
  - uslubli yuklash → chaqirilmaydi;
  - `enqueue_style` ichida `.delay` istisno bersa → istisno ko'tarmaydi.
- [ ] **Step 2:** Testlarni ishga tushirish. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.**
  - Celery vazifasi `asyncio.run(run_classification(id))` (yoki `media.py` dagi mavjud async-from-celery yordamchisi).
  - `_save` `update(Furniture).where(Furniture.id == id, Furniture.styles_source.is_(None)).values(styles=..., styles_source="ai")` bajaradi va `rowcount == 1` tekshiriladi.
  - Kesh `app.core.cache.cache_delete_prefix("furniture:")` bilan tozalanadi.
  - Queue fayli `model_optimize_queue.py` dan naqsh oladi.
- [ ] **Step 4:** To'liq suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "Unstyled furniture is sent to the AI in the background".

---

### Task 4: Admin endpoint `classify-styles`

**Files:** Modify: `backend/app/routers/admin_catalog.py`. Test: `backend/tests/test_admin_catalog.py`.

**Interfaces:** Consumes: Task 3 `enqueue_style`. Produces: `POST /api/v1/admin/furniture/classify-styles` → `{"queued": int}`.

- [ ] **Step 1: Failing testlar:**
  - DB 3 ta `NULL` id qaytarsa (query mock), `enqueue_style` 3 marta chaqiriladi, javob `{"queued": 3}`;
  - so'rov `styles_source IS NULL` ga filtrlanadi (compile qilingan statement'da shart borligini tekshirish yoki mavjud testlardagi usul);
  - `AI_FEATURES_ENABLED=False` → 503 va `"AI hozir o'chirilgan"`;
  - admin bo'lmagan foydalanuvchi → 403 (mavjud admin testlaridagi usul).
- [ ] **Step 2:** Testlarni ishga tushirish. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.** `select(Furniture.id).where(Furniture.styles_source.is_(None))`, har biri uchun `enqueue_style(str(id))`. Commit kerak emas: hech narsa yozilmaydi.
- [ ] **Step 4:** To'liq suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "Admins send every unstyled model to the AI at once".

---

### Task 5: Frontend: tugma va "AI qo'ygan" yozuvi

**Files:**
- Modify: `frontend/src/lib/api/admin.ts` (`classifyFurnitureStyles(): Promise<{ queued: number }>`, `AdminFurniture.styles_source?: string | null`), `frontend/src/lib/api/seller.ts` (`SellerModel.styles_source?: string | null`)
- Modify: `frontend/src/pages/dokon/admin/CatalogOverview.tsx` (modellar bo'limi sarlavhasi, "Model qo'shish" yonida)
- Modify: `frontend/src/pages/dokon/admin/ModelEditDialog.tsx` (chiplar ostida)
- Test: `frontend/src/pages/dokon/admin/CatalogOverview.test.tsx` (yangi bo'lsa yaratiladi), `frontend/src/pages/dokon/admin/ModelEditDialog.test.tsx`

**Interfaces:** Consumes: Task 4 endpoint, Task 1 `styles_source`.

- [ ] **Step 1: Failing testlar:**
  - tugma bosilsa `classifyFurnitureStyles` bir marta chaqiriladi va `{queued: 4}` → "4 ta model navbatga qo'yildi. Bir necha daqiqada uslublar paydo bo'ladi." ko'rinadi;
  - `{queued: 0}` → "Uslubi qo'yilmagan model yo'q.";
  - so'rov kutilayotganda tugma `disabled` va ikkinchi bosish yangi chaqiruv qilmaydi (Review Focus 5);
  - `ModelEditDialog`: `styles_source: 'ai'` bo'lsa "AI qo'ygan — tekshirib, kerak bo'lsa tuzating" bor, `'manual'` yoki `undefined` bo'lsa yo'q.
- [ ] **Step 2:** vitest. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.** `useMutation`, natija matni panelning mavjud xabar va toast usulida ko'rsatiladi (CatalogOverview'dagi `onError` va boshqa mutatsiyalar qanday qilsa). Muvaffaqiyatdan keyin `admin-furniture` query invalid qilinadi.
- [ ] **Step 4:** vitest to'liq va `npx tsc --noEmit -p .`. Kutilgan natija: PASS va 0.
- [ ] **Step 5:** Commit: "Admins start the AI style pass and see which styles the AI set". Push, PR ochish va bog'lash. Merge faqat foydalanuvchi aytganda.

---

## Yakuniy ko'rib chiqish
Barcha task'lardan keyin butun branch eng kuchli modeldagi bitta yangi reviewer bilan, Review Focus ro'yxati asosida ko'rib chiqiladi. Critical va Important topilmalar bitta fix pass'da tuzatiladi.
