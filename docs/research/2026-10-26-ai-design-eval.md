# AI dizayner va tayyor uslublar: baholash (2026-10-26)

Mahsulot kodi o'zgartirilmadi, hech narsa push qilinmadi, prod'ga tegilmadi. Hammasi lokal docker stack'da
(api/postgres/redis/worker) va lokal Vite dev server'da (5173) bajarildi.

## Qanday o'tkazildi

- **OpenAI kaliti**: lokal `api` konteynerida `OPENAI_API_KEY` bor, `OPENAI_BASE_URL` bo'sh (api.openai.com),
  `AI_MODEL_BUILDER=gpt-4.1-mini`.
- **Harness**: `backend/scripts/eval_ai_design.py` nusxasi scratch'da:
  `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/eval_run.py`
  (`seed` / `run` / `cleanup`). Asl skriptdan farqlari:
  - Router faqat `glb_key` bor mebelni oladi (`_run_design`). Asl harness katalogni `glb_key`siz qo'shadi, ya'ni hozir
    AI unga **bo'sh katalog** ko'radi. Nusxada har bir buyumga lokal GLB berildi.
  - 58 ta "ZZ ..." buyum, `styles` to'ldirilgan: har uslub uchun divan, kreslo, jurnal stoli, TV tumba, gilam,
    shkaf/javon, yotoqxona to'plami, ovqat stoli va stul.
  - Xonalar: (a) mehmonxona 4.5×3.2: eshik qisqa B devorda, deraza uzun A devorda; (b) yotoqxona 4×3.5;
    bolalar xonasi 3.5×3; kichik xona 3×2.6.
- **Joylashuv**: vaqtinchalik vitest fayl. U `applyDesignPlan(plan, ALL_PARTS, catalog, 'mehmonxona')` ni chaqirdi
  (studio ham shunday chaqiradi). Har reja uchun joylangan va tashlab ketilgan buyumlar, ustma-ust tushish, xonadan
  chiqish, eshik va derazani to'sish tekshirildi. Natija: `.../scratchpad/ai-eval/layout_out.json`. Test fayl o'chirildi.
- **Vizual tekshiruv**: lokal studio'da test foydalanuvchi bilan kirildi. Har reja shu `applyDesignPlan` orqali
  qo'llandi (sahifa ichidan import qilinib) va skrinshot olindi. Skrinshotlar:
  `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/shots/`.
  - **Muhim cheklov**: lokal DB'da katalog yo'q. Diskdagi 35 ta yetim GLB (`backend/media/models/`) vaqtinchalik
    o'rinbosar sifatida ishlatildi: bitta divan, bitta kreslo, bitta stul, bitta stol va gilam modellari.
  - Barcha past buyumlar (jurnal stoli, TV tumba, tumbochka) marmar ovqat stoli bo'lib ko'rinadi. Baland buyumlar
    (shkaf, javon) yozuv stoli bo'lib ko'rinadi, karavot modeli esa karavotga o'xshamaydi.
  - Shuning uchun mebelning **ko'rinishi va uslubi rasmdan baholanmadi**, faqat nomi va `styles` maydoni bo'yicha
    baholandi. Devor, pol, chiroq, ranglar va joylashuv rasmdan haqiqiy baholandi.
- **OpenAI chaqiruvlari**: jami **13 ta**, hammasi 200 qaytdi, har biri 3–5 soniya.
- **Tozalash**: test foydalanuvchi (kvartira va xonalari bilan kaskad), 58 ta ZZ mebel, konteynerdagi vaqtinchalik
  fayllar, `backend/media/zz_eval_plans.json` va vitest fayl o'chirildi. Tekshiruvda hamma joyda 0 qoldi.
  `git status` boshlang'ich holat bilan bir xil.

## Umumiy jadval

| Tur | Umumiy (1–10) |
|---|---|
| AI: Neoklassik, och ranglar | 6 |
| AI: Hi-tech, qora-oq, metall | 4 |
| AI: Milliy o'zbek uslubi | 5 |
| AI: Skandinav, och yog'och | 6 |
| AI: Loft, g'isht va qora metall | 6 |
| AI: Minimalist | 5 |
| AI: Klassik, oltin detallar | 6 |
| AI: Zamonaviy, iliq ranglar | 5 |
| AI: Qorong'i, dramatik | 5 |
| AI: Shinam yotoqxona (harness, `room_type=yotoqxona`) | 4 |
| AI: Shinam yotoqxona (**studio haqiqatda yuboradigan** `room_type=mehmonxona`) | 2 |
| AI: Bolalar xonasi | 6 |
| AI: Kichik xona, ko'p joy qolsin | 3 |
| Tayyor: Neoklassika | 7 |
| Tayyor: Zamonaviy | 4 |
| Tayyor: Hi-Tech | 6 |
| Tayyor: Milliy | 6 |
| Tayyor: Qorong'i (dark) | 4 |
| Tayyor: Skandinav | 7 |
| Tayyor: Klassik | 7 |
| Tayyor: Loft | 6 |
| Tayyor: Minimalist | 7 |

Ustunlar: U = uslubga moslik, R = rang uyg'unligi, M = mebel tanlovi, J = joylashuv qulayligi, I = izoh halolligi.

## Ko'ndalang kuzatuvlar (hamma rejalarda)

- **Izoh 13 tadan 12 tasida almashtirildi.** Modelning o'z matni faqat loft'da qoldi, qolganlarida deterministik
  matn chiqdi. U robotga o'xshaydi ("Devorlar ... bo'yaladi ... Mebel: ZZ Divan Verona, ZZ Kreslo ...") va ranglarni
  noto'g'ri ataydi:
  - `#C9A24B` "sariq", `#B8860B` "jigarrang" deb ataladi. Klassik rejada oltin aksent "B devor jigarrangda
    ajratiladi" bo'lib qoladi, ya'ni bajarilgan oltin talabi izohda yo'qoladi.
  - Qorong'i rejada asosiy devor qora va aksent qora bo'lsa ham, "C devor qora rangda ajratiladi" deyiladi.
  - API loglaridagi sabablar asosan yolg'on signal:
    - "'naqshli' aytilgan, lekin rejada yo'q": "naqshli" so'zi tanlanmagan "Gilam Buxoro naqshli" nomidan olingan.
    - "'yog'och' aytilgan": yog'och parket uchun ham ushlanadi.
    - "'kulrang' aytilgan" va "'stul' aytilgan": "Ish stuli" tanlangan, lekin alohida "Stul" nomi ham bor.
    - "'trek' aytilgan": `\bshina` regex'i "**shina**m" so'ziga ham mos keladi.
- **Oltin aksent ko'p ishlatiladi.** `#C9A24B` yoki `#B8860B` 13 tadan 6 ta rejada chiqdi (neoklassik "och ranglar",
  milliy, zamonaviy, ikkala yotoqxona, klassik), oltin esa faqat klassik'da so'ralgan edi. Sabab: tizim promptidagi
  misol ranglar.
- **Material bir xil.** 13 tadan 11 tasida parket, 9 tasida "yelkan" (herringbone) naqsh. Plitka yoki beton bir
  marta ham yo'q: loft betonsiz, hi-tech plitkasiz. Qandil 8 ta rejada, shu jumladan hi-tech'da.
- **AI rejada trim yo'q** (shift, plintus, karniz). Tayyor uslublarda bor va skrinshotlarda karniz neoklassikani
  ancha "klassik" qiladi. AI menyusida bu qism umuman yo'q.
- **Joylashuv**:
  - Hech qayerda buyumlar ustma-ust tushmadi, xonadan chiqmadi, eshik va deraza to'silmadi. Hisobda chiqqan bir
    nechta "overlap" buyurilgan kreslo AABB'si yoki stol ostidagi stul edi.
  - Lekin yotoqxonada kiyim shkafi, kichik xonada **karavot** tashlab ketildi.
  - Torsher mebelni hisobga olmaydi: tayyor skandinav uslubida torsher divan ichida turadi, dark uslubda TV tumba
    ichida, AI yotoqxonasida tuvalet stoli chetida.
  - TV tumba divan o'qidan 1.25 m siljigan holda eshikli devorga qo'yiladi (skandinav, minimalist, zamonaviy).
- **Uslub bo'yicha mebel tanlovi kuchli.** Har uslubga mos divan, kreslo va jurnal stoli deyarli doim to'g'ri
  olinadi. Xatolar asosan "eng yaqini" qoidasida:
  - milliy rejaga "Vitrina Neo";
  - hi-tech rejaga "Stellaj Loft" va "Kreslo Soft";
  - minimalist rejaga skandinav kreslo, tumba va javon;
  - zamonaviy rejaga milliy "Jurnal stoli o'ymakor".
- **Qorong'i va neoklassik rejalarda mebel to'plami aynan bir xil** (Verona to'plami): "dramatik" so'rovi o'z
  xarakterini olmadi.
- **Pol tusi**: och tus (`#F5F0E6`, `#EAEAEA`, `#E6D8B8`) skrinshotda o'rtacha eman bo'lib ko'rinadi, to'q tus esa
  aniq ko'rinadi. "Och yog'och" so'rovi vizual bajarilmaydi. Bu kuzatuv, sababi kodda tekshirilmadi.

## Har bir dizayn

### AI: Neoklassik, och ranglar — U7 R5 M8 J7 I4 → **6**
Skrinshot: `.../ai-eval/shots/ai_neoklassik.jpg`

- **Reja**:
  - devor: bo'yoq `#FDF6F0`, aksent C `#C9A24B`;
  - pol: parket, herringbone, tus `#E6D8B8`;
  - chiroqlar: qandil, 2 ta bra;
  - mebel: Divan Verona, Kreslo Verona, Jurnal stoli marmar, TV tumba Paris, Vitrina Neo (hammasi neoklassika).
- **Joylashuv**: 5/5 joylandi. Divan C devorda, TV A devorda (deraza ostida), vitrina A devor chetida.
- **Kamchiliklar**:
  - "Och ranglar" so'ralgan, lekin butun C devor to'q xantal-oltin, rasmda xonaning yarmi sariq.
  - Karniz va molding yo'q, tayyor neoklassikada esa bor.
  - Izoh almashtirilgan: oltin "sariq" deb ataladi va "ZZ ..." nomlar ro'yxati chiqadi.

### AI: Hi-tech, qora-oq, metall — U4 R4 M6 J7 I5 → **4**
Skrinshot: `.../ai-eval/shots/ai_hitech.jpg`

- **Reja**:
  - devor: `#1C1C1C`, oq aksent A devorda (A — deraza devori);
  - pol: to'q herringbone parket;
  - chiroqlar: qandil, 2 ta spot;
  - mebel: Divan Vektor, Jurnal stoli shisha-metall, TV tumba Glyanets (hi-tech), **Kreslo Soft (zamonaviy)**,
    **Stellaj Loft (loft)**, Pufik.
- **Kamchiliklar**:
  - Natija qora quti: "qora-oq" o'rniga deyarli faqat qora. Oq aksent studio kesimida ko'rinmaydigan deraza
    devorida qoldi.
  - Hi-tech uchun yelkan parket va oltin qo'lli qandil mos emas; plitka va LED kutiladi.
  - 6 buyum, ikkitasi boshqa uslubdan.

### AI: Milliy o'zbek uslubi — U4 R6 M7 J7 I4 → **5**
Skrinshot: `.../ai-eval/shots/ai_milliy.jpg`

- **Reja**:
  - devor: oddiy bo'yoq `#D9B382`, aksent C `#C9A24B`;
  - pol: herringbone `#7F5E26`;
  - chiroqlar: qandil, 2 ta bra;
  - mebel: Divan Samarqand, Kreslo Buxoro, Jurnal stoli o'ymakor, Gilam Buxoro naqshli (milliy), **Vitrina Neo**.
- **Kamchiliklar**:
  - Devorda naqsh yo'q, rasmda oddiy bej-xantal xona: milliylik faqat mebel nomlarida.
  - Tayyor milliy uslubdagi gulli oboy ancha yaxshiroq.
  - Izohda `#D9B382` "to'q sariq" (to'q sariq — apelsin rangi), oltin aksent esa "sariq" deb ataladi.

### AI: Skandinav, och yog'och — U7 R7 M8 J6 I5 → **6**
Skrinshot: `.../ai-eval/shots/ai_skandinav.jpg`

- **Reja**:
  - devor: `#EFEFEF`, aksent C `#D6E4E5`;
  - pol: herringbone, tus `#F5F0E6`;
  - chiroqlar: pendant, torsher;
  - mebel: hammasi skandinav — Divan Oslo, Kreslo Bergen, TV tumba Nord, Jurnal stoli eman, Gilam jun och, Javon Nord.
- **Kamchiliklar**:
  - Pol rasmda o'rtacha eman, "och yog'och" emas; skandinav uchun to'g'ri taxta tabiiyroq.
  - TV tumba eshikli B devorda, divan o'qidan 1.25 m siljigan.
  - Izoh almashtirilgan.

### AI: Loft, g'isht va qora metall — U5 R6 M8 J7 I8 → **6**
Skrinshot: `.../ai-eval/shots/ai_loft.jpg`

- **Reja**:
  - devor: `#5A3E36`, aksent B `#B33A3A`;
  - pol: qora parket;
  - chiroqlar: pendant, 2 ta bra;
  - mebel: hammasi loft — Stellaj Loft, Jurnal stoli metall-yog'och, TV tumba Indastrial, Kreslo Indastrial,
    Divan Bruklin.
- **Ijobiy**: modelning o'z izohi saqlangan yagona reja. Halol yozilgan: qizil devor "g'ishtni eslatadi".
- **Kamchiliklar**:
  - G'isht teksturasi ham, beton pol ham yo'q (menyuda beton bor).
  - Stellajga `wardrobe` vazifasi berilgan.
  - Izohda "parchet" xatosi.

### AI: Minimalist — U5 R7 M5 J6 I5 → **5**
Skrinshot: `.../ai-eval/shots/ai_minimalist.jpg`

- **Reja**:
  - devor: `#F5F5F5`, aksent B `#D9D9D9`;
  - pol: herringbone `#E0E0E0`;
  - chiroqlar: shift chirog'i, 2 ta spot;
  - mebel: 5 ta — Divan Line, Jurnal stoli Mono (minimalist), skandinav Kreslo Bergen, TV tumba Nord, Javon Nord.
- **Kamchiliklar**:
  - Minimalizm uchun ko'p buyum: byudjet qoidasi 14.4 m² uchun "4–5 ta, kamaytirmang" deydi.
  - Uslubi boshqa buyumlar va naqshli pol.

### AI: Klassik, oltin detallar — U8 R6 M8 J6 I4 → **6**
Skrinshot: `.../ai-eval/shots/ai_klassik.jpg`

- **Reja**:
  - devor: damask oboy (oltin naqsh), aksent B `#B8860B`;
  - pol: herringbone `#7B5E3C`;
  - chiroqlar: qandil, 2 ta bra;
  - mebel: hammasi klassik — Divan Chester, Kreslo Barokko, Jurnal stoli zarhal, Kitob shkafi Oxford, Gilam Fors.
- **Kamchiliklar**:
  - Oltin ikki marta takrorlangan (damask + to'q oltin devor), og'ir ko'rinadi.
  - Izohda oltin aksent "jigarrang" deb ataladi, ya'ni foydalanuvchi so'raganining bajarilgani izohdan yo'qoladi.

### AI: Zamonaviy, iliq ranglar — U5 R6 M5 J6 I4 → **5**
Skrinshot: `.../ai-eval/shots/ai_zamonaviy.jpg`

- **Reja**:
  - devor: `#D9B382`, aksent C `#B8860B`;
  - pol: herringbone;
  - chiroqlar: qandil, torsher, bra;
  - mebel: Divan Nova, TV tumba Grafit, Kreslo Soft (zamonaviy), **Jurnal stoli o'ymakor (milliy)**,
    **Javon Nord (skandinav)**, Gilam jun och va ovqat stolisiz **ZZ Stul** (`dining_chair`).
- **Kamchiliklar**:
  - Stul joylashuvda tashlab ketildi ("Joy yetmadi: Stul"), lekin izohda ro'yxatda turibdi.
  - "Iliq" so'rovi xantal-jigarrang devorlarga aylandi, zamonaviy emas, eskicha ko'rinadi.

### AI: Qorong'i, dramatik — U6 R5 M4 J7 I4 → **5**
Skrinshot: `.../ai-eval/shots/ai_qorongi.jpg`

- **Reja**:
  - devor: `#1E1E1E`, aksent C `#2C2C2C` (deyarli farqsiz);
  - pol: qora to'g'ri taxta;
  - chiroqlar: qandil, 2 ta bra;
  - mebel: neoklassik rejadagi aynan o'sha Verona to'plami va och gilam.
- **Kamchiliklar**:
  - Aksent ko'zga ko'rinmaydi, lekin izohda "ajratiladi" deyilgan.
  - Mebel to'plami boshqa so'rov bilan bir xil.
  - "Dramatik" uchun yorug'lik yoki kontrast fokusi yo'q.

### AI: Shinam yotoqxona (harness, yotoqxona) — U6 R6 M6 J3 I4 → **4**
Skrinshot: `.../ai-eval/shots/ai_yotoq.jpg`

- **Reja**:
  - devor: `#D9CFC3`, aksent C `#C9A24B`;
  - pol: herringbone;
  - chiroqlar: shift chirog'i, bra, torsher;
  - mebel: Karavot Verona 160, Kiyim shkafi Verona, bitta Tumbochka Verona, Tuvalet stoli Verona (`desk` vazifasi),
    Pufik, Ish stuli.
- **Joylashuv**: 6 tadan 4 tasi joylandi. **Kiyim shkafi va pufik tashlab ketildi.**
- **Kamchiliklar**:
  - 14 m² yotoqxonada shkaf sig'madi.
  - Torsher tuvalet stoli chetiga tegib turadi, tumbochka faqat bitta.
  - So'ralmagan neoklassika va yana oltin aksent tanlangan.
  - Izohda joylanmagan shkaf va pufik sanab o'tilgan.

### AI: Shinam yotoqxona (studio haqiqatda yuboradigan holat) — U2 R6 M1 J6 I4 → **2**
Skrinshot: `.../ai-eval/shots/ai_yotoq_studio.jpg`

- **Sabab**: studio har xona uchun `room_type: "mehmonxona"` yuboradi
  (`frontend/src/pages/studio/StudioPage.tsx`, localRoom). Shu sababli "Shinam yotoqxona" so'rovi
  "Yotoqxona 4×3.5" xonasida **divan, kreslo, jurnal stoli, TV tumba, vitrina va gilam** berdi, **karavot yo'q**.
- Bu foydalanuvchi birinchi ko'radigan eng katta xato.

### AI: Bolalar xonasi — U6 R7 M6 J6 I5 → **6**
Skrinshot: `.../ai-eval/shots/ai_bolalar.jpg`

- **Reja**:
  - devor: "gul" oboy (`#A3D2CA` / `#FFD3B6`), aksent C pastel;
  - pol: laminat `#FFE5B4`;
  - chiroqlar: shift chirog'i, downlight;
  - mebel: Bolalar karavoti, O'yin stoli, Ish stuli, Bolalar kitob javoni, Pufik.
- **Joylashuv**: 5/5 joylandi.
- **Kamchiliklar**:
  - "Bolalar" oboy naqshi bor, lekin ishlatilmadi: room_type "bolalar" mavjud emas, prompt esa uni faqat bolalar
    xonasiga ruxsat beradi.
  - Bolaga katta ofis stuli tanlangan, pufik deraza oldida.

### AI: Kichik xona, ko'p joy qolsin — U5 R7 M3 J2 I3 → **3**
Skrinshot: `.../ai-eval/shots/ai_kichik.jpg`

- **Reja**:
  - oq devor, laminat, shift chirog'i va 2 ta bra;
  - mebel: **Karavot Nord 160**, Tumbochka, Yozuv stoli, Ish stuli.
- **Joylashuv**: 4 tadan 2 tasi joylandi: **karavot va tumbochka tashlab ketildi**, xonada faqat stol va stul qoldi.
- **Kamchiliklar**:
  - 7.8 m² xonaga 160 sm karavot tanlangan, "Bir kishilik karavot 90" bor edi.
  - "Ko'p joy qolsin" so'rovi byudjet qoidasi ("3–4 ta, kamaytirmang") bilan to'qnashdi.
  - Izohda karavot va'da qilingan, lekin u xonada yo'q.

### Tayyor: Neoklassika — U8 R8 M7 J7 I7 → **7**
Skrinshot: `.../ai-eval/shots/preset_neoklassika.jpg`

- Och bej devorlar, karniz va ikki qavatli shift ko'rinadi, uslub aniq.
- To'plam neoklassik, gilam uslubsiz.
- Izoh statik va to'g'ri, lekin mebelni tilga olmaydi.

### Tayyor: Zamonaviy — U5 R7 M2 J5 I6 → **4**
Skrinshot: `.../ai-eval/shots/preset_zamonaviy.jpg`

- **Asosiy xato**: `stol` turiga **"Ovqat stoli Marmar"** (oshxona, uslubi zamonaviy) tanlandi va divan oldiga
  jurnal stoli o'rnida 75 sm baland ovqat stoli qo'yildi, stulsiz.
- Sabab: `pick` funksiyasida uslub xona turidan ustun, `KIND_MATCH.stol` esa har qanday "stol"ni oladi.
- Kreslo umuman yo'q.

### Tayyor: Hi-Tech — U7 R7 M6 J7 I6 → **6**
Skrinshot: `.../ai-eval/shots/preset_hitech.jpg`

- Oq devor, antratsit aksent, oq plitka, LED panel va trek: hi-tech AI rejasidan ancha to'g'ri.
- Faqat 3 buyum, xona bo'sh ko'rinadi.

### Tayyor: Milliy — U7 R7 M4 J7 I7 → **6**
Skrinshot: `.../ai-eval/shots/preset_milliy.jpg`

- Krem va qizil gulli oboy hamda to'q parket sharqona kayfiyat beradi.
- Lekin `shkaf` turiga **"Bolalar kitob javoni"** (yotoqxona, uslubsiz) tanlangan: uslubsiz buyum 1 ball oladi,
  boshqa uslub 0, xona mos kelmasligi esa hech narsani to'smaydi.

### Tayyor: Qorong'i (dark) — U6 R6 M2 J4 I6 → **4**
Skrinshot: `.../ai-eval/shots/preset_dark.jpg`

- Xuddi zamonaviydagidek ovqat stoli jurnal stoli o'rnida turibdi.
- Torsher TV tumba ichida (lightSpot mebelni bilmaydi).
- Devor va pol ma'qul.

### Tayyor: Skandinav — U8 R8 M8 J5 I7 → **7**
Skrinshot: `.../ai-eval/shots/preset_skandinav.jpg`

- To'plam va ranglar to'g'ri.
- **Torsher divanning chetiga kirib turadi** (corner_CD → divan ichida).

### Tayyor: Klassik — U8 R7 M8 J6 I7 → **7**
Skrinshot: `.../ai-eval/shots/preset_klassik.jpg`

- Damask, karniz, Chester to'plami. Kitob shkafi kreslo yonida, biroz tor.

### Tayyor: Loft — U6 R6 M8 J7 I4 → **6**
Skrinshot: `.../ai-eval/shots/preset_loft.jpg`

- Beton pol, trek va to'q devorlar to'g'ri.
- Lekin izoh "g'ishtsimon devor" deydi, aslida C devor oddiy `#A0522D` bo'yoq
  (`uz.json` → `studio.lib.preset.loft.summary`).

### Tayyor: Minimalist — U8 R7 M7 J7 I7 → **7**
Skrinshot: `.../ai-eval/shots/preset_minimalist.jpg`

- Oq devor, plitka va 2 buyum: toza va mantiqli.
- Mehmonxonada plitka biroz "kasalxona" taassurotini beradi.

## Takomillashtirishlar (ta'siri bo'yicha tartiblangan, amalga oshirilmagan)

1. **Studio har doim `room_type: "mehmonxona"` yuboradi.** Natijada yotoqxona va bolalar xonasiga mehmonxona
   beriladi, karavotsiz.
   - Kod: `frontend/src/pages/studio/StudioPage.tsx` (localRoom, `room_type: "mehmonxona"`, ~366-qator) →
     `ThreeDPage.tsx` (`roomType={room.room_type}`) → `components/studio/AiBuilderSheet.tsx` → `lib/api/ai.ts:aiDesign`.
   - Taklif: xona turini saqlash yoki tanlatish (hech bo'lmasa nomdan taxmin qilish), "bolalar" turini ham qo'shish.
2. **Izoh tekshiruvi juda qattiq.** 13 tadan 12 ta izoh almashtirildi, o'rniga robotga o'xshash matn noto'g'ri rang
   nomlari bilan chiqdi.
   - Kod: `backend/app/services/ai_design_text.py`:
     - `_catalog_problems`: tanlanmagan katalog nomlaridagi oddiy so'zlar ("naqshli", "yog'och", "kulrang", "stul",
       "karavoti") ham ushlanadi.
     - `_LIGHT_KINDS["trek"]`: `\bshina` regex'i "shinam"ga mos keladi.
     - `colour_name` va `describe_plan`: oltin rang "sariq" yoki "jigarrang" deb ataladi; aksent asosiy devor bilan
       bir xil bo'lsa ham "ajratiladi" yoziladi.
   - Taklif: faqat to'liq mebel nomlarini yoki ularning o'ziga xos qismlarini tekshirish, so'z chegaralarini tuzatish,
     oltin uchun alohida nom berish.
3. **Uslub va material bog'lanmagan, AI rejada trim yo'q.** Natijada 11/13 parket, 9/13 herringbone; hi-tech'da
   qandil, loft betonsiz, milliy oboysiz.
   - Kod: `backend/app/services/ai_designer.py` — `_SYSTEM`, `build_user_message`, `validate_plan`, `DesignPlan`
     (trim yo'q).
   - Taklif: promptga uslub bo'yicha qisqa yo'riqnoma qo'shish (yoki AI tegishli `DESIGN_PRESETS` dan boshlab, uni
     o'zgartirsin) va trimni menyuga kiritish.
4. **Oltin rang promptda misol sifatida turibdi.** Natijada 6/13 rejada so'ralmagan oltin aksent.
   - Kod: `ai_designer.py:_SYSTEM` ("Oltin/zarhal talab qilinsa ... #C9A24B yoki #B8860B").
   - Taklif: bu qatorni faqat so'rovda oltin aytilganda qo'shish; "och ranglar" so'ralsa aksent ham och va asosiy
     rangga yaqin bo'lsin degan qoida.
5. **Kichik xona va katta yotoqxonada asosiy mebel tashlab ketiladi.**
   - Kichik xonada karavot, yotoqxonada kiyim shkafi tushib qoldi.
   - Kod: `ai_designer.py:furniture_budget` va promptdagi "kamaytirmang" talabi; `furniture_menu` buyum o'lchamini
     xonaga solishtirmaydi; `frontend/src/lib/furnitureLayout.ts:layoutFurniture` va
     `furnitureGroups.ts:groupCandidates` (sleep guruhi va last resort).
   - Taklif: "joy qolsin" kabi so'rovda minimumni bekor qilish; xonaga sig'maydigan buyumni menyuga bermaslik;
     karavot yoki divan tushsa, uni boshqa guruhlardan oldin joylash.
6. **Tayyor uslublar noto'g'ri buyumni oladi**: ovqat stolini jurnal stoli o'rniga, bolalar javonini mehmonxonaga.
   - Kod: `frontend/src/lib/aiDesignPresets.ts:pick` — `KIND_MATCH.stol` juda keng, uslub balli xona mos kelmasligidan
     ustun.
   - Taklif: `inferRole(item)` qiymati `KIND_ROLE[kind]` ga mos kelishini talab qilish; boshqa xona turiga mo'ljallangan
     buyumni uslubdan qat'i nazar orqaga surish.
7. **Torsher va boshqa chiroqlar mebelga kirib qoladi.**
   - Kod: `frontend/src/lib/aiDesign.ts:applyDesignPlan` chiroqlarni mebeldan oldin qo'yadi;
     `aiDesignLayout.ts:lightSpot` mebel to'rtburchaklarini olmaydi.
   - Taklif: pol chiroqlarini mebeldan keyin, band joylarni chetlab qo'yish.
8. **Tanlangan mebel uslubi tekshirilmaydi.** Misollar: milliy rejada Vitrina Neo, hi-tech rejada Stellaj Loft,
   minimalist rejada skandinav buyumlar.
   - Kod: `ai_designer.py:validate_plan` (uslub tekshiruvi yo'q); `furniture_menu` mos uslubni faqat oldinga qo'yadi.
   - Taklif: so'rovda uslub aniq bo'lsa, boshqa uslubdagi buyumlarni ro'yxatdan chiqarish (o'sha turda mos yoki
     uslubsiz buyum bo'lsa) yoki ogohlantirish berish.
9. **TV va divan bir o'qda emas, TV eshikli devorga qo'yiladi.**
   - Kod: `frontend/src/lib/furnitureGroups.ts` (lounge nomzodlari).
   - Taklif: TV markazini divan markaziga tekislash uchun ball berish.
10. **Statik izohlar va natija mos emas.** Tayyor loft izohi g'isht va'da qiladi; AI izohi joylanmagan buyumlarni
    sanaydi.
    - Kod: `uz.json` → `studio.lib.preset.loft.summary`; AI izohi `applyDesignPlan`/`droppedNotice` natijasidan keyin
      qayta yozilmaydi.
    - Taklif: izohni qo'llashdan keyin "joylangan"lar bo'yicha qayta qurish.

Qo'shimcha (tasdiqlanmagan): och pol tusi vizual ko'rinmaydi, chunki tus teksturaga ko'paytiriladi. Buni
`floorGeometry` / `FLOOR_PATTERN_DEFS` dagi `baseColor` ishlatilishida tekshirish kerak.

Shuningdek: `backend/scripts/eval_ai_design.py` katalogni `glb_key`siz qo'shadi, router esa `glb_key IS NOT NULL`
filtrini qo'llaydi (`app/routers/ai.py:_run_design`). Shu sababli asl harness hozir AI'ga **bo'sh katalog** beradi va
mebel natijalarini o'lchamaydi.
