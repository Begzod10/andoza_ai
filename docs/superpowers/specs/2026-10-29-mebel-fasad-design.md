# Mebel: fasad (eshik), devor va baland shkaflar

Sana: 2026-10-29. Holat: tasdiqlash uchun. Oldingi spec'lar: `2026-10-29-mebel-ishlab-chiqarish-design.md` (3-bosqich, B1 qismi), `2026-10-29-mebel-raskroy-design.md`.

## Muammo
`/mebel` faqat ochiq pastki shkafni (eshiksiz) hisoblaydi. Oshxona buyurtmasida devor shkaflari, baland shkaf (penal) va har shkafning eshigi bor; ularsiz cut list, raskroy va narx to'liq emas.

## Maqsad va muvaffaqiyat mezoni
- Shkaf turi: pastki, devor, baland — har biri o'z korpus qoidalari va sukut o'lchami bilan.
- Fasad: loyiha sozlamasida LDSP (ustaxona o'zi kesadi: cut list va raskroyga tushadi) yoki MDF (fasad sexiga buyurtma ro'yxati, m² bo'yicha narx) yoki yo'q.
- Eshiklar soni avtomatik (eni > 600 → 2) yoki shkafda tanlanadi (0/1/2); fasad o'lchami tirqish bilan hisoblanadi.
- BOM petlya, ruchka va osish ilgagini sanaydi.
- Eski saqlangan loyihalar o'zgarmaydi: pastki shkaf, fasadsiz.

## Doira
**Kiradi:** `wall` va `tall` turlari; fasad (LDSP/MDF/yo'q), eshiklar soni, tirqish; LDSP fasad cut list va raskroyda (o'z materiali); MDF fasad buyurtmasi (jadval, CSV, PDF bo'limi); furnitura sanog'i; 3D (devor shkafi osilgan, fasad oldida); backend validatsiyasi.

**Kirmaydi:** tortmalar (B2); teshik koordinatalari va yig'ish chizmasi (B3); burchak shkaflari; shisha va podyomnik fasadlar.

## Dizayn

### 1. Model
```ts
CabinetSpec.type: 'base' | 'wall' | 'tall'
CabinetSpec.doors?: 0 | 1 | 2             // yo'q → eni > 600 ? 2 : 1
ConstructionDefaults.facade: { kind: 'ldsp' | 'mdf' | 'none'; materialId: string | null; thickness: 16 | 18 | 19; gap: number }
Part.role += 'top' | 'door'
Part.material += 'facade'                 // LDSP fasad: o'z materiali, o'z raskroy guruhi
Result.facadeOrder: { id: string; cabinetId: string; length: number; width: number; qty: number; materialId: string | null }[]
```
Sukut: yangi loyiha `facade = { kind: 'ldsp', materialId: null, thickness: 18, gap: 2 }`. Saqlangan loyihada `facade` bo'lmasa — `{ kind: 'none', … }` (eski loyiha o'zgarmaydi). `type` bo'lmasa — `'base'`.

### 2. Korpus formulalari
`t` LDSP; `Dc = D − tb` (HDF mixlanadi) yoki `D`; `Dᵢ` avvalgidek; `g` HDF tirqishi; `gd` paz chuqurligi.

| Detal | Pastki (bor) | Devor | Baland |
|---|---|---|---|
| Yonlar ×2 | `H × Dc` (under_sides: `H − t`) | `H × Dc` | pastki bilan bir xil qoida |
| Taglik | `(W − 2t) × Dc` (under: `W × Dc`) | `(W − 2t) × Dc` | pastki bilan bir xil qoida |
| Tepa | planka ×2 `(W − 2t) × railDepth` | panel `(W − 2t) × Dc` (rol `top`) | panel `(W − 2t) × Dc` |
| Polkalar | `(W − 2t − 2·shelfGap) × (Dᵢ − shelfSetback)` | xuddi shunday | xuddi shunday |
| HDF mixlanadi | `(W − 2g) × (H − 2g)` | xuddi shunday | xuddi shunday |
| HDF pazda | `(W − 2t + 2gd − 2g) × (H − t + gd − 2g)` | `(W − 2t + 2gd − 2g) × (H − 2t + 2gd − 2g)` | devor bilan bir xil |

Kromka: tepa panelning L1 (old) ko'rinadigan; boshqalar avvalgidek. Devor shkafida taglik ham panel (kromka L1 ko'rinadigan). Polkalar balandlik bo'ylab teng taqsimlanadi (taglik ustidan tepa ostigacha).

### 3. Fasad
- Eshiklar soni `n` (0 → fasad yo'q). Har eshik: `length = H − gap` (balandlik bo'ylab), `width = floor(W / n − gap)`.
  - 600 × 720, n 1 → 718 × 598; 800, n 2 → 718 × 398.
- LDSP: detal (`role: 'door'`, `material: 'facade'`, `materialId: facade.materialId`, `thickness: facade.thickness`, `grain: 'length'`), 4 tomon ko'rinadigan kromka → kesish `714 × 594`. Cut list va raskroyda o'z guruhi.
- MDF: `facadeOrder` qatori (detal emas); BOM `kind: 'facade'`, `unit: 'm2'`, `qty = Σ length × width / 1e6` (3 xonagacha), narx materiali bo'yicha.
- 3D: fasad korpus old tekisligidan oldinda, qalinligi bilan (`z` = old + 0..thickness); ikkita eshik orasida tirqish.

### 4. Furnitura (BOM, faqat soni)
- Petlya: har eshikka `H ≤ 900 → 2`, `≤ 1600 → 3`, aks holda 4.
- Ruchka: har eshikka 1.
- Oyoqcha: pastki va baland (eni > 800 → 6, aks holda 4); devor — 0.
- Osish ilgagi: devor shkafiga 2.
- Konfirmat: pastki 14 (avvalgidek); devor va baland 12 (tepa va past panel, har biri 2 birikma × 3).
- HDF mixi avvalgidek (faqat mixlangan orqa).
- Narx daftari `hardware` ga `hinge`, `handle`, `hanger` qo'shiladi.

### 5. Chegaralar va validatsiya
| Tur | Sukut | W | H | D | Polka |
|---|---|---|---|---|---|
| base | 600×720×560, 1 polka | 150–1200 | 300–1000 | 250–700 | 0–4 |
| wall | 600×720×300, 1 polka | 150–1200 | 300–1000 | 200–400 | 0–4 |
| tall | 600×2100×560, 4 polka | 150–1200 | 1200–2400 | 300–650 | 0–8 |

`doors` 0/1/2 dan boshqa — `doors_range`. Fasad tirqishi 0–5, qalinligi 16/18/19 — aks holda `settings_invalid`. Backend Pydantic `type` (base/wall/tall) va turga mos chegaralarni tekshiradi.

### 6. UI va eksport
- "Shkaf qo'shish" menyusi: Pastki / Devor / Baland. Karta: tur belgisi, "Eshiklar" (Avto/0/1/2), turga mos xato matni.
- "Konstruksiya" → "Fasad": turi, material (`ldsp` yoki `mdf` katalogi), qalinlik, tirqish.
- BOM tabi: MDF bo'lsa "Fasad buyurtmasi" jadvali (shkaf, o'lcham, soni, m²), jami m² va narx, "Fasad buyurtmasi (CSV)" tugmasi: `Shkaf;Uzunlik;Eni;Soni;Material;m²` (UTF-8 BOM, `;`, o'nlik vergul, formula himoyasi).
- PDF: MDF bo'lsa fasad buyurtmasi bo'limi.
- 3D: devor shkafi `y = 1400` (pastki qirrasi), o'z qatorida (`position.x` alohida); yangi devor shkafi oldingi devor shkaflari yonidan qo'yiladi.
- i18n uz/ru/en.

### 7. Testlar
- Golden: devor 600×720×300, HDF 4 mixlanadi (yonlar 720×296, tepa va past 564×296, HDF 598×718, fasad 718×598); baland 600×2100×560 (4 polka, har eshikka 4 petlya, chunki `H 2100 > 1600`); pastki 800 (2 eshik 718×398).
- Variantlar: wall/tall × nailed/groove/none × 16/18.
- Invariantlar: korpus `W × H × D`; fasadsiz detallar kesishmaydi; fasad korpus oldida va eshiklar bir-biriga kirmaydi.
- LDSP fasad: kesish 714×594, alohida raskroy guruhi, kromka metri ichida. MDF: cut list'da yo'q, `facadeOrder` va BOM m², CSV.
- Eski loyiha: `type` va `facade` yo'q → natija avvalgi bilan bir xil.
- Backend: `type` va turga mos chegaralar 422.
- UI: tur tanlab qo'shish; eshiklar soni; fasad turi almashadi; MDF CSV.
