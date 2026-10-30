# Mebel: AI yordamchi (matndan shkaflar, taklif + tasdiq)

Sana: 2026-10-29. Holat: tasdiqlangan (chatda). Bosqich 5.

## Maqsad
Loyiha sahifasida matndan (uz/ru) shkaflar ro'yxati taklif qilinadi; foydalanuvchi ko'rib "Qo'shish" yoki "Almashtirish"ni bosadi. AI faqat parametrlar beradi; detal o'lchamlari, raskroy va teshiklarni engine hisoblaydi.

## Backend
- `POST /mebel/ai/suggest` `{ text: 1..1000 }` → `{ cabinets: Suggested[], facade: 'ldsp'|'mdf'|'none'|null, questions: string[], dropped: string[] }`.
- `Suggested = { type: 'base'|'wall'|'tall'; width; height; depth; shelves; doors: 0|1|2|null; drawers: 0..4 }` — berilmagan o'lcham/polka turning sukuti (base 600×720×560/1, wall 600×720×300/1, tall 600×2100×560/4); `doors` berilmasa `null` (avto).
- `app/services/mebel_ai.py` `suggest_cabinets(text, user_id) -> dict`: `call_llm(model=settings.AI_MODEL_BUILDER, system=…, messages=[user text], tools=[propose_cabinets], user_id, model_type='builder')`. Tool sxemasi: `cabinets[]` (`type`, `width`, `height?`, `depth?`, `shelves?`, `doors?`, `drawers?`, `count?` 1–10), `facade?`, `questions[]`. Javobdagi birinchi `ToolUseBlock` olinadi; yo'q bo'lsa — `questions` ga AI matni (bitta qator) qo'yiladi, `cabinets: []`.
- Tekshirish: har shkaf turga mos chegaralar (`LIMITS_BY_TYPE` backend'da), `drawers` faqat base, `count` bo'yicha takrorlanadi (jami ≤ 30); chegaradan tashqari yoki noto'g'ri — tashlanadi va `dropped` ga sababi ("wall depth 450: 200–400").
- `AI_FEATURES_ENABLED` o'chiq → 503; kunlik limit: `check_and_increment_budget_for(user, 'mebel_ai', 30)` → 429; `BudgetExceededError` → 429; LLM xatosi → 502 ("AI javob bermadi").
- Matn system prompt'da: siz mebel ustaxonasi uchun parametr yig'uvchisiz; faqat `propose_cabinets` ni chaqiring; o'lchamlarni mm da; "pastki/нижний" = base, "devor/навесной/верхний" = wall, "penal/baland/пенал" = tall; "tortmali/ящики" → drawers; noaniq narsa uchun `questions`.

## Frontend
- `suggestMebelCabinets(text)` (`lib/api/mebel.ts`).
- `ui/AiSuggest.tsx` loyiha sahifasi parametrlar panelining tepasida: matn maydoni, "Taklif olish", yuklanish, xato; taklif: shkaflar ro'yxati (tur, o'lcham, ichi), `questions`, `dropped`; tugmalar "Qo'shish" (mavjudlarga qo'shadi) va "Almashtirish" (shkaflarni almashtiradi); `facade` bo'lsa loyiha fasad turini ham o'rnatadi.
- Qo'llash: har shkaf `newCabinet(nextLabel, nextX(cabinets, type), type)` + taklif qiymatlari; label `M<n>` davomi.

## Testlar
- Backend (call_llm mock): to'g'ri tool javobi → shkaflar, sukutlar, `count` kengaytirish; chegaradan tashqari → `dropped`; tool yo'q → `questions`; o'chiq → 503; limit → 429; LLM exception → 502; begona `type` → tashlanadi; jami 30 dan oshsa kesiladi.
- Frontend: taklif ko'rsatiladi; "Qo'shish" shkaflarni qo'shadi (devor qatori, label); "Almashtirish"; savollar ko'rinadi; xato xabari.
