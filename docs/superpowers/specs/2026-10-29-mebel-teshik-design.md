# Mebel: teshiklar xaritasi va yig'ish chizmasi

Sana: 2026-10-29. Holat: tasdiqlangan (chatda). Oldingi spec: `2026-10-29-mebel-fasad-design.md` (B3).

## Maqsad
Har detalning teshiklari (32 mm tizimi, qo'lda teshish uchun): "Teshiklar" tabida SVG xarita, PDF'da har teshikli detal uchun xarita va jadval, har shkafning yig'ish chizmasi (old va yon ko'rinish, detal ID'lari).

**Kirmaydi:** DXF/CNC; ruchka va devor ilgagi teshiklari; sozlanadigan polka uchun bir nechta qator.

## Detal koordinatalari
- Har `Part` ga `holes: Hole[]`; `Hole = { kind; face; u; v; diameter; depth }`, `depth: 0` — teshib o'tadi.
- `u` — detal uzunligi (`finished.length`) bo'ylab, `v` — eni bo'ylab, mm, yakuniy o'lchamda.
  - Yon panel: `u` pastki qirradan, `v` old qirradan; yuza `A` — shkaf ichiga qaragan, `B` — tashqi.
  - Gorizontal panel (taglik, tepa, planka, polka): `u` chap uchidan, `v` old qirradan; `A` — ustki yuza, `B` — ostki.
  - Eshik: `u` pastki qirradan, `v` chap qirradan; `A` — ichki (korpusga qaragan) yuza.
  - Qirra teshigi: `face` = `W1` (chap/past uch) yoki `W2` (o'ng/yuqori uch); `u` — qirra bo'ylab (old qirradan), `v` — qalinlik o'rtasi.

## Qoidalar (sozlanadigan sukutlar: `drill` sozlamasi)
- **Konfirmat:** yon panel bilan tutashgan har gorizontal panel (taglik, tepa panel, planka) uchun: yon panel `B` yuzasida Ø7 teshib o'tadigan, panel o'qida; gorizontal panel uchida (`W1`/`W2` qirra) Ø5 × 60. Chuqurlik bo'ylab joylar: panel chuqurligi `≤ 150` → `25%` va `75%`; aks holda old va orqadan 50 mm, `> 400` bo'lsa o'rtada ham bitta. `under_sides` taglik: yon panel taglik ustida turadi — Ø7 taglikning `B` yuzasida (uchlaridan `t/2`), Ø5 × 60 yon panelning pastki uchida (`W2` qirra).
- **Polkoderjatel:** har polka ostida ikkala yon panelning `A` yuzasida Ø5 × 10, polka ostidan 5 mm pastda, old va orqa qirradan 37 mm.
- **Petlya:** eshik `A` yuzasida kosa Ø35 × 12, petlya qirrasidan 22.5 mm; balandlik bo'yicha pastdan va yuqoridan 100 mm, qolganlari orasida teng. Bitta eshik — petlya chapda; ikkita eshik — chap eshik chapda, o'ng eshik o'ngda. Mos yon panelning `A` yuzasida planka uchun 2 × Ø5 × 12, old qirradan 37 mm, kosa balandligida ±16 mm.
- **Yo'naltiruvchi:** tortma qutisi yonining pastidan 8 mm yuqorida, yon panel `A` yuzasida Ø2.5 × 10, old qirradan `2 + 37`, `2 + Ls/2`, `2 + Ls − 37`.
- MDF fasadlar (detal emas) — teshik xaritasi yo'q; ro'yxatda "petlya kosasi fasad sexida" eslatmasi.

## UI
- "Teshiklar" tabi: teshikli detallar ro'yxati (ID, nomi, teshiklar soni); tanlangan detal SVG'da (kontur, teshiklar diametri bo'yicha doira, yuza bo'yicha rang: A to'q, B och, qirra — kontur ustida), o'lchov: har teshik `u`/`v` qiymati yorlig'i; jadval (tur, yuza, u, v, Ø, chuqurlik).
- Yig'ish chizmasi: shkaf bo'yicha old (x–y) va yon (z–y) proyeksiya SVG, detallar konturi va ID'lari (fasadlar old ko'rinishda alohida qatlam).
- PDF: har teshikli detal uchun xarita va jadval; har shkaf uchun yig'ish chizmasi.

## Testlar
- Namuna 600×720×560, 18 mm, HDF 4 mixlanadi, 1 polka, 1 LDSP eshik (`Dc = 556`):
  - chap yon `B`: konfirmat Ø7 taglik uchun `u 9`, `v 50, 278, 506`; old planka uchun `u 711`, `v 25, 75`; orqa planka `u 711`, `v 481, 531`;
  - chap yon `A`: polkoderjatel `u 346`, `v 37, 519`; petlya plankasi `v 37`, `u 85, 117, 603, 635`;
  - o'ng yonda petlya teshigi yo'q; taglikning `W1` va `W2` qirralarida Ø5×60 `u 50, 278, 506`;
  - eshik `A`: kosa Ø35 `u 100, 618`, `v 22.5`.
- Ikki eshik: o'ng eshik kosasi `v = eni − 22.5`, petlya plankasi o'ng yonda.
- Tortma: yo'naltiruvchi teshiklari `v 39, 252, 465` (Ls 500).
- Har teshik detal ichida (`0 ≤ u ≤ length`, `0 ≤ v ≤ width`), qirra teshiklari qirra uzunligida.
