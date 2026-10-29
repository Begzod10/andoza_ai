# Mebel: tortmalar (sharikli yo'naltiruvchi)

Sana: 2026-10-29. Holat: tasdiqlangan (chatda). Oldingi spec: `2026-10-29-mebel-fasad-design.md` (B2 qismi).

## Maqsad
Pastki shkafda 0–4 tortma: fasadlari (loyiha fasad turi bo'yicha LDSP detal yoki MDF buyurtma), tortma qutilari (LDSP 16 mm yon/old/orqa, HDF tag) cut list va raskroyda, yo'naltiruvchi juftliklari BOM'da. Eski loyiha (`drawers` yo'q) o'zgarmaydi.

## Doira
**Kiradi:** `CabinetSpec.drawers?: 0..4` (faqat `base`); tortma fasadlari; quti detallari; yo'naltiruvchi tanlash (standart uzunlik); BOM (yo'naltiruvchi juftligi uzunligi bilan, ruchka); validatsiya; UI maydoni; 3D (yopiq holat); backend chegarasi.
**Kirmaydi:** rolikli va metaboks/tandembox; teng bo'lmagan tortma balandliklari; ochiq holatdagi 3D; teshik koordinatalari (B3).

## Qoidalar
- Tortma bo'lsa (`drawers > 0`): o'sha shkafda eshik yo'q (`doors` e'tiborsiz), polka yo'q (`shelves` e'tiborsiz). Korpus (yonlar, taglik, plankalar, HDF) o'zgarmaydi.
- Fasad tirqishi `g = facade.gap`. Tortma fasadi `n` ta, eni `W − 2g`, balandligi `hf = floor((H − (n+1)·g) / n)`, oxirgisi `H − (n+1)·g − (n−1)·hf` (yuqoridan pastga, eng pastki fasad qoldiqni oladi). Rol `drawer_front`. LDSP — detal: material `facade`, 4 tomon ko'rinadigan kromka, `length` = eni (`W − 2g`), `width` = balandlik, tekstura `length` (gorizontal). MDF — `facadeOrder` qatori (`id: <label>-T<i>`), har tortma alohida qator emas: bir xil o'lchamlilar bitta qator, `qty` bilan.
- Fasad turi `none` bo'lsa ham quti va yo'naltiruvchi hisoblanadi, fasadsiz.
- Ichki eni `Wi = W − 2t`. Ichki chuqurlik `Dᵢ` (oldingi spec). Yo'naltiruvchi `Ls` = `{250, 300, 350, 400, 450, 500, 550}` dan `≤ Dᵢ − 10` eng kattasi.
- Quti (har tortma, LDSP qalinligi `tq = 16`, korpus materiali `board.materialId`, lekin qalinlik 16 — alohida guruh): balandligi `hq = fasad balandligi − 40`;
  - yonlar ×2 `Ls × hq` (rol `drawer_side`), L1 (tepa) ko'rinmas kromka;
  - old va orqa ×2 `(Wi − 25 − 2·tq) × hq` (rol `drawer_end`), kromkasiz;
  - tag ×1 HDF `(Wi − 25) × Ls` (rol `drawer_bottom`, material `back`, ostiga mixlanadi).
- BOM: `slide` qatori har uzunlik bo'yicha (`label: slide_<Ls>`, unit `dona` juftlik), narx narx daftaridagi `hardware.slide` (juftlik narxi); ruchka har tortmaga 1; quti uchun konfirmat `4 × n` (old va orqa har biri 2 ta, ikkala tomonda).
- Validatsiya: `drawers` 0–4 butun (`drawers_range`); `wall`/`tall` da `drawers > 0` — `drawers_type`; `hq < 80` — `drawer_low`; `Dᵢ − 10 < 250` — `drawer_shallow`.
- 3D: fasadlar korpus oldida (eshik kabi), qutilar ichkarida yo'naltiruvchi tirqishi bilan, pastdan `t + 10` dan boshlab har tortma fasadi qarshisida.
- Backend: `drawers` 0–4 butun yoki yo'q; `None` saqlanmaydi (eshiklar kabi).

## Testlar
- 600×720×560, 3 tortma, LDSP fasad, tirqish 2, HDF 4 mixlanadi: `H − 4g = 712`, `hf = floor(712/3) = 237`; fasadlar (`length × width`) 596×237, 596×237, 596×238 (eng pastkisi); `Ls = 500` (`Dᵢ = 556`, `556 − 10 = 546`); yuqori ikki tortma qutisi `hq = 197`, eng pastkisi `198`; yonlar `500 × 197`, old/orqa `507 × 197` (`564 − 25 − 32`), tag `539 × 500`.
- Eski loyiha (drawers yo'q) natijasi o'zgarmaydi; `drawers 0` = yo'q.
- MDF: tortma fasadlari `facadeOrder` da, qutilar baribir cut list'da.
- Validatsiya kodlari; 3D kesishmaslik (korpus, quti, fasad).
- BOM: `slide_500` × 3, ruchka 3, eshik petlyasi 0.
