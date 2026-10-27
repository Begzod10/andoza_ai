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

## Qayta baholash (2026-10-26, tuzatishlardan keyin)

1–5-vazifalardagi tuzatishlardan keyin (xona turi saqlanadi va AI'ga yuboriladi; tayyor uslublar bitta JSON'da;
AI uslubning tayyor rejasidan boshlaydi va trim qaytaradi; oltin faqat so'ralganda; izoh tekshiruvi yumshatildi)
xuddi shu 13 ta so'rov va 9 ta tayyor uslub qayta o'tkazildi. Mahsulot kodi o'zgartirilmadi.

### Usul

- **Harness**: endi commit qilingan `backend/scripts/eval_ai_design.py` (`--set style --repeats 1`). Birinchi
  baholashdagi scratch nusxadan farqlari:
  - 58 ta "ZZ ..." buyum (uslublari bilan) va bir nechta oshxona/hammom buyumi. Har biriga `glb_key` (o'rinbosar
    `models/zz-eval/stand-in.glb`) beriladi, shuning uchun AI routeri ham, `has_model=true` katalog ham ularni ko'radi
    (ikkalasi ham `glb_key IS NOT NULL` filtri).
  - To'rtta xona saqlangan `room_type` bilan yaratiladi: mehmonxona 4.5×3.2 (`mehmonxona`), yotoqxona 4×3.5
    (`yotoqxona`), bolalar 3.5×3 (`bolalar`), kichik xona 3×2.6 (`yotoqxona`). So'rov xonaning o'z turini yuboradi,
    studio ham endi shunday qiladi.
  - Ilova shu jarayonning ichida ishga tushiriladi (`httpx.ASGITransport`). `ai_designer.reconcile_summary`
    o'rab olinadi va har bir so'rov uchun modelning **xom izohi** (`raw_summary`), u saqlanganmi (`summary_kept`)
    va almashtirish sabablari (`summary_problems`) yoziladi. Ilova kodi o'zgartirilmadi.
  - Birinchi baholashdagi "studio haqiqatda yuboradigan" yotoqxona holati (`room_type=mehmonxona`) endi yo'q:
    studio xonaning saqlangan turini yuboradi. Shu so'rov `yotoq_2` nomi bilan ikkinchi namuna sifatida qoldi.
- **Joylashuv**: vaqtinchalik vitest fayl `applyDesignPlan(plan, ALL_PARTS, catalog, roomType)` ni har bir AI rejasi
  uchun o'z xona turi bilan, 9 ta tayyor uslub uchun esa `presetPlan(id, catalog, 'mehmonxona')` bilan
  mehmonxonada chaqirdi. Natija: `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/rerun/layout_out.json`,
  rejalar: `.../ai-eval/rerun/eval.json`. Test fayl o'chirildi.
- **Skrinshotlar olinmadi**: lokal katalogda haqiqiy GLB yo'q (birinchi baholashdagi cheklov o'zgarmagan).
  Mebel nomi va `styles` bo'yicha, devor, pol, chiroq va joylashuv esa reja va joylashuv natijasi bo'yicha baholandi.
- **OpenAI chaqiruvlari**: **13 ta**, hammasi 200, 2.4–4.6 soniya (median 3.3). Tayyor uslublar chaqiruvsiz.

### Oldin va keyin

| Tur | Oldin | Keyin | Keyingi baho (U R M J I) |
|---|---|---|---|
| AI: Neoklassik, och ranglar | 6 | **7** | U8 R8 M9 J7 I5 |
| AI: Hi-tech, qora-oq, metall | 4 | **7** | U8 R8 M6 J7 I8 |
| AI: Milliy o'zbek uslubi | 5 | **7** | U8 R7 M7 J7 I5 |
| AI: Skandinav, och yog'och | 6 | **8** | U9 R8 M9 J6 I8 |
| AI: Loft, g'isht va qora metall | 6 | **7** | U7 R7 M9 J6 I8 |
| AI: Minimalist | 5 | **7** | U7 R8 M6 J7 I6 |
| AI: Klassik, oltin detallar | 6 | **8** | U9 R8 M9 J7 I5 |
| AI: Zamonaviy, iliq ranglar | 5 | **6** | U6 R6 M7 J6 I5 |
| AI: Qorong'i, dramatik | 5 | **6** | U6 R6 M7 J7 I6 |
| AI: Shinam yotoqxona (`yotoqxona`) | 4 | **7** | U7 R7 M8 J5 I7 |
| AI: Shinam yotoqxona (studio holati; oldin `mehmonxona`, endi saqlangan tur) | 2 | **6** | U6 R7 M7 J5 I7 |
| AI: Bolalar xonasi (oldin `yotoqxona`, endi `bolalar`) | 6 | **7** | U7 R7 M8 J7 I6 |
| AI: Kichik xona, ko'p joy qolsin | 3 | **5** | U5 R7 M5 J2 I4 |
| **AI o'rtacha** | **4.8** | **6.8** | |
| Tayyor: Neoklassika | 7 | 7 | U8 R8 M7 J7 I7 |
| Tayyor: Zamonaviy | 4 | **6** | U5 R7 M6 J5 I6 |
| Tayyor: Hi-Tech | 6 | 6 | U7 R7 M6 J7 I6 |
| Tayyor: Milliy | 6 | 6 | U7 R7 M4 J7 I7 |
| Tayyor: Qorong'i (dark) | 4 | **5** | U6 R6 M5 J4 I6 |
| Tayyor: Skandinav | 7 | 7 | U8 R8 M8 J5 I7 |
| Tayyor: Klassik | 7 | 7 | U8 R7 M8 J6 I7 |
| Tayyor: Loft | 6 | 6 | U6 R6 M8 J7 I4 |
| Tayyor: Minimalist | 7 | 7 | U8 R7 M7 J7 I7 |
| **Tayyor o'rtacha** | **6.0** | **6.3** | |

Ko'ndalang raqamlar (13 ta AI rejasi):

| Ko'rsatkich | Oldin | Keyin |
|---|---|---|
| Model izohi saqlandi | 1/13 | 8/13 |
| Oltin devorda | 6/13 | 1/13 (faqat klassik) |
| Trim bor | 0/13 | 13/13 |
| Parket | 11/13 | 4/13 (laminat 6, plitka 2, beton 1) |
| Qandil | 8/13 | 3/13 (neoklassik, milliy, klassik) |
| Yotoq turidagi xonalarda karavot rejada | 2/4 (studio holatida yo'q) | 4/4 |

### Kutilganlar tekshiruvi

| Kutilgan | Natija | Izoh |
|---|---|---|
| Yotoqxona so'rovlarida karavot bor | **O'tdi** (reja bo'yicha) | 4/4 rejada karavot. Lekin kichik xonada karavot joylashuvda tushib qoldi (pastga qarang). |
| Kamida 10/13 model izohi saqlanadi | **O'tmadi: 8/13** | Almashtirilgan 5 ta: 3 tasida model izoh oxiriga inglizcha jumla qo'shgan (neoklassik, milliy, klassik; to'g'ri ushlangan). 1 tasida "och jigarrang gilam" (zamonaviy; to'g'ri ushlangan, gilam rangini tanlab bo'lmaydi). 1 tasi yolg'on signal (bolalar, pastga qarang). |
| Oltin faqat "Klassik, oltin detallar"da | **O'tdi** | Faqat klassik'da: damask oboy `accent_color #c9a24b`. |
| Loft poli = loft tayyor uslubining pol turi | **O'tdi** | `concrete`. |
| Hi-tech'da qandil yo'q | **O'tdi** | `led_panel`, `led_track`, `spotlight`; plitka pol, och devor va antratsit aksent. |
| Uslubli rejalarda trim bor | **O'tdi** | 13/13. Uslub so'ralgan rejalar tayyor uslubning trimini oladi (neoklassik va klassik'da karniz bor). |

### Har bir dizayn (qisqa)

- **Neoklassik (7)**: tayyor neoklassika asosida, aksent endi och (`#e6deca`, oldin to'q oltin). 5 ta neoklassika
  buyumi joylandi, ikki qavatli shift va karniz bor. Izoh oxiridagi inglizcha jumla sabab almashtirildi. Ko'rsatilgan
  matn to'g'ri, lekin robotga o'xshaydi.
- **Hi-tech (7)**: oq devor, antratsit aksent, plitka, LED: endi hi-tech'ga o'xshaydi. Mebelda hali ikkita boshqa
  uslub bor (Kreslo Soft — zamonaviy, Stellaj Loft — loft), lekin izoh buni ochiq aytadi va saqlandi.
- **Milliy (7)**: gulli oboy (krem va qizil), to'q yelkan parket, qandil va bra, chuqur shift. Javon Nord (skandinav)
  boshqa uslubdan. Qizil aksent A devorga (deraza devori) tushdi. Izoh inglizcha jumla sabab almashtirildi.
- **Skandinav (8)**: och devor, och laminat, osma chiroq, 6 ta skandinav buyumi. Izoh saqlandi. Torsher divan ichida,
  TV divan o'qidan siljigan (eski kamchiliklar).
- **Loft (7)**: kulrang devor, g'isht rangli aksent, beton pol, trek, hammasi loft buyumlari. Izoh saqlandi va halol
  ("g'isht rangli aksent"). Torsher Stellaj ichida.
- **Minimalist (7)**: oq va och kulrang, plitka, LED panel. Lekin 5 buyum: Kreslo Bergen va Javon Nord skandinav,
  izoh esa ularni "minimalist uslubga mos" deydi.
- **Klassik (8)**: damask oboy, oltin `accent_color`, karniz, Chester to'plami, 5/5 joylandi. Izoh inglizcha jumla
  sabab almashtirildi va ko'rsatilgan matn oltinni umuman tilga olmaydi ("damask oboy ... oq asosda"): bajarilgan
  oltin talabi izohdan yo'qoladi.
- **Zamonaviy, iliq (6)**: tayyor zamonaviy ranglari (kulrang-bej va kulrang aksent), "iliq" so'rovi faqat laminatda
  sezildi. Jurnal stoli hi-tech, gilam skandinav. Kreslo Soft joylashuvda tushib qoldi, torsher divan ichida.
- **Qorong'i, dramatik (6)**: `#2c2c2c` devor, qora double herringbone, osma chiroq va bra, klassik Chester to'plami.
  "Qorong'i" uslub emas, shuning uchun tayyor `dark` rejasi boshlang'ich bo'lmadi: aksent yo'q, shift `border`
  sozlamasiz qoldi. Izoh saqlandi, lekin xom identifikatorlarni aytadi ("plintus b053 va galtel t193").
- **Yotoqxona (7)**: Karavot Nord, tumbochka, yozuv stoli va stul (skandinav), bej devor, laminat. Kiyim shkafi
  joylashuvda tushib qoldi, izoh esa shkafni sanaydi.
- **Yotoqxona, studio holati (6)**: oldin karavotsiz mehmonxona edi (2), endi karavot Verona, tumbochka va shkaf.
  Yozuv stoli boshqa uslubdan (izoh buni aytadi). Kiyim shkafi yana tushib qoldi.
- **Bolalar (7)**: `bolalar` turi bilan bolalar karavoti, o'yin stoli, stul, bolalar javoni va pufik, 5/5 joylandi.
  Och moviy devor (`#a8dadc`). Izoh yolg'on signal bilan almashtirildi (pastga qarang).
- **Kichik xona (5)**: rejada 4 buyum, ya'ni "joy qolsin" hisobga olindi. Lekin 160 sm karavot tanlandi, "Bir
  kishilik karavot" (90 sm) esa yo'q. Joylashuvda karavot va tumbochka tushib qoldi, xonada faqat yozuv stoli va stul
  qoldi. Izoh karavotni va'da qiladi.
- **Tayyor uslublar**: zamonaviy va dark'da endi divan oldida ovqat stoli o'rniga jurnal stoli turadi (marmar,
  neoklassika uslubi). Milliy'da `shkaf` o'rniga **"Oshxona shkafi"** tanlandi (oldin bolalar javoni): xona turi hali
  ham tanlovni to'smaydi. Bu safar katalogda oshxona buyumlari ham bor edi. Dark'da Kreslo Soft tushib qoldi.
  Torsher zamonaviy va skandinav'da divan ichida, dark'da TV tumba ichida. Loft izohi hali ham "g'ishtsimon devor"
  deydi.

### Qolgan kamchiliklar

1. **Model izohga inglizcha jumla qo'shadi** (3/13). Tekshiruv buni to'g'ri ushlaydi, lekin almashtirilgan matn
   robotga o'xshaydi va klassik'da oltinni yo'qotadi. Taklif: promptda "faqat o'zbekcha, inglizcha takrorlamang"
   deb qat'iy aytish yoki matndan inglizcha oxirgi jumlalarni kesib, qolganini qayta tekshirish.
2. **Rang nomi va rang tekshiruvi bir-biriga zid**: `colour_name('#a8dadc')` "och ko'k" deydi, `_COLOUR_CLAIMS["ko'k"]`
   esa tus 185–260° ni talab qiladi (`#a8dadc` 182°). Shuning uchun bolalar izohi "'ko'k' aytilgan, lekin rejada yo'q"
   deb almashtirildi va o'rniga "och ko'k" deydigan matn chiqdi. Kod: `backend/app/services/ai_design_text.py`.
3. **Kichik xonada karavot tushib qoladi**, yotoqxonada esa kiyim shkafi (2/2). Menyu xonaga sig'maydigan katta
   karavotni ham beradi (bir kishilik karavot o'rniga 160 sm), joylashuv uni sig'dira olmaydi va yozuv stolini
   qoldiradi (`furnitureLayout.ts` / `furnitureGroups.ts`, oldingi 5-band).
4. **Izoh joylashuvdan keyin qayta qurilmaydi**: tushib qolgan shkaf va karavot izohda qoladi (oldingi 10-band).
5. **Torsher mebel ichida** (AI: skandinav, zamonaviy, loft; tayyor: zamonaviy, skandinav, dark) (oldingi 7-band).
6. **Boshqa uslubdagi mebel** hali ham tanlanadi (hi-tech, milliy, minimalist, zamonaviy) (oldingi 8-band).
7. **Tayyor uslub boshqa xona buyumini oladi** (milliy → Oshxona shkafi) (oldingi 6-band).
8. **"Qorong'i" so'rovi `dark` tayyor uslubiga bog'lanmaydi**, chunki u mebel uslubi emas. "Iliq ranglar"
   zamonaviy'da tayyor kulrang ranglarni o'zgartirmadi.
9. AI izohi ba'zan xom identifikatorlarni aytadi (`b053`, `t193`, `border`) va bu tekshiruvdan o'tadi.

### Tozalash

Harness o'zi yaratgan hamma narsani o'chirdi: ZZ mebel, `evaltest_` foydalanuvchi, kvartira va xonalar (kaskad).
Tekshiruvda 0 qoldi. Vaqtinchalik vitest fayl va konteynerdagi `/tmp/eval*.json` o'chirildi.

## 2-bosqichdan keyin (2026-10-26)

2-bosqich tuzatishlari tekshirildi: "qorong'i" `dark` tayyor uslubidan boshlanadi; sig'maydigan karavot, shkaf yoki
divan katalogdagi kichikroq shu turdagi buyumga almashtiriladi; kichik yotoqxonaga bir kishilik karavot aytiladi;
torsher mebel ichida turmaydi.

- **Harness**: `eval_ai_design.py --set phase2` (yangi 4 so'rovli to'plam, `--only` bilan toraytirsa bo'ladi).
  **4 ta OpenAI chaqiruvi**, hammasi 200, 4.7–6.2 soniya.
- **Joylashuv**: vaqtinchalik vitest `applyDesignPlan(plan, ALL_PARTS, catalog, roomType)` ni chaqirdi (almashtirish
  va torsher siljitish shu yo'lda), keyin torsher to'rtburchagini (`lightCatalog` o'lchami) har bir mebel
  to'rtburchagi bilan solishtirdi. Test fayl o'chirildi. Ma'lumot:
  `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/p2/`
  (`eval.json`, `layout_out.json`).

| So'rov (xona) | Oldin | Keyin | U R M J I | Karavot | Shkaf | Izoh |
|---|---|---|---|---|---|---|
| Shinam yotoqxona (yotoqxona 4×3.5) | 7 | **6** | U7 R6 M7 J7 I4 | Grafit 180, joylandi | Kiyim shkafi Grafit tushdi → **Kitob shkafi Oxford** (mehmonxona javoni) | saqlandi |
| Shinam yotoqxona (kichik 3×2.6) | 6 | **6** | U6 R7 M6 J7 I3 | **Bir kishilik, 90 sm**, joylandi | Kiyim shkafi Verona tushdi → **Hammom shkafi** | almashtirildi |
| Qorong'i, dramatik (mehmonxona 4.5×3.2) | 6 | **7** | U8 R8 M6 J7 I6 | — | — | saqlandi |
| Qorong'i, sokin yotoqxona (kichik 3×2.6, yangi) | — | **7** | U8 R7 M6 J7 I6 | **Bir kishilik, 90 sm**, joylandi | Kiyim shkafi Grafit tushdi → **Hammom shkafi** | saqlandi |

Hech bir rejada buyum tashlab ketilmadi (`dropped` bo'sh), xonadan chiqish va eshikni to'sish 0. Yagona ustma-ust
tushish yotoqxonada stul yozuv stoli ostiga kirgani (oldin ham shunday edi).

### Tekshiruvlar

| Kutilgan | Natija | Izoh |
|---|---|---|
| Kichik xonada karavot (≤120 sm) | **O'tdi** (2/2) | Model ikkala so'rovda "Bir kishilik karavot"ni (200×90) o'zi tanladi, almashtirish kerak bo'lmadi. Oldin 160 sm karavot tushib qolardi. |
| Kichik xonada kiyim shkafi | **O'tmadi** (0/2) | Shkaf "joylandi", lekin u **Hammom shkafi** (60×45×85, `hammom` buyumi). Eng kichik haqiqiy shkaf (Nord, 150×58) ham sig'madi. |
| Yotoqxonada karavot va shkaf | **Yarim** | Karavot joylandi. Shkaf o'rniga mehmonxonaning klassik **Kitob shkafi Oxford**i turdi. Nord 150×58 ham 4×3.5 xonada (180 karavot, yozuv stoli bilan) sig'madi. |
| Qorong'i so'rovlar `dark`dan boshlanadi | **O'tdi** (2/2) | Boshlang'ich reja `dark` (`furnitureStyle` zamonaviy). Natijada ikkalasida ham `#2c2c2c` devor, C devorda `#1a1a1a` aksent, `border` shift `settings` bilan (`#2f2f2f`, LED tasma 2700 K), qora yelkan parket, qandil + torsher + LED chiziq saqlandi. |
| Torsher mebel ichida emas | **O'tdi** (2/2) | Mehmonxonada (1.5, −1.35) va kichik xonada (1.25, 0.9): hech bir mebel to'rtburchagi bilan kesishmaydi, xona ichida. Oldin 6 ta rejada mebel ichida edi. |

### Topilmalar

1. **Almashtirish xona turiga qaramaydi va eng kichigidan boshlaydi** (`aiDesign.ts`, `smallerOfKind`): `shkaf`
   kategoriyasidagi har qanday buyum `wardrobe` rolini oladi, shuning uchun kiyim shkafi o'rniga hammom shkafi yoki
   kitob javoni tushadi. Bu 3/3 shkafda bo'ldi va tashlab ketilgan shkafni yashirib qo'yadi: foydalanuvchi "Joy
   yetmadi" o'rniga yotoqxonada hammom shkafini ko'radi. Taklif: nomzodlarni xona turi (yoki `null`) bo'yicha
   cheklash va kiyim shkafini nomidan ajratish; eng kichigidan emas, sig'adigan eng kattasidan boshlash.
2. **150 sm kiyim shkafi 4×3.5 yotoqxonaga ham sig'maydi** (180 karavot, tumbochka, yozuv stoli bilan). Geometriya
   bo'yicha C devorda joy bor, ya'ni joylashuv qoidalari (o'tish joyi, karavot yon tomoni) juda qattiq yoki shkaf
   guruhi kech joylanadi (`furnitureLayout.ts`). Kichik xonada esa shkafsiz qolishni aytish kerak.
3. **Izoh joylashuvdan keyin yangilanmaydi**: uchala shkaf almashtirishida izoh "kiyim shkafi" deydi (almashtirilgan
   shablon matni ham "Kiyim shkafi Verona" deydi), xonada esa hammom shkafi yoki kitob javoni turadi.
4. **Izohda inglizcha qoladi**: kichik yotoqxonada oxirgi inglizcha jumla sabab izoh almashtirildi (to'g'ri). Lekin
   yotoqxonada "Ceiling trim border, skirting b054 va galtel t160", qorong'i mehmonxonada "chandelier", "floor lamp",
   "led linear" tekshiruvdan o'tib saqlandi.
5. **Qorong'i mehmonxona mebeli aralash**: `dark` zamonaviy mebelni oldinga qo'yadi, lekin model klassik Kreslo
   Barokko va milliy o'ymakor jurnal stolini qo'shdi (izoh buni ochiq aytadi).

Tozalash: harness ZZ mebel va `evaltest_` foydalanuvchini o'chirdi (tekshiruvda 0), konteynerdagi
`/tmp/eval_p2.json` va vaqtinchalik vitest fayl o'chirildi.

## Yakuniy baholash (2026-10-26, #60–#64 dan keyin)

Master'da (HEAD `86941dc5`, #60–#64 bilan: xona turi, uslubning tayyor rejasidan boshlash, halol izohlar, `dark`
tayyor uslubi, kichik xona yo'riqnomasi, kichikroq buyumga almashtirish, torsher mebeldan tashqarida, yotoqxonada
kiyim shkafi ustuvorligi va eshik qoidasi, toza o'zbekcha izoh, tayyor uslublarda xona turi, `model_yaw`) xuddi shu
13 ta so'rov va 9 ta tayyor uslub qayta o'tkazildi. Mahsulot kodi o'zgartirilmadi.

### Usul

- **Harness**: `eval_ai_design.py --set style --repeats 1` (o'zgarishsiz), `andoza_ai-api-1` ichida. Lokal DB
  alembic head'da (`1786000043`). **OpenAI chaqiruvlari: 13 ta** (15 ta chegara ichida), hammasi 200,
  4.4–7.8 soniya (median 6.5).
- **Joylashuv**: vaqtinchalik vitest har bir AI rejasi uchun `applyDesignPlan(plan, ALL_PARTS, catalog, roomType)`
  ni xonaning o'z turi bilan chaqirdi. 9 ta tayyor uslub `presetPlan(id, catalog, 'mehmonxona')` bilan mehmonxonada
  qo'llandi (hammasi mehmonxona to'plami). Xona turi bog'lanishini tekshirish uchun milliy va skandinav
  `presetPlan(id, catalog, 'bolalar')` bilan bolalar xonasida ham qo'llandi. Har reja uchun joylangan, tashlab
  ketilgan va almashtirilgan buyumlar, ustma-ust tushish, xonadan chiqish, eshikni to'sish va torsher to'rtburchagining
  mebel bilan kesishishi o'lchandi. Test fayl o'chirildi. Ma'lumot:
  `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/final/`
  (`eval.json`, `layout_out.json`).
- AABB bo'yicha chiqqan "ustma-ust"lar (divan × qiya kreslo, 4 marta) burilgan to'rtburchaklar (SAT) bilan qayta
  tekshirildi: haqiqiy kesishish yo'q. Stol ostidagi stul (2 marta) ataylab shunday.
- Skrinshot olinmadi (lokal katalogda haqiqiy GLB yo'q). Baholar reja va joylashuv natijasi bo'yicha. Ustunlar oldingi
  bo'limlardagidek: U = uslubga moslik, R = rang uyg'unligi, M = mebel tanlovi, J = joylashuv, I = izoh halolligi.

### Baholar

"2-bosq." — "2-bosqichdan keyin" bo'limidagi shu so'rov va xona bahosi (bor bo'lsa).

| Tur | Birinchi | Qayta | 2-bosq. | **Yakuniy** | U R M J I |
|---|---|---|---|---|---|
| AI: Neoklassik, och ranglar | 6 | 7 | — | **8** | U8 R8 M9 J7 I8 |
| AI: Hi-tech, qora-oq, metall | 4 | 7 | — | **7** | U8 R8 M6 J7 I5 |
| AI: Milliy o'zbek uslubi | 5 | 7 | — | **7** | U8 R7 M9 J7 I5 |
| AI: Skandinav, och yog'och | 6 | 8 | — | **8** | U9 R8 M9 J6 I8 |
| AI: Loft, g'isht va qora metall | 6 | 7 | — | **7** | U7 R7 M9 J7 I5 |
| AI: Minimalist | 5 | 7 | — | **6** | U7 R8 M5 J7 I4 |
| AI: Klassik, oltin detallar | 6 | 8 | — | **8** | U9 R8 M9 J7 I5 |
| AI: Zamonaviy, iliq ranglar | 5 | 6 | — | **6** | U6 R6 M7 J7 I5 |
| AI: Qorong'i, dramatik | 5 | 6 | 7 | **7** | U8 R8 M6 J7 I7 |
| AI: Shinam yotoqxona (`yotoqxona` 4×3.5) | 4 | 7 | 6 | **7** | U7 R7 M8 J7 I4 |
| AI: Shinam yotoqxona, 2-namuna (`yotoq_2`) | 2 | 6 | — | **7** | U7 R7 M8 J8 I5 |
| AI: Bolalar xonasi (`bolalar`) | 6 | 7 | — | **7** | U7 R6 M8 J7 I5 |
| AI: Kichik xona, ko'p joy qolsin | 3 | 5 | — | **6** | U6 R7 M7 J6 I6 |
| **AI o'rtacha** | **4.8** | **6.8** | | **7.0** | |
| Tayyor: Neoklassika | 7 | 7 | | **7** | U8 R8 M7 J7 I7 |
| Tayyor: Zamonaviy | 4 | 6 | | **6** | U5 R7 M6 J6 I6 |
| Tayyor: Hi-Tech | 6 | 6 | | **6** | U7 R7 M6 J7 I6 |
| Tayyor: Milliy | 6 | 6 | | **6** | U7 R7 M4 J7 I7 |
| Tayyor: Qorong'i (dark) | 4 | 5 | | **6** | U6 R6 M5 J5 I6 |
| Tayyor: Skandinav | 7 | 7 | | **8** | U8 R8 M8 J7 I7 |
| Tayyor: Klassik | 7 | 7 | | **7** | U8 R7 M8 J6 I7 |
| Tayyor: Loft | 6 | 6 | | **6** | U6 R6 M8 J7 I4 |
| Tayyor: Minimalist | 7 | 7 | | **7** | U8 R7 M7 J7 I7 |
| **Tayyor o'rtacha (mehmonxona)** | **6.0** | **6.3** | | **6.6** | |
| Tayyor: Milliy, bolalar xonasida (yangi) | — | — | | **5** | U4 R6 M4 J6 I6 |
| Tayyor: Skandinav, bolalar xonasida (yangi) | — | — | | **6** | U5 R8 M4 J7 I7 |

Ko'ndalang raqamlar (13 ta AI rejasi):

| Ko'rsatkich | Birinchi | Qayta | Yakuniy |
|---|---|---|---|
| Model izohi saqlandi | 1/13 | 8/13 | **5/13** |
| Oltin devorda | 6/13 | 1/13 | 1/13 (faqat klassik) |
| Trim bor | 0/13 | 13/13 | 13/13 |
| Parket / laminat / plitka / beton | 11/0/0/0 | 4/6/2/1 | 6/4/2/1 |
| Qandil | 8/13 | 3/13 | 5/13 (neoklassik, milliy, klassik, qorong'i, yotoq_2) |
| Yotoq turidagi xonada karavot joylandi | — | 3/4 | **4/4** |
| Yotoqxonada kiyim shkafi joylandi | — | 0/2 | **2/3** (kichik xonada tushdi, nomi aytiladi) |
| Tashlab ketilgan buyum | — | 5 | 3 (yotoq: yozuv stoli + ish stuli; kichik: kiyim shkafi) |
| Almashtirilgan buyum | — | 3 (p2) | 0 |
| Torsher mebel ichida | 6 | 6 | **0/12** |

### Kutilganlar tekshiruvi

| Kutilgan | Natija | Izoh |
|---|---|---|
| Har bir yotoq turidagi rejada joylashuvdan keyin karavot bor | **O'tdi** (4/4) | yotoq: Grafit 180; yotoq_2: Verona 160; kichik: Bir kishilik 90; bolalar: Bolalar karavoti. |
| Yotoqxonada kiyim shkafi joylanadi yoki "tushdi" qatori uni aytadi | **O'tdi** (3/3) | yotoq va yotoq_2'da kiyim shkafi C devorda joylandi (qayta baholashda 0/2). Kichik xonada Kiyim shkafi Nord `dropped` ro'yxatida. Yotoq'da o'rniga yozuv stoli va ish stuli tushdi (shkaf ustuvorligi ishladi). |
| Kamida 10/13 izoh saqlanadi | **O'tmadi: 5/13** | Almashtirilgan 8 ta: 6 tasida oxirida inglizcha jumla ("This design ...") (hi-tech'da yana `F1`, `F2` xom identifikatorlar va turkcha "Mevcut"); loft'da "qora metall" ("'qora' rang aytilgan"); yotoq'da `#c9d6d5` "ko'k-yashil" (yolg'on signal, ko'rsatilgan matn uni "och ko'k" deydi); yotoq_2'da "yozuv stoli" (rejada Tuvalet stoli; to'g'ri ushlangan). Qayta baholashda 8/13 edi. |
| Saqlangan izohlarda inglizcha so'z va xom identifikator yo'q | **O'tmadi** (4/5 toza) | Minimalist'da "Pol **tile** turi tanlangan": `_localise` `parquet`/`laminate`ni o'giradi, `tile` va `concrete`ni emas. "Downlight" va "LED" studio'ning o'z nomlari, hisobga olinmadi. |
| Oltin faqat "Klassik, oltin detallar"da | **O'tdi** | Faqat klassik: damask `accent_color #c9a24b`. |
| Loft poli beton | **O'tdi** | `concrete`. |
| Hi-tech'da qandil yo'q | **O'tdi** | `led_panel`, `led_track`, `spotlight`. |
| Qorong'i `dark` tayyor uslubidan boshlanadi | **O'tdi** | Devor `#2c2c2c`, C aksent `#1a1a1a`, `border` shift (`#2f2f2f`, 2700 K), qora yelkan parket `#3d2b1f`, qandil + torsher + LED chiziq: `dark` bilan aynan bir xil. |
| Torsher mebel bilan kesishmaydi | **O'tdi** (12/12) | 6 ta AI va 6 ta tayyor uslub rejasidagi barcha torsherlar xona ichida, hech bir mebel bilan kesishmaydi. |
| Hech bir buyum eshikni to'smaydi | **O'tdi** | 24 ta rejada 0. Xonadan chiqish ham 0. |
| Almashtirilgan buyum shu turdan (kiyim shkafi o'rniga kitob javoni yoki hammom shkafi emas) | **O'tdi** (almashtirish 0 ta) | Bu safar hech narsa almashtirilmadi. Kichik xonada sig'magan Kiyim shkafi Nord oldingidek Hammom shkafiga almashtirilmadi, "tushdi" deb aytildi: `WARDROBE_NAME` filtri ishlaydi. Faqat salbiy holat tekshirildi: haqiqiy almashtirish bu to'plamda bo'lmadi. |

### Har bir dizayn (qisqa)

- **Neoklassik (8)**: tayyor neoklassika ranglari va trimi (ikki qavatli shift, karniz t140), 5 ta neoklassika
  buyumi, hammasi joylandi. Izoh saqlandi, toza o'zbekcha (`Parquet`/`herringbone` avtomatik "parket"/"yelkan"ga
  o'girildi) va halol.
- **Hi-tech (7)**: oq devor, antratsit aksent, plitka, LED. Kreslo Indastrial (loft) va Javon Nord (skandinav) boshqa
  uslubdan. Model izohi `F1`, `F9` identifikatorlari va inglizcha jumla bilan keldi, almashtirildi. Ko'rsatilgan
  matn to'g'ri, lekin robotga o'xshaydi.
- **Milliy (7)**: gulli oboy, to'q parket, chuqur shift, hammasi milliy buyumlar (Vitrina Neo endi yo'q). Izoh
  inglizcha oxiri sabab almashtirildi.
- **Skandinav (8)**: hammasi skandinav, izoh saqlandi va halol, torsher endi bo'sh burchakda. TV tumba divan o'qidan
  1.25 m siljigan (eski kamchilik).
- **Loft (7)**: beton, trek, g'isht rangli aksent, hammasi loft. Izoh "qora metall" uchun almashtirildi va ko'rsatilgan
  matn `#a0522d`ni "jigarrang" deydi: g'isht g'oyasi izohdan yo'qoladi.
- **Minimalist (6, oldin 7)**: TV tumba Grafit (zamonaviy) va Kreslo Indastrial (loft) qo'shildi, 5 buyum. Saqlangan
  izoh hammasini "minimalist uslubdagi" deydi va "tile" so'zini qoldiradi.
- **Klassik (8)**: damask oltin bilan, karniz, Chester to'plami, torsher bo'sh burchakda. Izoh inglizcha oxiri sabab
  almashtirildi, ko'rsatilgan matn oltinni yana tilga olmaydi.
- **Zamonaviy, iliq (6)**: tayyor zamonaviy kulrang ranglari o'zgarmadi, "iliq" faqat laminat tusida. Jurnal stoli
  minimalist, ikkinchi kreslo skandinav. Izoh almashtirildi.
- **Qorong'i (7)**: `dark`dan to'liq boshlandi. Mebel aralash (Kreslo Verona — neoklassika, Javon Nord — skandinav),
  lekin izoh buni ochiq aytadi va saqlandi ("tortsher" xatosi bilan).
- **Yotoqxona (7)**: Grafit 180, kiyim shkafi Grafit joylandi (oldin tushardi), bitta tumbochka. Yozuv stoli va ish
  stuli tushdi. Izoh yolg'on signal bilan almashtirildi va ko'rsatilgan matn tushgan yozuv stoli bilan stulni sanaydi.
- **Yotoqxona, 2-namuna (7)**: Verona to'plami, kiyim shkafi joylandi, hech narsa tushmadi. Izoh almashtirildi
  (inglizcha va "yozuv" — aslida tuvalet stoli).
- **Bolalar (7)**: bolalar karavoti, javon, o'yin stoli, endi oddiy stul (ofis stuli emas), 5/5. Pol tusi och moviy
  (`#e6f1ff`), bolalar oboyi ishlatilmadi. Izoh inglizcha oxiri sabab almashtirildi.
- **Kichik xona (6)**: 3 buyum ("joy qolsin" bajarildi), bir kishilik karavot va tumbochka joylandi (oldin karavot
  tushardi). Kiyim shkafi Nord sig'madi va aytildi. Saqlangan izoh shkafni va'da qiladi.
- **Tayyor uslublar (mehmonxona)**: torsher hech qayerda mebel ichida emas (oldin zamonaviy, skandinav, dark'da edi):
  skandinav 8, dark 6 ga ko'tarildi. Zamonaviy va dark'da jurnal stoli neoklassik marmar. Milliy hali ham
  **Oshxona shkafi**ni oladi. Dark'da Kreslo Soft tushdi. Loft izohi hali ham "g'ishtsimon devor" deydi.
- **Tayyor uslublar bolalar xonasida**: xona turi bog'lanishi ishlaydi: milliy endi `shkaf` uchun Oshxona shkafi
  o'rniga yotoqxona katalogidagi Bolalar kitob javonini oladi. Lekin uslub xonadan ustun bo'lgani va tayyor uslublar
  mehmonxona to'plami bo'lgani uchun bolalar xonasiga divan, jurnal stoli va kreslo qo'yiladi, karavot yo'q
  (milliy'da kreslo tushdi). Bu foydalanuvchi uchun g'alati.

### Qolgan kamchiliklar (foydalanuvchiga ta'siri bo'yicha)

1. **Model izohi oxiriga inglizcha jumla qo'shadi** (6/13, oldin 3/13). Butun izoh robot matniga almashtiriladi:
   klassik'da oltin, loft'da g'isht yo'qoladi. Saqlanish 8/13 dan 5/13 ga tushdi. Taklif: oxirgi inglizcha jumlani
   kesib, qolganini qayta tekshirish (`ai_design_text.py:_language_problems` / `reconcile_summary`); promptda buni
   qat'iy taqiqlash.
2. **Izoh joylashuvdan keyin yangilanmaydi**: yotoq'da tushgan yozuv stoli va stul, kichik xonada tushgan kiyim shkafi
   izohda qoladi. "Tushdi" qatori buni aytadi, lekin izoh unga zid.
3. **Tayyor uslub bolalar xonasida mehmonxona to'plamini beradi** (divan, karavotsiz) va mehmonxonada milliy
   Oshxona shkafini oladi: `aiDesignPresets.ts:pick` da uslub xonadan ustun, `shkaf` turi uchun mos xonadagi buyum
   bo'lmasa boshqa xona buyumi olinadi.
4. **Boshqa uslubdagi mebel** (hi-tech, minimalist, zamonaviy, qorong'i) va saqlangan izoh minimalist'da buni
   yashiradi ("minimalist uslubdagi ... Kreslo Indastrial").
5. **Yolg'on signal va tarjima kamchiligi**: `#c9d6d5` "ko'k-yashil" rad etiladi, "qora metall" rang deb ushlanadi;
   `_localise` `tile` va `concrete`ni o'girmaydi (minimalist izohida "tile" qoldi).
6. **4×3.5 yotoqxonada 180 karavot + shkaf bo'lsa, yozuv stoli sig'maydi**; kichik xonada 150 sm shkaf sig'maydi.
   Menyu xonaga sig'maydigan buyumni hali ham beradi.
7. Kichik kamchiliklar: TV va divan bir o'qda emas (skandinav, minimalist); `dark`da kreslo tushadi; "iliq ranglar"
   tayyor zamonaviy kulrangini o'zgartirmaydi; loft tayyor izohi "g'ishtsimon devor" deydi; bolalar polida moviy tus.

### Tozalash

Harness ZZ mebel, `evaltest_` foydalanuvchi, kvartira va xonalarni o'chirdi (tekshiruvda 0/0/0). Konteynerdagi
`/tmp/eval_final.json` va vaqtinchalik vitest fayl o'chirildi. Harness o'zgartirilmadi.

## Izoh va tayyor uslub tuzatishlaridan keyin (2026-10-26)

`fix/ai-summaries-presets` (HEAD `c2d263ff`) da xuddi shu 13 ta so'rov va 9 ta tayyor uslub qayta o'tkazildi. Bu
shoxda: izohdan inglizcha yoki xom identifikatorli jumla olib tashlanib, o'zbekcha qolgani saqlanadi; rang
tekshiruvida qo'shma rang qoidasi va material istisnosi (faqat bandda devor so'zi bo'lmasa); pol turi o'zbekcha
aytiladi; yotoqxona va bolalar xonasida tayyor uslub yotoqxona to'plamini beradi; boshqa xona uchun buyum oxirgi
o'rinda; ko'rsatiladigan izoh tushgan buyumni olib tashlaydi va "Mebel:" ro'yxatini bittalab tahrirlaydi.
Mahsulot kodi o'zgartirilmadi.

### Usul

- **Harness**: `eval_ai_design.py --set style --repeats 1` (o'zgarishsiz), `andoza_ai-api-1` ichida, DB
  `1786000043` (head). **OpenAI chaqiruvlari: 13 ta** (15 ta chegara ichida), hammasi 200, 4.0–7.1 s (median 5.8).
- **Joylashuv**: vaqtinchalik vitest `applyDesignPlan(plan, ALL_PARTS, catalog, roomType)` ni xonaning haqiqiy turi
  bilan chaqirdi: 13 ta AI rejasi va 9 ta tayyor uslub uch xonada (`mehmonxona` 4.5×3.2, `bolalar` 3.5×3,
  `yotoqxona` 4×3.5), jami 40 reja. Ustma-ust tushish burilgan to'rtburchaklar (SAT) bilan o'lchandi.
- **Ko'rsatilgan izoh**: `AiBuilderSheet` dagidek `summaryWithout(plan.summary, applied.dropped, [joylanganlar,
  almashtirilganlar])`.
- Ma'lumot: `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/now/`
  (`eval.json`, `layout_out.json`). Skrinshot yo'q; baholar reja, joylashuv va ko'rsatilgan matn bo'yicha.

### Baholar

| Tur | Yakuniy | **Endi** | U R M J I |
|---|---|---|---|
| AI: Neoklassik, och ranglar | 8 | **8** | U8 R8 M9 J7 I9 |
| AI: Hi-tech, qora-oq, metall | 7 | **7** | U8 R8 M6 J7 I6 |
| AI: Milliy o'zbek uslubi | 7 | **8** | U8 R7 M8 J7 I8 |
| AI: Skandinav, och yog'och | 8 | **8** | U9 R8 M9 J6 I8 |
| AI: Loft, g'isht va qora metall | 7 | **8** | U8 R7 M9 J7 I8 |
| AI: Minimalist | 6 | **6** | U7 R8 M5 J7 I4 |
| AI: Klassik, oltin detallar | 8 | **8** | U9 R8 M9 J7 I8 |
| AI: Zamonaviy, iliq ranglar | 6 | **6** | U6 R6 M6 J6 I5 |
| AI: Qorong'i, dramatik | 7 | **7** | U8 R8 M6 J6 I5 |
| AI: Shinam yotoqxona (`yotoqxona`) | 7 | **7** | U7 R7 M8 J8 I7 |
| AI: Shinam yotoqxona, 2-namuna | 7 | **8** | U8 R7 M8 J8 I8 |
| AI: Bolalar xonasi | 7 | **7** | U7 R7 M8 J7 I6 |
| AI: Kichik xona, ko'p joy qolsin | 6 | **6** | U6 R7 M6 J5 I7 |
| **AI o'rtacha** | **7.0** | **7.2** | |
| Tayyor (mehmonxona): Neoklassika | 7 | **7** | U8 R8 M7 J7 I7 |
| Tayyor (mehmonxona): Zamonaviy | 6 | **6** | U5 R7 M6 J6 I6 |
| Tayyor (mehmonxona): Hi-Tech | 6 | **6** | U7 R7 M6 J7 I6 |
| Tayyor (mehmonxona): Milliy | 6 | **7** | U7 R7 M6 J7 I7 |
| Tayyor (mehmonxona): Qorong'i (dark) | 6 | **6** | U6 R6 M5 J5 I6 |
| Tayyor (mehmonxona): Skandinav | 8 | **8** | U8 R8 M8 J7 I7 |
| Tayyor (mehmonxona): Klassik | 7 | **7** | U8 R7 M8 J6 I7 |
| Tayyor (mehmonxona): Loft | 6 | **6** | U6 R6 M8 J7 I4 |
| Tayyor (mehmonxona): Minimalist | 7 | **7** | U8 R7 M7 J7 I7 |
| **Tayyor o'rtacha (mehmonxona)** | **6.6** | **6.7** | |
| Tayyor (bolalar): Neoklassika | — | **7** | U7 R8 M8 J7 I7 |
| Tayyor (bolalar): Zamonaviy | — | **7** | U7 R7 M8 J7 I6 |
| Tayyor (bolalar): Hi-Tech | — | **6** | U5 R7 M6 J7 I6 |
| Tayyor (bolalar): Milliy | 5 | **7** | U6 R7 M6 J7 I7 |
| Tayyor (bolalar): Qorong'i (dark) | — | **6** | U6 R6 M7 J7 I6 |
| Tayyor (bolalar): Skandinav | 6 | **8** | U8 R8 M8 J7 I7 |
| Tayyor (bolalar): Klassik | — | **7** | U6 R7 M6 J7 I7 |
| Tayyor (bolalar): Loft | — | **6** | U5 R6 M6 J7 I5 |
| Tayyor (bolalar): Minimalist | — | **7** | U6 R7 M6 J7 I7 |
| **Tayyor o'rtacha (bolalar)** | **5.5** (2 ta) | **6.8** | |
| Tayyor (yotoqxona): Neoklassika | — | **8** | U8 R8 M8 J7 I7 |
| Tayyor (yotoqxona): Zamonaviy | — | **7** | U7 R7 M8 J7 I6 |
| Tayyor (yotoqxona): Hi-Tech | — | **6** | U5 R7 M5 J7 I6 |
| Tayyor (yotoqxona): Milliy | — | **6** | U6 R7 M5 J7 I7 |
| Tayyor (yotoqxona): Qorong'i (dark) | — | **7** | U7 R6 M8 J7 I6 |
| Tayyor (yotoqxona): Skandinav | — | **8** | U8 R8 M9 J7 I7 |
| Tayyor (yotoqxona): Klassik | — | **7** | U7 R7 M6 J7 I7 |
| Tayyor (yotoqxona): Loft | — | **6** | U5 R6 M5 J7 I5 |
| Tayyor (yotoqxona): Minimalist | — | **7** | U6 R7 M6 J7 I7 |
| **Tayyor o'rtacha (yotoqxona)** | — | **6.9** | |

Ko'ndalang raqamlar (13 ta AI rejasi):

| Ko'rsatkich | Yakuniy | Endi |
|---|---|---|
| Model izohi saqlandi | 5/13 | **11/13** |
| Saqlangan izohda inglizcha / xom identifikator | 1/5 (`tile`) | **0/11** |
| Oltin devorda | 1/13 (klassik) | 1/13 (klassik) |
| Parket / laminat / plitka / beton | 6/4/2/1 | 5/5/2/1 |
| Qandil | 5/13 | 5/13 (neoklassik, milliy, klassik, qorong'i, yotoq_2) |
| Yotoq turidagi xonada karavot joylandi | 4/4 | 4/4 |
| Tashlab ketilgan buyum (AI) | 3 | 4 (zamonaviy: TV tumba Grafit; qorong'i: Kreslo Soft; kichik: Kiyim shkafi Nord, Ish stuli) |
| Almashtirilgan buyum | 0 | 0 |
| Ko'rsatilgan izoh tushgan buyumni aytadi | (2 ta) | **0/5** |
| Torsher mebel ichida | 0/12 | 0/21 |
| Eshik to'silgan / xonadan chiqqan | 0 / 0 | 0 / 0 (40 reja) |

### Kutilganlar tekshiruvi

| Kutilgan | Natija | Izoh |
|---|---|---|
| Kamida 10/13 izoh saqlanadi | **O'tdi: 11/13** | Skandinav'da oxirgi inglizcha jumla, neoklassik'da `double_layer`, `b054`, `t140` jumlasi kesildi va qolgani saqlandi. Loft'dagi "qora metall" endi ushlanmaydi; loft va klassik'da `track`, `floor lamp`, `chandelier`, `parquet` o'zbekchaga o'girildi. Almashtirilgan 2 ta: zamonaviy ("och jigarrang jun gilam", gilam aslida "Gilam jun och") va qorong'i ("kulrang gilam", katalogda "Gilam kulrang": yolg'on signal). |
| Saqlangan izohlarda inglizcha yoki xom identifikator yo'q | **O'tdi** (11/11) | Faqat "LED", "Hi-Tech" va "downlight" (studio nomlari, oldingidek hisobga olinmadi). "tile" endi "plitka". |
| Ko'rsatilgan izoh tushgan buyumni aytmaydi | **O'tdi** (0/5) | Zamonaviy va qorong'ida "Mebel:" ro'yxatidan faqat TV tumba Grafit / Kreslo Soft olib tashlandi. Kichik xonada shkaf va stulni aytgan mebel jumlasi butunlay tushdi. Tayyor `dark` izohi kresloni aytmaydi. |
| Bolalar va yotoqxonadagi tayyor uslublarda karavot bor, divan va jurnal stoli yo'q | **O'tdi** (18/18) | Bolalar: hammasida Bolalar karavoti + tumbochka + kiyim shkafi + yozuv stoli + gilam, hech narsa tushmadi. Yotoqxona: karavot + tumbochka + kiyim shkafi + gilam. Divan, jurnal stoli, kreslo 0. |
| Mehmonxona tayyor uslublarida oshxona buyumi yo'q | **O'tdi** | Milliy endi Oshxona shkafi o'rniga Kitob shkafi Oxford'ni oladi. |
| Yotoq turidagi rejada karavot joylandi | **O'tdi** (4/4 AI, 18/18 tayyor) | yotoq: Nord 160; yotoq_2: Verona 160; bolalar: Bolalar karavoti; kichik: Bir kishilik. |
| Yotoqxonada kiyim shkafi joylanadi yoki "tushdi" qatori uni aytadi | **O'tdi** (3/3) | yotoq va yotoq_2'da joylandi (yotoq'da endi yozuv stoli va stul ham sig'di, 6/6). Kichik xonada Kiyim shkafi Nord `dropped` da. |
| Oltin faqat "Klassik, oltin detallar"da | **O'tdi** | AI rejalarida faqat klassik damask `#c9a24b`. |
| Loft poli beton | **O'tdi** | `concrete`. |
| Hi-tech'da qandil yo'q | **O'tdi** | `led_panel`, `led_track`, `spotlight`. |
| Qorong'i `dark` tayyor uslubidan boshlanadi | **O'tdi** | Devor `#2c2c2c`, C `#1a1a1a`, `border` shift `#2f2f2f` 2700 K, parket `#3d2b1f`, qandil + torsher + LED chiziq. |
| Torsher mebel bilan kesishmaydi | **O'tdi** (21/21) | 6 ta AI va 15 ta tayyor reja; hammasi xona ichida. |
| Hech bir buyum eshikni to'smaydi | **O'tdi** | 40 rejada 0; xonadan chiqish 0. Ustma-ust: faqat yozuv/tuvalet stoli ostidagi stul (3 marta, ataylab). |

### Qisqacha

- **Izohlar** asosiy yutuq: saqlanish 5/13 → 11/13. Klassik'da oltin, loft'da g'isht, milliy va yotoq_2'da
  halol mebel ro'yxati endi foydalanuvchiga yetadi. Milliy (7 → 8), loft (7 → 8), yotoq_2 (7 → 8) shu hisobiga.
- **Tayyor uslublar** bolalar xonasida 5–6 dan 6.8 ga: endi bolalar to'plami, divansiz. Mehmonxonada milliy 6 → 7.
- **Qorong'i AI** bahosi 7 da qoldi, lekin I va J pasaydi: yolg'on signal sabab izoh robot matniga almashdi va
  Kreslo Soft tushdi.

### Qolgan kamchiliklar (foydalanuvchiga ta'siri bo'yicha)

1. **Rang tekshiruvi katalog nomidagi rangni teskari tartibda tanimaydi**: "kulrang gilam" ("Gilam kulrang")
   qorong'i izohini almashtirdi. Zamonaviy'da "och jigarrang jun gilam" esa haqiqiy xato ("och" = yorug').
2. **Tayyor uslub yotoqxonada uslubsiz bir kishilik karavotni oladi** (hi-tech, milliy, loft, minimalist, 4×3.5
   xonada): `pick` uslubsiz buyumga 1, boshqa uslubdagiga 0 beradi va o'lchamni hisobga olmaydi, shuning uchun
   Bir kishilik karavot 90 Grafit 180 dan ustun. Tumbochka va shkaf ham ko'pincha Nord/Grafit (uslubdan tashqari).
3. **Izohda mebel uslubi noto'g'ri**: minimalist "minimalist uslubdagi ... Javon Nord, Gilam jun och, TV tumba
   Nord" deydi (uchalasi skandinav); bolalar izohi Bolalar kitob javonini "kiyim shkafi" deydi. Tekshiruv buni
   ushlamaydi.
4. **Kichik xona (3×2.6)**: faqat karavot joylandi; 150 sm shkaf yana sig'madi, yozuv stolisiz ish stuli ham tushdi.
   Model va menyu sig'maydigan buyumni hali ham beradi. Ko'rsatilgan izohda mebel haqida hech narsa qolmaydi.
5. **Mehmonxonada kreslo/TV tumba tushishi**: `dark` (tayyor va AI) da Kreslo Soft, zamonaviy'da 7 buyumli rejada
   TV tumba Grafit tushdi.
6. Kichik kamchiliklar (o'zgarmagan): TV va divan bir o'qda emas (skandinav 1.25 m, minimalist 0.75 m); "iliq
   ranglar" tayyor zamonaviy kulrangini o'zgartirmaydi; loft tayyor izohi "g'ishtsimon devor" deydi (bolalar va
   yotoqxonada ham); hi-tech izohi `ZZ` nomlarini to'g'ridan-to'g'ri sanaydi.

### Tozalash

Harness ZZ mebel, `evaltest_` foydalanuvchi va `ZZ apt` kvartirani o'chirdi (tekshiruvda 0/0/0). Konteynerdagi
`/tmp/eval_now.json` va vaqtinchalik vitest fayl (`zzEvalTmp.test.ts`) o'chirildi. Harness o'zgartirilmadi.

## #68 dan keyingi baholash (2026-10-26)

`master` (HEAD `0e3b3ccb`, #66–#68 bilan) da qayta o'tkazildi. Shu orada: #66 tayyor uslub karavotni xona
o'lchamiga moslaydi; #67 izohda kiyim shkafi/javon va mebel uslubi da'volarini tekshiradi va faqat noto'g'ri
jumlani olib tashlaydi; #68 uslubsiz so'rov xona turi rejasidan taklif sifatida boshlanadi (mehmonxona/oshxona →
zamonaviy, yotoqxona/bolalar/balkon → skandinav, kabinet/hammom → minimalist), rang yoki kayfiyat so'zi rejaning
devor ranglarini olib tashlaydi, aksent devor berilmaydi, rasmli so'rovga reja berilmaydi; tayyor uslublarda
oshxona, kabinet, balkon va hammom to'plamlari, oshxona va hammomda plitka pol. Mahsulot kodi o'zgartirilmadi.

### Usul

- **Harness**: `eval_ai_design.py --set style` (13 so'rov) va yangi `--set template` (5 ta uslubsiz so'rov:
  "Shinam mehmonxona", "Iliq ranglar" (mehmonxona 4.5×3.2), "Shinam yotoqxona" (yotoqxona 4×3.5), "Sokin kabinet"
  (yangi `study` xonasi, `kabinet` 3.5×3), "Yorqin oshxona" (`oshxona` 3.5×3)). Harness'ga faqat `study` xonasi va
  `template` to'plami qo'shildi. `andoza_ai-api-1` ichida, DB `1786000043` (head).
- **OpenAI chaqiruvlari: 18 ta** (20 ta chegara ichida), hammasi 200, 3.2–8.2 s (median 3.8).
- **Joylashuv**: vaqtinchalik vitest `applyDesignPlan(plan, ALL_PARTS, catalog, roomType)` ni xonaning haqiqiy turi
  bilan chaqirdi: 18 ta AI rejasi va 9 ta tayyor uslub 8 ta xonada (`mehmonxona` 4.5×3.2, `yotoqxona` 4×3.5,
  `yotoqxona` 3×2.6, `bolalar` 3.5×3, `oshxona` 3.5×3, `kabinet` 3.5×3, `balkon` 3×1.4, `hammom` 2.2×1.8), jami 90
  reja. Tayyor uslub `presetPlan(id, catalog, roomType, undefined, roomSizeOf(geometry))` bilan, studiodagidek.
  Ustma-ust tushish burilgan to'rtburchaklar (SAT) bilan; torsher joyi `lightSpot`dan keyingi haqiqiy joyidan.
- **Ko'rsatilgan izoh**: `summaryWithout(plan.summary, applied.dropped, [joylanganlar, almashtirilganlar])`.
- Ma'lumot: `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/after68/`
  (`style.json`, `tpl.json`, `layout.json`). Skrinshot yo'q; baholar reja, joylashuv va ko'rsatilgan matn bo'yicha.

### Baholar

U = uslubga moslik, R = rang uyg'unligi, M = mebel tanlovi, J = joylashuv, I = izoh halolligi (1–10).

| Tur | Oldingi | **Endi** | U R M J I |
|---|---|---|---|
| AI: Neoklassik, och ranglar | 8 | **8** | U8 R8 M9 J7 I9 |
| AI: Hi-tech, qora-oq, metall | 7 | **7** | U8 R8 M6 J7 I5 |
| AI: Milliy o'zbek uslubi | 8 | **7** | U8 R7 M7 J7 I6 |
| AI: Skandinav, och yog'och | 8 | **8** | U9 R8 M9 J6 I8 |
| AI: Loft, g'isht va qora metall | 8 | **7** | U8 R7 M9 J7 I6 |
| AI: Minimalist | 6 | **7** | U7 R8 M5 J7 I6 |
| AI: Klassik, oltin detallar | 8 | **8** | U9 R8 M9 J7 I6 |
| AI: Zamonaviy, iliq ranglar | 6 | **6** | U6 R5 M7 J7 I6 |
| AI: Qorong'i, dramatik | 7 | **7** | U8 R8 M7 J7 I7 |
| AI: Shinam yotoqxona (`yotoqxona`) | 7 | **8** | U8 R8 M8 J8 I7 |
| AI: Shinam yotoqxona, 2-namuna | 8 | **8** | U8 R8 M8 J8 I8 |
| AI: Bolalar xonasi | 7 | **7** | U7 R7 M7 J7 I7 |
| AI: Kichik xona, ko'p joy qolsin | 6 | **6** | U6 R7 M6 J5 I7 |
| **AI o'rtacha (13 ta uslub so'rovi)** | **7.2** | **7.2** | |
| AI uslubsiz: Shinam mehmonxona | — | **7** | U7 R8 M7 J7 I6 |
| AI uslubsiz: Iliq ranglar (mehmonxona) | — | **7** | U7 R8 M6 J6 I6 |
| AI uslubsiz: Shinam yotoqxona, 3-namuna | — | **8** | U8 R8 M8 J8 I8 |
| AI uslubsiz: Sokin kabinet | — | **4** | U4 R4 M3 J5 I4 |
| AI uslubsiz: Yorqin oshxona | — | **8** | U8 R8 M8 J6 I8 |
| **AI uslubsiz o'rtacha (5 ta)** | — | **6.8** | |

Tayyor uslublar (har katakda: jami, U R M J I):

| Tayyor | Mehmonxona (oldin → endi) | Yotoqxona 4×3.5 (oldin → endi) | Bolalar (oldin → endi) | Kichik 3×2.6 |
|---|---|---|---|---|
| Neoklassika | 7 → **7** (U8 R8 M7 J7 I7) | 8 → **8** (U8 R8 M8 J7 I7) | 7 → **7** (U7 R8 M8 J7 I7) | **6** (U7 R8 M5 J5 I7) |
| Zamonaviy | 6 → **6** (U5 R7 M6 J6 I6) | 7 → **7** (U7 R7 M8 J7 I6) | 7 → **7** (U7 R7 M8 J7 I6) | **6** (U6 R7 M5 J5 I6) |
| Hi-Tech | 6 → **6** (U7 R7 M6 J7 I6) | 6 → **7** (U6 R7 M7 J7 I6) | 6 → **6** (U5 R7 M6 J7 I6) | **5** (U5 R7 M4 J5 I6) |
| Milliy | 7 → **7** (U7 R7 M6 J7 I7) | 6 → **7** (U6 R7 M6 J7 I7) | 7 → **7** (U6 R7 M6 J7 I7) | **5** (U6 R7 M4 J3 I7) |
| Qorong'i (dark) | 6 → **6** (U6 R6 M5 J5 I6) | 7 → **7** (U7 R6 M8 J7 I6) | 6 → **6** (U6 R6 M7 J7 I6) | **6** (U7 R6 M5 J5 I6) |
| Skandinav | 8 → **8** (U8 R8 M8 J7 I7) | 8 → **8** (U8 R8 M9 J7 I7) | 8 → **8** (U8 R8 M8 J7 I7) | **6** (U8 R8 M5 J5 I7) |
| Klassik | 7 → **7** (U8 R7 M8 J6 I7) | 7 → **7** (U7 R7 M7 J7 I7) | 7 → **7** (U6 R7 M6 J7 I7) | **5** (U7 R7 M4 J3 I7) |
| Loft | 6 → **6** (U6 R6 M8 J7 I4) | 6 → **6** (U5 R6 M6 J7 I5) | 6 → **6** (U5 R6 M6 J7 I5) | **5** (U5 R6 M4 J5 I5) |
| Minimalist | 7 → **7** (U8 R7 M7 J7 I7) | 7 → **7** (U6 R7 M7 J7 I7) | 7 → **7** (U6 R7 M6 J7 I7) | **6** (U6 R7 M5 J5 I7) |
| **O'rtacha** | 6.7 → **6.7** | 6.9 → **7.1** | 6.8 → **6.8** | **5.6** |

| Tayyor | Oshxona 3.5×3 | Kabinet 3.5×3 | Balkon 3×1.4 | Hammom 2.2×1.8 |
|---|---|---|---|---|
| Neoklassika | **6** (U6 R7 M7 J7 I4) | **7** (U7 R8 M7 J7 I7) | **5** (U6 R7 M4 J5 I5) | **5** (U5 R7 M7 J7 I3) |
| Zamonaviy | **6** (U6 R7 M6 J6 I4) | **7** (U7 R7 M7 J7 I6) | **6** (U6 R7 M6 J6 I5) | **6** (U6 R7 M7 J7 I4) |
| Hi-Tech | **7** (U7 R7 M7 J7 I7) | **6** (U5 R7 M5 J7 I6) | **5** (U5 R7 M4 J5 I6) | **7** (U7 R7 M7 J7 I7) |
| Milliy | **6** (U6 R7 M7 J7 I4) | **7** (U7 R7 M7 J7 I7) | **6** (U6 R7 M6 J6 I5) | **4** (U4 R6 M7 J7 I3) |
| Qorong'i (dark) | **6** (U6 R6 M6 J6 I5) | **7** (U7 R6 M7 J7 I6) | **6** (U6 R6 M6 J6 I6) | **4** (U4 R5 M7 J4 I4) |
| Skandinav | **6** (U7 R8 M7 J7 I5) | **8** (U8 R8 M8 J7 I7) | **7** (U7 R8 M7 J6 I7) | **6** (U6 R8 M7 J7 I4) |
| Klassik | **6** (U6 R7 M7 J7 I4) | **7** (U7 R7 M7 J7 I7) | **5** (U6 R7 M4 J5 I5) | **4** (U4 R6 M7 J7 I3) |
| Loft | **6** (U6 R6 M7 J7 I3) | **7** (U6 R6 M7 J7 I5) | **6** (U6 R6 M6 J6 I5) | **5** (U5 R6 M7 J7 I3) |
| Minimalist | **7** (U7 R7 M7 J7 I7) | **6** (U5 R7 M5 J7 I6) | **5** (U6 R7 M4 J5 I6) | **7** (U7 R7 M7 J7 I7) |
| **O'rtacha** | **6.2** | **6.9** | **5.7** | **5.3** |

Ko'ndalang raqamlar (13 ta uslub so'rovi; qavsda 5 ta uslubsiz so'rov):

| Ko'rsatkich | Oldingi | Endi |
|---|---|---|
| Model izohi ko'rsatildi (butun yoki jumla kesilib) | 11/13 | **13/13** (5/5); 3 tasida jumla kesildi: loft, minimalist, bolalar (iliq, kabinet) |
| Hech bir tekshiruv ushlamagan izoh (harness `kept`) | — | 10/13 (3/5) |
| Saqlangan izohda inglizcha / xom qiymat | 0/11 | **1/13** inglizcha jumla (klassik); hex kod 5/13 |
| Oltin devorda | 1/13 (klassik) | 1/13 (klassik) (0/5) |
| Qandil | 5/13 | 4/13: neoklassik, milliy, klassik, qorong'i (0/5) |
| Yotoq turidagi xonada karavot joylandi | 4/4 | 4/4 (1/1); tayyor 27/27 |
| Tashlab ketilgan buyum (AI) | 4 | 2: hitech Stul, kichik Kiyim shkafi Nord (iliq: Kreslo Soft, Stul; kabinet: Stul; oshxona: 2 ta Velvet stul) |
| Almashtirilgan buyum | 0 | 0 |
| Torsher mebel ichida / xonadan tashqarida | 0/21 | **0/53** / **1/53** (tayyor `dark`, hammom) |
| Eshik to'silgan | 0 | **0** (90 reja) |
| Xonadan chiqqan buyum | 0 | **2**: tayyor milliy va klassik 3×2.6 xonada 200×300 gilam |
| Ustma-ust | stul yozuv stoli ostida (3) | faqat ataylab: stul yozuv stoli ostida, ovqat stullari stol atrofida |

### Kutilganlar tekshiruvi

| Kutilgan | Natija | Izoh |
|---|---|---|
| Kamida 10/13 izoh saqlanadi | **O'tdi: 13/13** | Hech biri robot matniga almashmadi. #67 dan beri noto'g'ri jumla kesiladi: loft'da devor jumlasi ("qora", "qizil": qisman yolg'on signal) va inglizcha jumla; minimalist'da "kulrang mebel" jumlasi (u yerda noto'g'ri uslub da'vosi ham bor edi); bolalar'da "kiyim shkafi" (aslida Bolalar kitob javoni) jumlasi. |
| Saqlangan izohda inglizcha yoki xom identifikator yo'q | **O'tmadi** | Klassik'da "This classic style living room combines damask wallpaper with golden accent and yelkan parket flooring." qoldi: atama tarjimasi ("herringbone parquet" → "yelkan parket") inglizcha jumlani tanib bo'lmaydigan qiladi. Hex kodlar (#f5f1e6, #d9d6d0, #a88b6a, #f0e6d2, #d2b48c) 5 ta izohda; hitech "spotlightlar", iliq "strip naqshi", milliy "qandil (qandil)" va `'ZZ ...'` qo'shtirnoqli nomlar. |
| Ko'rsatilgan izoh tushgan buyumni aytmaydi | **O'tdi** (izoh bilan) | Harness'da hitech "oddiy stullar qo'shildi" va kabinet "oddiy stul" qoldi, chunki katalog nomi "ZZ Stul", matnda "stul" (stul uchun `ROLE_WORD` yo'q). "ZZ " olib tashlanganda (haqiqiy katalogdagidek) ikkala jumla ham to'g'ri olib tashlanadi. Kichik xona va iliq'da mebel jumlasi butunlay tushdi. |
| Kiyim shkafi/javon va mebel uslubi da'vosi noto'g'ri emas | **O'tmadi** | Bolalar'dagi shkaf/javon ushlandi. Lekin uslub tekshiruvi faqat *hech bir* tanlangan buyumda yo'q uslubni ushlaydi, ro'yxatdagi bitta begona buyumni emas: milliy "milliy uslubdagi ... TV tumba Grafit" (zamonaviy), qorong'i "klassik uslubda ... Grafit TV tumba", zamonaviy "zamonaviy uslubdagi ... Jurnal stoli Mono" (minimalist), shinam mehmonxona "zamonaviy uslubda ... Jurnal stoli eman, Kreslo Bergen" (skandinav). Kabinet TV tumba Indastrial'ni "javon" deydi (Kitob shkafi Oxford "javon"ni oqlaydi). |
| Yotoq turidagi rejada karavot joylandi | **O'tdi** | AI 5/5 (yotoq, yotoq_2, shinam_yotoq: Nord 160; bolalar: Bolalar karavoti; kichik: Bir kishilik); tayyor 27/27. |
| Kiyim shkafi joylanadi yoki "tushdi" qatori aytadi | **O'tdi** | Yotoqxona 4×3.5: AI 3/3 joylandi, tayyor 9/9. Kichik xona: AI va 9 ta tayyor `dropped`da (150–180 sm shkaf sig'maydi). Bolalar: tayyor 9/9 joylandi; AI shkaf tanlamadi (javon oldi). |
| Oltin faqat so'ralganda | **O'tdi** | Faqat klassik damask `#c9a24b`. Uslubsiz 5 ta rejada oltin yo'q. |
| Loft poli beton | **O'tdi** | `concrete`; devor `#4a4a4a`, aksent `#a0522d`. |
| Hi-tech'da qandil yo'q | **O'tdi** | `led_panel`, `led_track`, `spotlight`. |
| Qorong'i `dark` tayyor uslubidan boshlanadi | **O'tdi** | Devor `#2c2c2c`, C `#1a1a1a`, `border` shift, parket `#3d2b1f`, qandil + torsher + LED chiziq. Endi barcha 6 buyum joylandi va izoh saqlandi. |
| Torsher mebel bilan kesishmaydi | **O'tdi** (53/53) | Mebel bilan 0. Bitta torsher xonadan tashqarida: tayyor `dark` hammomda (2.2×1.8). |
| Hech bir buyum eshikni to'smaydi | **O'tdi** | 90 rejada 0. |
| Tayyor karavot xona o'lchamiga mos | **O'tdi** | 4×3.5: hammasi ikki kishilik (Verona 160, Nord 160, Grafit 180, Saroy 180); oldin hi-tech/milliy/loft/minimalist 90 sm olardi. 3×2.6: 9/9 Bir kishilik 90. |
| Har xona turi o'z to'plamini oladi | **O'tdi** (balkon qisman) | Oshxona 9/9: ovqat stoli + stullar + oshxona shkafi + plitka (zamonaviy/dark'da Velvet stullardan 2 tasi sig'madi). Kabinet 9/9: yozuv stoli + ish stuli + kreslo + javon/kitob shkafi. Balkon 9/9 kichik stol + o'rindiq, lekin 4/9 da kreslo tushdi, faqat bitta stul qoldi. Hammom 9/9: faqat Hammom shkafi + plitka, yashash xonasi mebeli yo'q. |
| Uslubsiz so'rov xona turi rejasidan boshlanadi | **O'tdi** | 9 ta uslubsiz AI rejasida aksent devor 0. "Iliq ranglar" devori `#d9b382` (iliq qum), shablon kulrangi `#d9d6d0` emas. "Yorqin oshxona" oq + plitka. Lekin "Sokin kabinet" `#4b4b4b` devor va `#3a3a3a` pol oldi (minimalist shabloni oq). |

### Qolgan kamchiliklar (foydalanuvchiga ta'siri bo'yicha)

1. **AI kabinetga yozuv stoli bermaydi.** `furniture_menu` kabinet uchun mehmonxona + umumiy buyumlarni oladi va
   ular yetarli bo'lsa (`MIN_FITTING_PIECES`) boshqa xonaniki umuman ko'rsatilmaydi. Yozuv stoli katalogda
   `yotoqxona` bo'lgani uchun model uni ko'rmaydi: "Sokin kabinet" Kitob shkafi, kreslo, jurnal stoli, TV tumba va
   stul oldi, stul esa stolsiz tushdi. Ustiga devor `#4b4b4b`, pol `#3a3a3a` ("sokin" shablon devorini saqlaydi,
   lekin model baribir to'q kulrang tanladi). Tayyor uslub esa kabinetda stolni topadi (frontend `pick` boshqa
   xonanikini oxirida oladi): ikki yo'l bir-biriga zid.
2. **Tayyor uslub izohi xona turini bilmaydi.** Oshxona va hammomda pol plitka, lekin izoh "och eman parket",
   "yog'ochsimon laminat", "beton pol", milliy'da "gilam" deydi (14/18 rejada). Hammomda milliy/klassik oboy va
   qandil, `dark`da torsher xonadan tashqarida. Hammom tayyor o'rtachasi 5.3, oshxona 6.2.
3. **Izohda mebel uslubi ro'yxat bo'yicha noto'g'ri** (milliy, qorong'i, zamonaviy, shinam mehmonxona) va tur
   noto'g'ri (kabinet TV tumbani "javon" deydi). #67 tekshiruvi faqat hech kim ega bo'lmagan uslubni ushlaydi.
4. **Inglizcha jumla tarjimadan keyin o'tib ketadi** (klassik) va izohlarda hex kodlar paydo bo'ldi (5/13).
   Tarjima inglizcha jumla tekshiruvidan oldin ishlaydi, shuning uchun aralash jumla o'zbekcha deb hisoblanadi.
5. **Balkon to'plami tor balkonga sig'maydi**: 110×60 jurnal stoli va 85×85 kreslo 1.4 m balkonda; 4/9 da
   ikkinchi o'rindiq tushdi. Kichik stol uchun o'lcham hisobga olinmaydi.
6. **Kichik xona (3×2.6)**: AI ham, 9 ta tayyor ham shkafni sig'dira olmaydi; tayyor milliy va klassik
   200×300 gilamni xonadan chiqarib qo'yadi. Izohda mebel haqida hech narsa qolmaydi.
7. Kichik kamchiliklar: "Zamonaviy, iliq ranglar" hamon shablon kulrangida (`#d9d6d0`/`#8c8a86`, uslubli
   so'rovda rang so'zi shablonni olib tashlamaydi); oshxonada torsher; hi-tech/minimalist tayyor kabinetda plitka
   pol (backend quruq xonada laminatga almashtiradi, frontend yo'q); loft izohi "g'ishtsimon devor" deydi.

### Tozalash

Harness ZZ mebel, `evaltest_` foydalanuvchi va `ZZ apt` kvartirani o'chirdi (tekshiruvda 0/0/0). Konteynerdagi
`/tmp/eval68_*.json` va vaqtinchalik vitest fayllar (`zzEvalTmp.test.ts`, `zzEvalTmp2.test.ts`) o'chirildi.
Harness'ga `study` (kabinet 3.5×3) xonasi va `template` to'plami qo'shildi.

## #70 dan keyingi baholash (2026-10-26)

`master` (HEAD `ce88fed1`, #70 bilan) da qayta o'tkazildi. #70: AI kabinet menyusi har doim yozuv stoli, ish
stuli va kitob javonini taklif qiladi (har rol uchun ko'pi bilan 3 ta, istalgan xonadan); "ovqatlanish
stuli/stoli" endi yozuv stoli deb o'qilmaydi; tayyor uslub hammomda devorni bo'yaydi (oboy → asosiy rang),
qandil/osma chiroq/torsherni olib tashlaydi, shiftga chiroq va bitta vanna chirog'i qo'yadi; oshxona va hammom
izohidan pol/oboy/qandil jumlalari olib tashlanadi, plitka jumlasi qo'shiladi, hech jumla qolmasa "X uslubi
... uchun moslandi" jumlasi qo'yiladi. Mahsulot kodi o'zgartirilmadi.

### Usul

- **Harness**: `eval_ai_design.py --set style` (13 so'rov) va `--set template` (5 ta uslubsiz so'rov), `andoza_ai-api-1`
  ichida, DB `1786000043`. ZZ katalogiga 2 ta buyum qo'shildi: `Ish stoli` (stol, yotoqxona, 120×60) va `Kitob
  javoni` (shkaf, yotoqxona, 80×30×180). Eslatma: kabinet yo'li avvalgi ZZ katalogida ham ishlardi (`Yozuv stoli
  Nord`, `Ish stuli`, `Kitob shkafi Oxford`, `Javon Nord`, `Stellaj Loft` `always_offered`ga tushadi; #70 dan oldin
  ular menyuga kirmasdi). Yangi ikkitasi `\bish stoli` qoidasini va oddiy "kitob javoni" nomini sinaydi. `Ish
  stuli` allaqachon bor edi, takrorlanmadi.
- **OpenAI chaqiruvlari: 18 ta** (20 ta chegara ichida), hammasi 200, 2.8–5.6 s (median 4.2).
- **Joylashuv**: vaqtinchalik vitest `applyDesignPlan(plan, ALL_PARTS, catalog, roomType)` ni xonaning haqiqiy turi
  bilan chaqirdi: 18 ta AI rejasi va 9 ta tayyor uslub 8 ta xonada (o'lchamlar #68 dagidek), jami 90 reja. Tayyor
  uslub `presetPlan(id, catalog, roomType, undefined, roomSizeOf(geometry))` bilan. Ustma-ust tushish SAT
  (`overlaps(a, b, -0.005)`) bilan; torsher joyi `applyDesignPlan` qo'ygan haqiqiy joyidan. Balkon: A 3 m (deraza
  2.4 m), C 3 m o'rtasida eshik. #68 dagi balkon geometriyasi saqlanmagan edi. Shuning uchun torsher natijasi
  yana uch variantda tekshirildi: eshik B da, C 0.2 da, C 0.8 da.
- **Ko'rsatilgan izoh**: `summaryWithout(plan.summary, applied.dropped, [joylanganlar, almashtirilganlar])`.
- Ma'lumot: `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/after70/`
  (`style.json`, `tpl.json`, `layout.json`; oxirgisida balkon variantlari `balconyB`, `balconyC2`, `balconyC8`
  ham bor). Skrinshot yo'q.

### Baholar

U = uslubga moslik, R = rang uyg'unligi, M = mebel tanlovi, J = joylashuv, I = izoh halolligi (1–10).

| Tur | #68 dan keyin | **Endi** | U R M J I |
|---|---|---|---|
| AI: Neoklassik, och ranglar | 8 (U8 R8 M9 J7 I9) | **8** | U8 R8 M9 J7 I8 |
| AI: Hi-tech, qora-oq, metall | 7 (U8 R8 M6 J7 I5) | **7** | U8 R8 M6 J7 I7 |
| AI: Milliy o'zbek uslubi | 7 (U8 R7 M7 J7 I6) | **7** | U8 R7 M7 J7 I8 |
| AI: Skandinav, och yog'och | 8 (U9 R8 M9 J6 I8) | **8** | U9 R8 M9 J7 I7 |
| AI: Loft, g'isht va qora metall | 7 (U8 R7 M9 J7 I6) | **8** | U8 R7 M9 J7 I8 |
| AI: Minimalist | 7 (U7 R8 M5 J7 I6) | **6** | U7 R8 M4 J7 I6 |
| AI: Klassik, oltin detallar | 8 (U9 R8 M9 J7 I6) | **8** | U9 R8 M9 J7 I8 |
| AI: Zamonaviy, iliq ranglar | 6 (U6 R5 M7 J7 I6) | **6** | U6 R5 M7 J7 I5 |
| AI: Qorong'i, dramatik | 7 (U8 R8 M7 J7 I7) | **7** | U8 R8 M7 J7 I7 |
| AI: Shinam yotoqxona (`yotoqxona`) | 8 (U8 R8 M8 J8 I7) | **8** | U8 R8 M8 J8 I8 |
| AI: Shinam yotoqxona, 2-namuna | 8 (U8 R8 M8 J8 I8) | **8** | U8 R8 M8 J8 I8 |
| AI: Bolalar xonasi | 7 (U7 R7 M7 J7 I7) | **7** | U6 R7 M7 J7 I8 |
| AI: Kichik xona, ko'p joy qolsin | 6 (U6 R7 M6 J5 I7) | **6** | U6 R7 M6 J5 I6 |
| **AI o'rtacha (13 ta uslub so'rovi)** | **7.2** | **7.2** | |
| AI uslubsiz: Shinam mehmonxona | 7 (U7 R8 M7 J7 I6) | **7** | U7 R8 M6 J7 I6 |
| AI uslubsiz: Iliq ranglar (mehmonxona) | 7 (U7 R8 M6 J6 I6) | **7** | U7 R8 M6 J7 I5 |
| AI uslubsiz: Shinam yotoqxona, 3-namuna | 8 (U8 R8 M8 J8 I8) | **8** | U8 R8 M8 J8 I7 |
| AI uslubsiz: Sokin kabinet | 4 (U4 R4 M3 J5 I4) | **7** | U7 R6 M8 J7 I8 |
| AI uslubsiz: Yorqin oshxona | 8 (U8 R8 M8 J6 I8) | **8** | U8 R8 M8 J6 I8 |
| **AI uslubsiz o'rtacha (5 ta)** | **6.8** | **7.4** | |

Har bir AI dizayn qisqacha (o'zgarganlari):

- **Sokin kabinet** (4 → 7): endi Yozuv stoli Nord + Ish stuli + Javon Nord + Kreslo Bergen + Gilam jun och, hammasi
  joylandi (stul stol ostida). Devor och yashil `#d9e4dd`, oldingi `#4b4b4b` emas. Laminat tusi ham yashilroq
  `#c6d8c9`, yog'och pol uchun g'alati. Inglizcha oxirgi jumla kesildi, qolgani to'g'ri.
- **Loft, Klassik** (I 6 → 8): inglizcha takror jumla endi kesiladi. Klassik'da `yelkan naqshli parket`.
- **Milliy** (I 6 → 8): izoh "klassik uslubdagi kitob shkafi" deydi, bu to'g'ri (Oxford klassik). TV tumba yo'q.
- **Hi-tech** (I 5 → 7): ZZ Stul tushdi va mebel jumlasi butunlay olib tashlandi. Qolgan matn to'g'ri, lekin
  joylangan 5 ta mebel haqida hech narsa demaydi. Mebelda loft kreslo va loft stellaj bor.
- **Minimalist** (7 → 6): mehmonxonada plitka pol, ikkita jurnal stoli (Mono + eman), zamonaviy kreslo, skandinav
  TV tumba; Stul tushdi. Tekshiruv "gilam o'rniga plitka" jumlasini yolg'on deb kesdi (gilam aytilmagan, inkor
  qilingan). Natijada izohda pol ham, mebel ham yo'q.
- **Zamonaviy, iliq**: hamon shablon kulrangi `#d9d6d0`/`#8c8a86`, izoh esa "och iliq krem" va "accent devor" deydi.
- **Qorong'i**: izohdagi uslublar endi to'g'ri ("divan, kreslo va TV tumba zamonaviy, jurnal stoli minimalist").
  Lekin `(#1a1a1a)` va "parkey" xatosi bor.
- **Iliq ranglar**: Kreslo Soft tushdi. "och jigarrang gilam" jumlasi (Gilam jun och) butun mebel jumlasini olib
  ketdi. "toshyor" (torsher o'rniga) qoldi.
- **Shinam yotoqxona, 3-namuna**: "pushti-bej" devor jumlasi to'g'ri kesildi (`#f5f3ee`). Izohda devor haqida
  hech narsa qolmadi.
- **Shinam mehmonxona**: zamonaviy divan/kreslo/tumba yonida milliy o'ymakor jurnal stoli va skandinav Kreslo Bergen.
  Izoh hammasini "zamonaviy uslubdagi" deb sanaydi va Bergen'ni aytmaydi.

Tayyor uslublar (har katakda: jami, U R M J I). Mehmonxona, yotoqxona, bolalar va kichik xonada reja va izoh
#68 dagidek, shuning uchun baholar o'zgarmadi: bolalar va kabinetda yozuv stoli endi uslubsiz `Ish stoli`
(skandinavdan tashqari 8/9), bu baho uchun neytral.

| Tayyor | Mehmonxona | Yotoqxona 4×3.5 | Bolalar | Kichik 3×2.6 |
|---|---|---|---|---|
| Neoklassika | **7** (U8 R8 M7 J7 I7) | **8** (U8 R8 M8 J7 I7) | **7** (U7 R8 M8 J7 I7) | **6** (U7 R8 M5 J5 I7) |
| Zamonaviy | **6** (U5 R7 M6 J6 I6) | **7** (U7 R7 M8 J7 I6) | **7** (U7 R7 M8 J7 I6) | **6** (U6 R7 M5 J5 I6) |
| Hi-Tech | **6** (U7 R7 M6 J7 I6) | **7** (U6 R7 M7 J7 I6) | **6** (U5 R7 M6 J7 I6) | **5** (U5 R7 M4 J5 I6) |
| Milliy | **7** (U7 R7 M6 J7 I7) | **7** (U6 R7 M6 J7 I7) | **7** (U6 R7 M6 J7 I7) | **5** (U6 R7 M4 J3 I7) |
| Qorong'i (dark) | **6** (U6 R6 M5 J5 I6) | **7** (U7 R6 M8 J7 I6) | **6** (U6 R6 M7 J7 I6) | **6** (U7 R6 M5 J5 I6) |
| Skandinav | **8** (U8 R8 M8 J7 I7) | **8** (U8 R8 M9 J7 I7) | **8** (U8 R8 M8 J7 I7) | **6** (U8 R8 M5 J5 I7) |
| Klassik | **7** (U8 R7 M8 J6 I7) | **7** (U7 R7 M7 J7 I7) | **7** (U6 R7 M6 J7 I7) | **5** (U7 R7 M4 J3 I7) |
| Loft | **6** (U6 R6 M8 J7 I4) | **6** (U5 R6 M6 J7 I5) | **6** (U5 R6 M6 J7 I5) | **5** (U5 R6 M4 J5 I5) |
| Minimalist | **7** (U8 R7 M7 J7 I7) | **7** (U6 R7 M7 J7 I7) | **7** (U6 R7 M6 J7 I7) | **6** (U6 R7 M5 J5 I7) |
| **O'rtacha** | 6.7 → **6.7** | 7.1 → **7.1** | 6.8 → **6.8** | 5.6 → **5.6** |

| Tayyor | Oshxona 3.5×3 (oldin → endi) | Kabinet 3.5×3 | Balkon 3×1.4 (oldin → endi) | Hammom 2.2×1.8 (oldin → endi) |
|---|---|---|---|---|
| Neoklassika | 6 → **7** (U6 R7 M7 J7 I7) | **7** (U7 R8 M7 J7 I7) | 5 → **5** (U6 R7 M4 J5 I5) | 5 → **7** (U7 R7 M7 J7 I7) |
| Zamonaviy | 6 → **6** (U6 R7 M6 J6 I7) | **7** (U7 R7 M7 J7 I6) | 6 → **6** (U6 R7 M6 J5 I5) | 6 → **7** (U7 R7 M7 J7 I7) |
| Hi-Tech | 7 → **7** (U7 R7 M7 J7 I7) | **6** (U5 R7 M5 J7 I6) | 5 → **5** (U5 R7 M4 J5 I6) | 7 → **7** (U7 R7 M7 J7 I7) |
| Milliy | 6 → **7** (U6 R7 M7 J7 I7) | **7** (U7 R7 M7 J7 I7) | 6 → **6** (U6 R7 M6 J6 I5) | 4 → **6** (U5 R7 M7 J7 I6) |
| Qorong'i (dark) | 6 → **6** (U6 R6 M6 J6 I6) | **7** (U7 R6 M7 J7 I6) | 6 → **6** (U6 R6 M6 J5 I6) | 4 → **6** (U6 R5 M7 J7 I6) |
| Skandinav | 6 → **7** (U7 R8 M7 J7 I7) | **8** (U8 R8 M8 J7 I7) | 7 → **7** (U7 R8 M7 J5 I7) | 6 → **7** (U7 R8 M7 J7 I7) |
| Klassik | 6 → **7** (U6 R7 M7 J7 I7) | **7** (U7 R7 M7 J7 I7) | 5 → **5** (U6 R7 M4 J5 I5) | 4 → **6** (U5 R7 M7 J7 I6) |
| Loft | 6 → **7** (U6 R6 M7 J7 I7) | **7** (U6 R6 M7 J7 I5) | 6 → **6** (U6 R6 M6 J5 I5) | 5 → **7** (U6 R6 M7 J7 I7) |
| Minimalist | 7 → **7** (U7 R7 M7 J7 I7) | **6** (U5 R7 M5 J7 I6) | 5 → **5** (U6 R7 M4 J5 I6) | 7 → **7** (U7 R7 M7 J7 I7) |
| **O'rtacha** | 6.2 → **6.8** | 6.9 → **6.9** | 5.7 → **5.7** | 5.3 → **6.7** |

Guruh o'rtachalari:

| Guruh | #68 dan keyin | Endi |
|---|---|---|
| AI, 13 ta uslub so'rovi | 7.2 | **7.2** |
| AI, 5 ta uslubsiz so'rov | 6.8 | **7.4** |
| AI, hammasi (18) | 7.1 | **7.3** |
| Tayyor uslublar, 72 reja (8 xona o'rtachasi) | 6.3 | **6.5** |
| — oshxona + hammom (18) | 5.8 | **6.8** |
| — qolgan 6 xona (54) | 6.5 | **6.5** |

Ko'ndalang raqamlar (13 ta uslub so'rovi; qavsda 5 ta uslubsiz so'rov):

| Ko'rsatkich | #68 dan keyin | Endi |
|---|---|---|
| Model izohi ko'rsatildi (butun yoki jumla kesilib) | 13/13 (5/5) | **13/13 (5/5)**; tekshiruv jumla kesdi: minimalist (iliq, shinam yotoq 3) |
| Hech bir tekshiruv ushlamagan izoh (harness `kept`) | 10/13 (3/5) | **12/13 (3/5)** |
| Inglizcha jumla kesildi (alohida filtr) | — | loft, klassik (kabinet) |
| Ko'rsatilgan izohda inglizcha so'z / hex | 1 jumla / 5 | **2 so'z** ("spotlightlar", "accent devor") / **2** (`#1a1a1a`, `f5f3ee`) |
| Oltin devorda | 1/13 (klassik) | 1/13 (klassik) (0/5) |
| Qandil | 4/13 | 4/13: neoklassik, milliy, klassik, qorong'i (0/5) |
| Yotoq turidagi xonada karavot | 4/4 (1/1); tayyor 27/27 | 4/4 (1/1); tayyor 27/27 |
| Tashlab ketilgan buyum (AI) | 2 (5) | 3: hitech Stul, minimalist Stul, kichik Kiyim shkafi Nord (iliq Kreslo Soft, oshxona 2 Velvet stul) |
| Almashtirilgan buyum | 0 | 0 |
| Torsher: AI | 0/21 mebelda | **0/14** mebelda, xonadan tashqarida, eshikda |
| Torsher: tayyor | 1/32 xonadan tashqarida (hammom) | **2/35 stulga tegadi, 2/35 eshik zonasida** (hammasi balkon); hammomda torsher endi yo'q |
| Eshikni to'sgan mebel | 0 | **0** (90 reja) |
| Xonadan chiqqan buyum | 2 (3×2.6 da 200×300 gilam) | 2 (o'sha) |
| Ustma-ust | faqat ataylab | faqat ataylab: stul stol ostida, ovqat stullari stol atrofida |

### Kutilganlar tekshiruvi

| Kutilgan | Natija | Izoh |
|---|---|---|
| Kamida 10/13 izoh saqlanadi | **O'tdi: 13/13** | Harness `kept` 12/13; minimalist'da "gilam o'rniga plitka" jumlasi kesildi (yolg'on signal). |
| Saqlangan izohda inglizcha / xom identifikator / hex yo'q | **O'tmadi** | To'liq inglizcha jumla endi yo'q (loft, klassik, kabinet kesildi). Qoldi: skandinav "spotlightlar", zamonaviy "accent devor", qorong'i `(#1a1a1a)`, kichik `(f5f3ee)`. Xom id yo'q; `ZZ ...` nomlari katalog nomi. |
| Ko'rsatilgan izoh tushgan buyumni aytmaydi | **O'tdi** | hitech va minimalist'da Stul jumlasi, kichikda shkaf jumlasi, iliq'da kreslo olib tashlandi. Oshxona "velvet ovqat stullari" qoldi, 2/4 stul joylangan. |
| Tur/uslub da'vosi noto'g'ri emas | **O'tmadi** (1/18, chegaraviy) | #68 dagi 4 ta uslub xatosi yo'q (milliy, qorong'i endi to'g'ri). Qolgani: shinam mehmonxona milliy o'ymakor jurnal stolini "zamonaviy uslubdagi" ro'yxatga qo'shadi. Tur xatosi 0. Rang da'vosi xatosi: zamonaviy kulrang devorni "iliq krem" deydi. |
| Har yotoqxona rejasida karavot | **O'tdi** | AI 5/5, tayyor 27/27. |
| Kiyim shkafi joylanadi yoki aytiladi | **O'tdi** | 4×3.5: AI 3/3, tayyor 9/9 joylandi. 3×2.6: AI va 9/9 tayyor shkafi `dropped` qatorida. |
| Oltin faqat so'ralganda | **O'tdi** | Faqat klassik `#c9a24b` (va klassik tayyor uslub). |
| Loft poli beton | **O'tdi** | `concrete`, `#4a4a4a` + `#a0522d`. |
| Hi-tech'da qandil yo'q | **O'tdi** | `led_panel`, `led_track`, `spotlight`. |
| Qorong'i `dark` tayyor uslubidan | **O'tdi** | `#2c2c2c`/`#1a1a1a`, `border`, parket `#3d2b1f`, qandil + torsher + LED chiziq. |
| Torsher mebeldan holi va xona ichida | **O'tmadi** (balkon) | AI 14/14 toza, tayyor 31/35 toza. Balkonda (eshik C o'rtasida) zamonaviy va skandinav torsheri Stulga tegadi, dark va loft torsheri eshik ochiladigan zonada. Boshqa balkon variantlarida ham: eshik C 0.2 da 2 ta eshik zonasida, C 0.8 da 1 ta xonadan tashqarida. 1.4 m balkonda `floorLampSpot` bo'sh joy topa olmaydi. |
| Eshik to'silmaydi | **O'tdi** (mebel) | 90 rejada 0 ta mebel. Balkon torsherlari yuqorida. |
| Tayyor karavot xonaga mos | **O'tdi** | 4×3.5: Verona 160, Grafit 180, Nord 160, Saroy. 3×2.6: 9/9 Bir kishilik. Bolalar: Bolalar karavoti. |
| Har xona turi o'z to'plamini oladi | **O'tdi** (balkon qisman) | Oshxona 9/9: stol + stullar + shkaf + plitka. Kabinet 9/9: stol + ish stuli + kreslo + javon/kitob shkafi. Hammom 9/9: Hammom shkafi. Balkon 9/9 stol + stul, 4/9 da kreslo tushdi. |
| Uslubsiz so'rov shablondan (aksentsiz) | **O'tdi** | 5/5 da aksent devor yo'q. Iliq `#d9b382`, shinam mehmonxona `#c2b9af`, yotoq `#f5f3ee`, kabinet `#d9e4dd`, oshxona oq + plitka. |
| YANGI: kabinet AI rejasida yozuv stoli | **O'tdi** | Yozuv stoli Nord + Ish stuli joylandi, Javon Nord ham. Menyuda F1–F5 stol, stul va javonlar. |
| YANGI: hammom tayyorida oboy, qandil va torsher yo'q, shiftda chiroq bor | **O'tdi** | 9/9 bo'yoq (milliy `#f3e6cf`, klassik `#f5f1e6` oboy asosidan). Qandil, osma chiroq, torsher: 0. Markazda chiroq 9/9: downlight ×3, LED chiziq ×2, LED panel ×2, spot, trek. Vanna chirog'i 3/9 (bra bo'lganlarda). |
| YANGI: oshxona/hammom tayyor izohida parket/laminat/beton/oboy/qandil yo'q, plitka jumlasi bor | **O'tdi** | 18/18 taqiqlangan so'zsiz; "Pol: namlikka chidamli kafel." 18/18; hammomda "Devorlar bo'yalgan, asosiy chiroq shiftda." 9/9. "Moslandi" jumlasi: oshxona 6/9, hammom 6/9. Hi-tech va minimalist o'z jumlasini saqlaydi. Dark'da bitta jumla qoladi ("Kam va iliq yorug'lik shu kayfiyatni saqlaydi."), u o'chirilgan jumlaga ishora qiladi. |

### Qolgan kamchiliklar (foydalanuvchiga ta'siri bo'yicha)

1. **Tor balkon (3×1.4)**: tayyor uslub kreslosi 4/9 da tushadi (eshik B da yoki C 0.2 da 7–8/9). Torsher bo'sh
   joy topa olmay stulga tegadi, eshik zonasida turadi yoki xonadan chiqadi (har variantda 1–4 ta). Balkon o'rtachasi
   5.7, eng pastlardan biri. Kichik stol va kreslo o'lchami hisobga olinmaydi. Balkonda torsher umuman kerak emas.
2. **Kichik xona (3×2.6)**: shkaf AI'da ham, 9/9 tayyorda ham sig'maydi. Milliy va klassik tayyor 200×300 gilamni
   xonadan chiqaradi. AI izohida mebel jumlasi qolmaydi. O'rtacha 5.6.
3. **Izoh tekshiruvi ortiqcha kesadi**: tushgan bitta Stul hitech va minimalist'da 5 ta joylangan mebelni sanagan
   jumlani butunlay olib ketadi (ro'yxat deb tanilmaydi, chunki jumlada boshqa so'zlar bor). "gilam o'rniga plitka"
   inkor jumlasi kesiladi. "och jigarrang gilam" (iliq) jumlasi butun mebel tavsifini olib ketadi. 4/18 izohda mebel
   haqida hech narsa qolmaydi (hitech, minimalist, kichik, iliq).
4. **AI mebelni uslublararo aralashtiradi**: minimalist'da ikkita jurnal stoli, zamonaviy kreslo, skandinav tumba va
   mehmonxonada plitka; hitech'da loft kreslo va stellaj; shinam mehmonxonada milliy stol va skandinav kreslo
   (izohda "zamonaviy" deyiladi). "Zamonaviy, iliq ranglar" hamon shablon kulrangida, izoh esa "iliq krem" deydi.
5. **Matn sifati**: "spotlightlar", "accent devor", ikki izohda hex, "parkey", "toshyor", neoklassik'da ma'nosiz
   "Devorsiz och rangli bo'yoq".
6. **Ho'l xona tayyorlari**: dark'da qolgan bitta jumla o'chirilgan jumlaga ishora qiladi ("shu kayfiyatni").
   Milliy/klassik hammom krem bo'yoq + downlight bo'lib qoladi va uslubdan hech narsa qolmaydi, izoh esa "uslubi
   moslandi" deydi. Oshxonada hamon oboy (milliy, klassik), qandil va torsher. Hi-tech/minimalist kabinetda plitka pol.
7. Kichik: oshxonada 4 Velvet stuldan 2 tasi sig'maydi (AI va zamonaviy/dark tayyor). Sokin kabinet laminati yashil tusda.

### Tozalash

Harness ZZ mebel, `evaltest_` foydalanuvchi va `ZZ apt` kvartirani o'chirdi (tekshiruvda 0/0/0). Konteynerdagi
`/tmp/eval70_*.json` va vaqtinchalik vitest (`zzEvalTmp.test.ts`) o'chirildi. Harness'ga `Ish stoli` va
`Kitob javoni` (yotoqxona) qo'shildi.

## #77 dan keyingi baholash (2026-10-27)

`master` (HEAD `803dba9b`, #71–#77 bilan) da qayta o'tkazildi. #71: izoh filtri faqat sof mebel ro'yxatini
buyumma-buyum tahrirlaydi, tushgan buyumni aytgan boshqa jumla butunlay olib tashlanadi; "o'rniga", "yo'q",
"emas", "o'xshash" da'vo emas. Bo'sh joy topilmagan torsher qo'yilmaydi va tushganlar ro'yxatida aytiladi. Tor
balkonda (< 1.8 m) bitta o'rindiq va eng kichik stol. Tayyor uslub sig'adigan gilamni oladi, joylashuv gilamni
90° buradi yoki kichigiga almashtiradi. #73: "Barcha xonalarga qo'llash". #74: qo'shni xona umumiy devorda
saqlagan eshik ham bo'sh qoladi. #75–#77: UI tuzatishlari. Mahsulot kodi o'zgartirilmadi.

### Usul

- **Harness**: `eval_ai_design.py --set style` (13) va `--set template` (5), `andoza_ai-api-1` ichida. Harness
  o'zgartirilmadi.
- **OpenAI chaqiruvlari: 18 ta** (20 ta chegara ichida), hammasi 200, 3.1–5.6 s (median 3.9).
- **Joylashuv va ko'rsatilgan izoh**: vaqtinchalik vitest. 18 ta AI rejasi va 9 ta tayyor uslub 8 ta xonada:
  mehmonxona 4.5×3.2, yotoqxona 4×3.5, kichik 3×2.6, bolalar 3.5×3, oshxona 3.5×3, kabinet 3.5×3, balkon 3×1.4
  (eshik C o'rtasida, `aiEvalAfter70.json` dan), hammom 2.2×1.8. Jami 90 reja. Har biri
  `applyDesignPlan(plan, ALL_PARTS, catalog, roomType)` bilan xonaning haqiqiy turida qo'llandi. Tayyor uslub
  `presetPlan(id, catalog, roomType, undefined, roomSizeOf(geometry))` bilan. Ko'rsatilgan izoh:
  `summaryWithout(summary, [dropped + droppedLights], [placed + swapped.from])`, `AiBuilderSheet` dagidek.
  Ustma-ust tushish `overlaps(a, b, -0.005)` bilan, torsher va eshik zonasi `overlaps(..., 0)` bilan.
- **YANGI: 2 xonali kvartira** (OpenAI'siz). Ikkita 4×3.5 xona 20 mm oraliq bilan, A ning B devori B ning D
  devoriga qaragan. Har xonada A devorida deraza, C devorida o'z eshigi bor. Umumiy devordagi eshik faqat A da
  saqlangan, uch joyda tekshirildi: 0.2, 0.5, 0.8. A (mehmonxona) ga uchta manba qo'llandi: AI klassik
  rejasi, `milliy` va `loft` tayyor uslublari (`applyDesignPlan(..., { roomId, rooms })`). Keyin
  `applyToOtherRooms` B ni yozdi, B ning turi `yotoqxona`. B ning PATCH dagi `state` i tekshirildi: eshik
  zonasi kodga bog'liq bo'lmagan to'rtburchak bilan o'lchandi, `borrowedDoorLayout.test.ts` dagidek. Izoh
  `planForRoom` + `designRoomState` dan olindi, natija PATCH bilan bir xil. Jami 9 holat.
- Ma'lumot: `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/after77/`
  (`style.json`, `tpl.json`, `layout.json`). Skrinshot yo'q.

### Baholar

U = uslubga moslik, R = rang uyg'unligi, M = mebel tanlovi, J = joylashuv, I = izoh halolligi (1–10).

| Tur | #70 dan keyin | **Endi** | U R M J I |
|---|---|---|---|
| AI: Neoklassik, och ranglar | 8 (U8 R8 M9 J7 I8) | **8** | U8 R8 M9 J7 I8 |
| AI: Hi-tech, qora-oq, metall | 7 (U8 R8 M6 J7 I7) | **7** | U8 R8 M6 J7 I7 |
| AI: Milliy o'zbek uslubi | 7 (U8 R7 M7 J7 I8) | **7** | U8 R7 M7 J7 I6 |
| AI: Skandinav, och yog'och | 8 (U9 R8 M9 J7 I7) | **8** | U9 R8 M9 J7 I8 |
| AI: Loft, g'isht va qora metall | 8 (U8 R7 M9 J7 I8) | **8** | U8 R7 M9 J7 I8 |
| AI: Minimalist | 6 (U7 R8 M4 J7 I6) | **6** | U7 R8 M5 J7 I5 |
| AI: Klassik, oltin detallar | 8 (U9 R8 M9 J7 I8) | **8** | U9 R8 M9 J7 I6 |
| AI: Zamonaviy, iliq ranglar | 6 (U6 R5 M7 J7 I5) | **6** | U6 R5 M7 J7 I6 |
| AI: Qorong'i, dramatik | 7 (U8 R8 M7 J7 I7) | **7** | U8 R8 M7 J7 I5 |
| AI: Shinam yotoqxona (`yotoqxona`) | 8 (U8 R8 M8 J8 I8) | **8** | U8 R8 M8 J8 I8 |
| AI: Shinam yotoqxona, 2-namuna | 8 (U8 R8 M8 J8 I8) | **8** | U8 R8 M8 J8 I7 |
| AI: Bolalar xonasi | 7 (U6 R7 M7 J7 I8) | **7** | U6 R7 M7 J7 I8 |
| AI: Kichik xona, ko'p joy qolsin | 6 (U6 R7 M6 J5 I6) | **6** | U6 R7 M6 J5 I6 |
| **AI o'rtacha (13 ta uslub so'rovi)** | **7.2** | **7.2** | |
| AI uslubsiz: Shinam mehmonxona | 7 (U7 R8 M6 J7 I6) | **6** | U7 R7 M6 J7 I5 |
| AI uslubsiz: Iliq ranglar (mehmonxona) | 7 (U7 R8 M6 J7 I5) | **7** | U7 R8 M7 J7 I7 |
| AI uslubsiz: Shinam yotoqxona, 3-namuna | 8 (U8 R8 M8 J8 I7) | **8** | U8 R8 M8 J8 I6 |
| AI uslubsiz: Sokin kabinet | 7 (U7 R6 M8 J7 I8) | **7** | U7 R6 M8 J7 I7 |
| AI uslubsiz: Yorqin oshxona | 8 (U8 R8 M8 J6 I8) | **7** | U8 R8 M7 J6 I7 |
| **AI uslubsiz o'rtacha (5 ta)** | **7.4** | **7.0** | |

Har bir AI dizayn qisqacha (o'zgarganlari):

- **Skandinav, Loft** (I 7 → 8): inglizcha oxirgi jumla kesildi. "spotlight" endi "spot chiroq" deb yoziladi.
  Skandinav'da hamma mebel skandinav, gilam va torsher bor.
- **Klassik** (I 8 → 6): uchta inglizcha jumladan bittasi qoldi: "This design embraces a classic style with
  damask wallpaper…". Backend filtri inglizcha jumlani kamida 3 ta belgi so'z bilan taniydi, bu jumlada esa
  bittasi bor (`with`). "parquetdan" ham qoldi.
- **Milliy** (I 8 → 6): izoh `Oxford kitob shkafi` ni (klassik) "milliy uslubdagi" ro'yxatga qo'shadi.
- **Minimalist** (M 4 → 5, I 6 → 5): jurnal stoli endi bitta, mebel jumlasi izohda qoldi. Lekin Kreslo
  Bergen, TV tumba Nord va Javon Nord skandinav, izoh esa hammasini "minimalist uslubga mos" deydi.
  Mehmonxonada hamon plitka pol.
- **Qorong'i** (I 7 → 5): uchta hex (`#2c2c2c`, `#1a1a1a`, `#3d2b1f`) va "klassik ZZ Stul" (Stul uslubsiz).
  "parkey" xatosi yo'q.
- **Zamonaviy, iliq** (I 5 → 6): izoh endi "iliq krem" demaydi, "ochiq va to'q aksent" deydi. Devor hamon
  shablon kulrangi `#d9d6d0`/`#8c8a86`. Mono (minimalist) "zamonaviy uslubdagi" ro'yxatda.
- **Hi-tech**: mebel jumlasi endi saqlanadi va to'g'ri: "indastrial uslubda kreslo va loft shkafi". Backend
  "Torsher mavjud emas" inkor jumlasini yolg'on da'vo deb kesdi (`kept` = yo'q). Pol "g'ishtli plitka" deyiladi,
  rejada naqsh yo'q.
- **Shinam yotoqxona, 2-namuna**: torsher "to'p lampasi" deb atalgan.
- **Shinam mehmonxona** (7 → 6): `ZZ Stul` `dining_chair` sifatida tanlandi, stol yo'q, shuning uchun tushdi.
  Izoh esa "va oddiy stul joy olgan" deydi: `dining_chair` ning `ROLE_WORD` da so'zi yo'q. Uslublar endi to'g'ri
  ("Skandinav uslubidagi jurnal stoli").
- **Iliq ranglar**: devor `#e6c9a8` (iliqroq), Kreslo Soft endi joylandi, izoh to'liq va uslublari to'g'ri.
  Faqat `ZZ` nomlari bor.
- **Shinam yotoqxona, 3-namuna**: backend "laminate parket" + hex jumlasini kesdi, izohda devor va pol qolmadi.
- **Yorqin oshxona** (8 → 7): "bezak uchun muzlatgich va pufik", oshxonada torsher. 4 ta Velvet stuldan 2 tasi
  joylandi.
- **Kichik xona**: shkaf tushdi va ro'yxatda aytildi. Mebel jumlasi ("kichik o'lchamdagi bir kishilik karavot,
  tor kiyim shkafi…") sof ro'yxat emas, shuning uchun butunlay olib tashlandi.

Tayyor uslublar. Mehmonxona, yotoqxona 4×3.5, bolalar, oshxona, kabinet va hammomda reja va izoh #70 dagidek,
shuning uchun baholar o'zgarmadi. Bolalarda milliy va klassik endi `Gilam kulrang` oladi, bu baho uchun neytral.
O'zgarganlari kichik xona va balkon:

| Tayyor | Kichik 3×2.6 (oldin → endi) | Balkon 3×1.4 (oldin → endi) |
|---|---|---|
| Neoklassika | 6 → **6** (U7 R8 M5 J5 I7) | 5 → **6** (U6 R7 M5 J7 I5) |
| Zamonaviy | 6 → **6** (U6 R7 M5 J5 I6) | 6 → **6** (U6 R7 M5 J7 I5) |
| Hi-Tech | 5 → **5** (U5 R7 M4 J5 I6) | 5 → **6** (U5 R7 M5 J7 I6) |
| Milliy | 5 → **6** (U6 R7 M4 J5 I7) | 6 → **6** (U6 R7 M5 J7 I5) |
| Qorong'i (dark) | 6 → **6** (U7 R6 M5 J5 I6) | 6 → **6** (U6 R6 M5 J7 I6) |
| Skandinav | 6 → **6** (U8 R8 M5 J5 I7) | 7 → **7** (U7 R8 M5 J7 I7) |
| Klassik | 5 → **6** (U7 R7 M4 J5 I7) | 5 → **6** (U6 R7 M5 J7 I5) |
| Loft | 5 → **5** (U5 R6 M4 J5 I5) | 6 → **6** (U6 R6 M5 J7 I5) |
| Minimalist | 6 → **6** (U6 R7 M5 J5 I7) | 5 → **6** (U6 R7 M5 J7 I6) |
| **O'rtacha** | 5.6 → **5.8** | 5.7 → **6.1** |

- **Kichik**: milliy va klassik 200×300 gilam o'rniga `Gilam kulrang` oladi va gilam xona ichida (J 3 → 5).
  Shkaf hamon 9/9 da tushadi.
- **Balkon**: har uslubda `Jurnal stoli Mono` + bitta `ZZ Stul`, hech narsa tushmaydi (oldin 4/9 da kreslo
  tushardi). 5 ta torsherning 5 tasi ham mebel, eshik va devorlardan holi (oldin 4 tasida muammo bor edi).
  Lekin balkon mebeli endi har uslubda bir xil va uslubsiz (M 5). Balkonda parket, oboy va qandil hamon bor.

Guruh o'rtachalari:

| Guruh | #70 dan keyin | Endi |
|---|---|---|
| AI, 13 ta uslub so'rovi | 7.2 | **7.2** |
| AI, 5 ta uslubsiz so'rov | 7.4 | **7.0** |
| AI, hammasi (18) | 7.3 | **7.2** |
| Tayyor uslublar, 72 reja (8 xona o'rtachasi) | 6.5 | **6.6** |
| — oshxona + hammom (18) | 6.8 | **6.8** |
| — qolgan 6 xona (54) | 6.5 | **6.6** |

Ko'ndalang raqamlar (13 ta uslub so'rovi; qavsda 5 ta uslubsiz so'rov):

| Ko'rsatkich | #70 dan keyin | Endi |
|---|---|---|
| Model izohi ko'rsatildi (butun yoki jumla kesilib) | 13/13 (5/5) | **13/13 (5/5)** |
| Harness `kept` | 12/13 (3/5) | **12/13 (4/5)**: hitech inkor jumlasi (shinam yotoq 3 pol jumlasi) |
| Inglizcha jumla kesildi | loft, klassik (kabinet) | skandinav, minimalist, zamonaviy, klassik (3 tadan 2 tasi) |
| Ko'rsatilgan izohda inglizcha / hex | 2 so'z / 2 | **1 jumla** (klassik) / **3** (qorong'i) |
| Uslub da'vosi xatosi | 1/18 | **4/18**: milliy, minimalist, zamonaviy, qorong'i |
| Oltin devorda | 1/13 (klassik) | 1/13 (klassik) (0/5) |
| Qandil | 4/13 | 4/13: neoklassik, milliy, klassik, qorong'i (0/5) |
| Yotoq turidagi xonada karavot | 4/4 (1/1); tayyor 27/27 | 4/4 (1/1); tayyor 27/27; kvartira B 9/9 |
| Tashlab ketilgan buyum (AI) | 3 (5) | **1**: kichik Kiyim shkafi Nord (shinam mehmon Stul, oshxona 2 Velvet stul) |
| Tashlab ketilgan buyum (tayyor, 72) | — | 12: kichikda 9 shkaf, mehmonxona dark Kreslo Soft, oshxona 2×2 Velvet; balkonda 0 |
| Torsher: AI | 0/14 muammoli | **0/13** |
| Torsher: tayyor | 4/35 muammoli (balkon) | **0/35** (balkon 5/5 toza) |
| Eshikni to'sgan mebel yoki torsher | 0 | **0** (90 reja + 9 kvartira holati, o'z va qo'shni eshigi) |
| Xonadan chiqqan buyum | 2 (3×2.6 da 200×300 gilam) | **0** |
| Ustma-ust | faqat ataylab | faqat ataylab: stul stol ostida, ovqat stullari stol atrofida |

2 xonali kvartira (B = yotoqxona, `applyToOtherRooms`):

| Manba → B | Eshik 0.2 | Eshik 0.5 | Eshik 0.8 |
|---|---|---|---|
| AI klassik | Saroy + Tumbochka + Fors; **shkaf tushdi** | xuddi shunday, shkaf tushdi | xuddi shunday, shkaf tushdi |
| Tayyor milliy | Verona 160 + Tumbochka + Grafit shkaf + Buxoro | **shkaf tushdi** | to'liq |
| Tayyor loft | Verona 160 + Tumbochka + Grafit shkaf + kulrang gilam | **shkaf tushdi** | to'liq |

- B ning layout'ida qo'shni eshik bor (D devorida 1 ta element), 9/9 da qo'shni eshik zonasi va o'z eshigi
  (C) bo'sh, torsher ham. Xonadan chiqqan va ustma-ust buyum yo'q. PATCH dagi joylashuv `designRoomState`
  bilan bir xil.
- B o'z to'plamini oladi: 9/9 da karavot, tumbochka, gilam va yotoqxona shkafi. Mehmonxona mebeli yo'q.
  AI manbasida uslub `klassik` (oltin aksentli damask), tayyorlarda o'z uslubi. Izoh — uslubning yotoqxona
  izohi, tushgan buyumni aytmaydi.
- Shkaf 5/9 da tushadi. Klassik'da `Karavot Saroy` 210×180 sabab: qo'shni eshiksiz ham tushadi. Milliy va
  loft'da eshik 0.5 da bo'lsa, shkafni qo'shni eshik zonasi oladi. Tasdiqlash ro'yxati (`previewOtherRooms`)
  rejadagi mebelni, shkafni ham, ko'rsatadi. Natijada esa faqat xonalar soni chiqadi, shuning uchun foydalanuvchi
  shkaf qo'yilmaganini bilmaydi.
- A (ikki eshikli 4×3.5 mehmonxona) da 9 holatning 8 tasida kreslo yoki TV tumba tushdi va ro'yxatda aytildi.

### Kutilganlar tekshiruvi

| Kutilgan | Natija | Izoh |
|---|---|---|
| Kamida 10/13 izoh saqlanadi | **O'tdi: 13/13** | Harness `kept` 12/13. Hitech'da faqat "Torsher mavjud emas" inkor jumlasi kesildi. |
| Saqlangan izohda inglizcha / xom identifikator / hex yo'q | **O'tmadi** | Klassik'da bitta inglizcha jumla, qorong'i'da 3 ta hex. Xom id yo'q (`herringbone`/`wood_strip` tarjima qilinadi). `ZZ ...` katalog nomi. |
| Ko'rsatilgan izoh tushgan buyumni aytmaydi | **O'tmadi** (1/18) | Shinam mehmonxona: `ZZ Stul` tushdi, izoh "oddiy stul joy olgan" deydi (`dining_chair` uchun rol so'zi yo'q). Kichik xona: shkaf jumlasi olib tashlandi. Tayyor va kvartira: 0. |
| Tur/uslub da'vosi noto'g'ri emas | **O'tmadi** (4/18) | Milliy Oxford'ni "milliy", minimalist 3 ta skandinav buyumni "minimalist", zamonaviy Mono'ni "zamonaviy", qorong'i "klassik ZZ Stul" deydi. Tur xatosi 0. |
| Har yotoqxona rejasida karavot | **O'tdi** | AI 5/5, tayyor 27/27, kvartira B 9/9. |
| Kiyim shkafi joylanadi yoki aytiladi | **O'tdi** (bitta xona uchun) | 4×3.5: AI 3/3, tayyor 9/9 joylandi. 3×2.6: AI va 9/9 tayyor shkafi `dropped` da. Kvartira B: 5/9 da tushdi, foydalanuvchiga aytilmaydi (yuqorida). |
| Oltin faqat so'ralganda | **O'tdi** | Faqat klassik `#c9a24b` (va klassik tayyor). |
| Loft poli beton | **O'tdi** | `concrete`, `#4a4a4a` + `#a0522d`. |
| Hi-tech'da qandil yo'q | **O'tdi** | `led_panel`, `led_track`, `spotlight`. |
| Qorong'i `dark` tayyor uslubidan | **O'tdi** | `style: dark`, `#2c2c2c`/`#1a1a1a`, `border`, parket `#3d2b1f`, qandil + torsher + LED chiziq. |
| Torsher mebel va eshikdan holi, xona ichida, balkon ham | **O'tdi** | AI 13/13, tayyor 35/35 (balkon 5/5), kvartira 0 muammo. Hech bir torsher tushmadi (`droppedLights` bo'sh). |
| Eshik to'silmaydi, o'zi yoki qo'shnisiniki | **O'tdi** | 90 rejada 0. Kvartira 9/9: qo'shni eshik zonasi va o'z eshigi bo'sh. |
| Tayyor karavot xonaga mos | **O'tdi** | 4×3.5: Verona 160, Grafit 180, Nord 160, Saroy. 3×2.6: 9/9 Bir kishilik. Bolalar: 9/9 Bolalar karavoti. |
| Har xona turi o'z to'plamini oladi | **O'tdi** | Oshxona 9/9: stol + stullar + shkaf + plitka. Kabinet 9/9: stol + ish stuli + kreslo + javon/shkaf. Hammom 9/9: Hammom shkafi. Balkon 9/9: stol + bitta o'rindiq, hech narsa tushmaydi. |
| Uslubsiz so'rov shablondan (aksentsiz) | **O'tdi** | 5/5 da aksent yo'q. Shinam mehmon `#c9c5be`, iliq `#e6c9a8`, yotoq `#ece8e1`, kabinet `#e6eaef`, oshxona oq + plitka. |
| Kabinet AI rejasida yozuv stoli | **O'tdi** | Yozuv stoli Nord + Ish stuli (stol ostida) + Kitob javoni + Kreslo Bergen + gilam. |
| Hammom tayyorida oboy, qandil va torsher yo'q | **O'tdi** | 9/9 bo'yoq, qandil/osma/torsher 0. |
| Oshxona va hammom izohida plitka | **O'tdi** | 18/18 "Pol: namlikka chidamli kafel." |
| Xonadan chiqqan gilam yo'q | **O'tdi** | 0/90 (oldin 2). Almashtirish kerak bo'lmadi: `presetPlan` sig'adiganini tanladi. |
| YANGI: kvartira — B o'z to'plamini oladi, qo'shni eshik bo'sh | **O'tdi** | 9/9 yotoqxona to'plami, 9/9 qo'shni eshik bo'sh, izoh toza. Kamchilik: shkaf 5/9 da hech narsa demasdan tushadi. |

### Qolgan kamchiliklar (foydalanuvchiga ta'siri bo'yicha)

1. **"Barcha xonalarga qo'llash" tushgan mebelni aytmaydi**: kvartira B da shkaf 5/9 holatda qo'yilmaydi.
   Klassik'da sabab Saroy 210×180, qolganlarida qo'shni eshik zonasi. Tasdiqlash ro'yxati shkafni va'da qiladi,
   natija esa faqat xonalar sonini aytadi. `designRoomState` ning `applied.dropped` i `applyToOtherRooms` dan
   chiqmaydi. Ikki eshikli A da ham 8/9 holatda kreslo/tumba tushadi (bu ochiq xonada aytiladi).
2. **AI izohidagi uslub da'volari yomonlashdi** (1/18 → 4/18): uslubli ro'yxat oldidagi bitta sifat ("milliy
   uslubdagi A, B, C") hamma buyumga yoyiladi va backend tekshiruvi buni ushlamaydi. Bunga AI'ning mebelni
   aralashtirishi qo'shiladi: minimalist'da 3 ta skandinav buyum, hitech'da loft kreslo va stellaj. Hitech va
   minimalist mehmonxonada plitka pol.
3. **Izohda texnik qoldiqlar**: klassik'da inglizcha jumla qoladi, chunki unda 3 tadan kam belgi so'z bor.
   Qorong'i'da 3 ta hex. `ZZ` katalog prefikslari (qorong'i, iliq, shinam mehmon). "parquetdan", "to'p lampasi",
   "bezak uchun muzlatgich".
4. **Tushgan stul izohda qoladi**: `dining_chair`/`desk_chair` uchun `ROLE_WORD` da "stul" yo'q. Shinam
   mehmonxonada AI `ZZ Stul` ni stolsiz `dining_chair` qilib tanlaydi, u tushadi, izoh esa uni aytadi.
5. **Kichik xona (3×2.6)**: shkaf AI'da ham, 9/9 tayyorda ham sig'maydi. AI'ning sifatli mebel jumlasi butunlay
   o'chadi, izohda mebel qolmaydi. O'rtacha 5.8, eng past.
6. **Balkon**: endi toza va to'liq (6.1), lekin har uslubda bir xil `Mono + Stul`. Uslub faqat devor va polda
   qoladi, balkonda esa parket, oboy va qandil bor, izoh ham shularni aytadi.
7. Kichik: "Zamonaviy, iliq" hamon kulrang. Oshxona tayyorlarida oboy, qandil, torsher. AI oshxonasida torsher
   va "bezak" muzlatgich. Kabinet laminati kulrang-ko'k (`#d4d9dc`). Backend inkor jumlasini ("Torsher mavjud
   emas") da'vo deb kesadi, #71 ning frontend qoidasiga zid, ammo zararsiz.

### Tozalash

Harness ZZ mebel, `evaltest_` foydalanuvchi va `ZZ apt` kvartirani o'chirdi (tekshiruvda 0/0/0). Konteynerdagi
`/tmp/eval77_*.json` va vaqtinchalik vitest (`zzEvalTmp.test.ts`) o'chirildi. Harness o'zgartirilmadi.
