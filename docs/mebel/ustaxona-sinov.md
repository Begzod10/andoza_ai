# /mebel — ustaxonada sinov rejasi

Maqsad: `andozaai.uz/mebel` hisoblagan o'lchamlar, kromka, raskroy, teshiklar va narx haqiqiy ishlab chiqarishga mos kelishini bitta kichik buyurtmada tekshirish va sukut qiymatlarni ustaxona standartiga moslash.

## 1. Sinov buyurtmasi (bitta oshxona qatori)
| Shkaf | Turi | O'lcham (E×B×Ch), mm | Ichi |
|---|---|---|---|
| M1 | Pastki | 600 × 720 × 560 | 1 polka, 1 eshik |
| M2 | Pastki | 800 × 720 × 560 | 3 tortma |
| M3 | Pastki | 400 × 720 × 560 | 1 polka, 1 eshik |
| M4 | Devor | 600 × 720 × 300 | 1 polka, 1 eshik |
| M5 | Devor | 800 × 720 × 300 | 1 polka, 2 eshik |
| M6 | Baland | 600 × 2100 × 560 | 4 polka, 1 eshik |

## 2. Kiritishdan oldin — ustaxona standartini sozlash
Kompyuterda chap paneldagi chizg'ich belgisi (telefonda Profil → "Mebel ishlab chiqarish") → "Yangi loyiha". Yig'ilgan "Konstruksiya" va "Fasad" bo'limlarini ochib, ustaxonaning odatiy qiymatlarini qo'ying va **yozib oling**:

| Sozlama | Sukut | Ustaxonada |
|---|---|---|
| LDSP qalinligi | 18 mm | |
| Orqa devor | HDF 4 mm, mixlanadi | |
| Taglik | yonlar orasida | |
| Ko'rinadigan / ko'rinmas kromka | 2 mm / 0.4 mm | |
| Kromkadan oldin frezalanadimi | yo'q | |
| List o'lchami | 2800 × 2070 | |
| Arra kesimi (kerf) | 4 mm | |
| Chekka qoldiq (trim) | 10 mm | |
| Fasad turi / qalinligi / tirqish | LDSP / 18 / 2 mm | |

"Narx daftari"ga kiriting: "Listlar" bo'limida LDSP 16 / 18 mm va HDF listi, MDF fasad 1 m²; keyin kesish (1 list), kromkalash (1 m), petlya, ruchka, yo'naltiruvchi (juft), oyoqcha, konfirmat. Katalogdan material tanlansa, uning qalinligi sozlamaga mos kelmasa "Ogohlantirishlar"da aytiladi.

Shkaflarni "+ Pastki / Devor / Baland" tugmalari yoki "AI bilan qo'shish" orqali kiriting. Har shkaf bitta qator: bosilsa formasi ochiladi.

## 3. Ishlab chiqarish
1. "Detallar" → **Cut list (CSV)** — raskroy xizmatiga yuboriladi YOKI "Raskroy" → **PDF** — o'z arrangizda list chizmasi va kesish tartibi bo'yicha.
2. "Teshiklar" → **PDF** — har detal xaritasi bo'yicha teshish. O'lchovlar: pastda chap qirradan, chapda old (pastki) qirradan, mm. Chap yon panel ichki tomondan chizilgan, pastki uchi o'ngda.
3. Yig'ish chizmasi bo'yicha korpuslarni yig'ish.

## 4. Natijalar varaqasi (har band uchun ✅ / ❌ va izoh)
| # | Tekshiruv | Mezon | Natija |
|---|---|---|---|
| 1 | Detal o'lchamlari (kromka bilan) | ±0.5 mm | |
| 2 | Kromka qaysi qirrada | chizmadagidek | |
| 3 | Kerak bo'lgan list soni | dasturdagi bilan teng | |
| 4 | Chiqindi va qoldiqlar | dasturdagiga yaqin | |
| 5 | CSV raskroy xizmati dasturiga to'g'ri o'qildimi | ha | |
| 6 | Konfirmat teshiklari mos tushdimi | ±0.5 mm | |
| 7 | Polka tekis turadimi (polkoderjatel) | ha | |
| 8 | Petlya kosasi va plankasi, eshik to'g'ri yopiladimi | ha | |
| 9 | Eshik/fasad tirqishlari | 2 mm | |
| 10 | Tortma yurishi, quti yo'naltiruvchiga mos | ha | |
| 11 | Yig'ilgan korpus E×B×Ch | ±1 mm | |
| 12 | Hisoblangan narx vs haqiqiy xarajat | farqi, % | |
| 13 | Ish vaqti (kiritishdan cut list'gacha) | daqiqa | |

## 5. Bizga qaytariladigan ma'lumot
- O'zgartirish kerak bo'lgan sukut qiymatlar: tepa planka eni (100), polka chekinishi (20), polka/orqa tirqishi (1), petlya kosasi qirradan (22.5) va uchlardan (100), polkoderjatel va planka (37 mm), yo'naltiruvchi tirqishi (12.5), tortma quti balandligi (fasad − 40, ko'pi bilan 250), polka egilish chegarasi (16 mm: 800, 18 mm: 900).
- Natijasi ❌ bo'lgan har band: qaysi detal (ID, masalan `M2-05`), kutilgan va haqiqiy o'lcham, rasm.
- CSV ustunlari raskroy xizmati talabiga mos kelmasa — ular so'ragan format namunasi.
