# Remont ishlari: 3D Studio va smetada hali YO'Q narsalar

Sana: 2026-10-05. Manba: kod inventarizatsiyasi (`backend/app/services/smeta.py`, `frontend/src/lib/*`, `frontend/src/pages/studio/*`, `backend/app/models/usta.py`). Mobil `e3_labor_costs` va `services/ai_builder.py` tekshirilmagan.

Belgilar: **[Studio]** 3D Studio'da modellanmagan · **[Smeta]** smetada narxlanmaydi · **[Usta]** tizimda shu kasb ustasi yo'q.

## 1. Qora ishlar (tayyorgarlik)

| Ish | Studio | Smeta | Izoh |
|---|---|---|---|
| Demontaj: eski qoplama, oboy, kafel, eshik/oyna yechish | yo'q | yo'q | Har remontning birinchi bosqichi. Fazalarda (`lib/phases.ts`) ham yo'q |
| Devor buzish / peregorodka (gipsokarton, g'isht) qurish | yo'q | yo'q | Devorlar faqat geometriya |
| Chiqindi olib chiqish | yo'q | yo'q | |
| Pol stяjkasi, tekislovchi qorishma | yo'q | yo'q | `sement` faqat do'kon kategoriyasi, dvigatel o'qimaydi |
| Gidroizolyatsiya (hammom, oshxona) | yo'q | yo'q | |
| Issiq pol | yo'q | yo'q | |
| Tagqatlam (underlay) | yo'q | yo'q | |
| Issiqlik/shovqin izolyatsiyasi | yo'q | yo'q | |

## 2. Pol

| Ish | Studio | Smeta |
|---|---|---|
| Linoleum, kovrolin, vinil | yo'q | yo'q |
| Parket va laminat turlicha hisoblash | bor | bir xil formula (2,13 m² paket, 1,07 chiqit) |
| Pol plitkasi o'rnatish ishi (yelim, fuga) | plitka bor | faqat plitka m², yelim/fuga yo'q |

## 3. Devor

| Ish | Studio | Smeta |
|---|---|---|
| Dekorativ suvoq (beton effekti, "qopol") | bor | yo'q |
| Devor plitkasi (hammom, oshxona fartugi) | bor (tayyor rasm) | yo'q |
| Dekorativ panellar (`WallPanelGenerator`) | bor | yo'q |
| Gipsokarton bilan devorni tekislash | yo'q | yo'q |
| Ko'chma/yig'ma panel, 3D panel, yog'och qoplama | yo'q | yo'q |

## 4. Shift

| Ish | Studio | Smeta |
|---|---|---|
| Natyajnoy (cho'ziladigan) shift | yo'q | yo'q |
| Oddiy bo'yalgan shift (suvoq + bo'yoq) | yo'q | yo'q |
| Karniz (shift ostonasi) | bor (`trimProfiles`) | yo'q |
| Gipsokarton shift | 6 dizayn | taxminiy (`is_approximate`) |

## 5. Eshik va oyna

| Ish | Studio | Smeta |
|---|---|---|
| Eshik narxi | ~20 uslub, ko'rinish | yo'q (faqat kengligi plintusdan ayriladi) |
| Oyna narxi | ~20 uslub | yo'q |
| O'rnatish ishi | yo'q | yo'q |
| Otkos (deraza/eshik nishalari) | yo'q | yo'q |
| Deraza tokchasi, mosquitka, jalyuzi/parda | yo'q | yo'q |
| Balkon ishlari (shisha, izolyatsiya, pol) | faqat balkon eshigi | yo'q |

## 6. Santexnika (butunlay yo'q)

- Quvur tortish (suv, kanalizatsiya), tarqatuvchi kollektor
- Hammom: vanna/dush kabinasi, unitaz, rakovina, kran, suv isitgich
- Oshxona: moyka, aralashtirgich, idish yuvish mashinasi ulanishi
- Hisoblagichlar, filtrlar
- Studioda sanitar bosqich yo'q, smetada `santexnika` qatori yo'q. Faqat do'kon materiali va "santexnik" usta kasbi bor.

## 6b. Isitish va ventilyatsiya

- Radiator, qozon, quvur tarmog'i: yo'q
- Konditsioner: faqat elektr nuqtasi (2400 mm), o'rnatish va trassa narxi yo'q
- Ventilyatsiya, vityajka, havo kanali: yo'q

## 7. Elektr (qisman)

| Ish | Holat |
|---|---|
| Rozetka, vyklyuchatel, shit, TV/ethernet nuqtalari | studioda bor, **narxlanmaydi** (faqat kabel metri va yoritgichlar) |
| Kabel | bor, m bo'yicha |
| Avtomatlar, UZO, shit ichi | yo'q |
| Slabotochka (internet, domofon, signalizatsiya) | yo'q |
| Montaj ishi (shtroba, kabel yotqizish) | narxda yo'q |

## 8. Mehnat narxi (eng katta bo'shliq)

- Smeta **faqat material** hisoblaydi. Usta ishi (m² uchun mehnat haqi) hech qaerda narxlanmaydi.
- Bo'sh qolgan joy: bo'yash, oboy yopishtirish, plitka yotqizish, laminat, shift, shtroba, o'rnatish va h.k.
- Tekshirish kerak: mobil `lib/screens/estimation/e3_labor_costs` haqiqiy mantiqmi yoki namuna (tekshirilmadi).

## 9. Material/mebel

| Ish | Holat |
|---|---|
| Mebel narxi | faqat 2 ta ichki modelga haqiqiy narx, qolganiga 2 mln taxmin; foydalanuvchi modeli narxi bor |
| Yoritgich | 13 tur, qat'iy narxlar (haqiqiy do'kon narxi emas) |
| Oshxona mebeli, o'rnatma shkaf, sanuzel mebeli | yo'q (alohida konstruktor yo'q) |
| Mebel yig'ish/o'rnatish | yo'q |

## 10. Ustalar kasblari (tizimda `UstaCategory`)

**Bor:** elektrik, elektrik_loyihachi, santexnik, malyar, oboy, laminat, brigada.
(Seed ma'lumotida faqat elektrik, malyar, laminat, santexnik, brigada.)

**Yo'q (qo'shilishi kerak):**

| Kasb | Nima uchun kerak |
|---|---|
| Plitkachi | Studio plitkani modellaydi va narxlaydi, lekin usta topib bo'lmaydi |
| Shtukatur / shpaklyovkachi | Smeta suvoq/shpaklyovka qatorini hisoblaydi |
| Gipsokartonchi | Shift dizayni (6 tur) |
| Eshik-oyna ustasi | ~40 uslub, o'rnatish ustasi yo'q |
| Isitish / konditsioner ustasi | AC nuqtasi bor |
| Demontaj ustasi | Birinchi bosqich |
| Usta-universal / kapital remont brigadasi | `brigada` bor, lekin aniq emas |

## 11. Boshqa

- Texnik topshiriq/akt, ish bosqichlari jadvali, ish vaqti hisobi: yo'q
- Natijani usta bilan bog'lash (usta smetaga o'z narxini yozishi): yo'q (hozir faqat so'rov/lead)
- Xonadan tashqari: yo'laklar, kirish eshigi, umumiy hajm (butun kvartira smetasi) alohida hisoblanmaydi

## Ustuvor qadamlar (tavsiya)

1. **Yangi kasblar** (plitkachi, shtukatur, gipsokartonchi, eshik-oyna, isitish/konditsioner): backend enum + migratsiya + mobil/veb ro'yxat. Kichik ish.
2. **Mehnat qatorlari** smetaga (m² uchun usta narxi). Eng katta qiymat.
3. **Eshik/oyna** narxi va o'rnatish.
4. **Demontaj** qatori.
5. **Pol asosi** (stяjka, gidroizolyatsiya, tagqatlam).
6. **Santexnika va isitish**: yangi studio bosqichi talab qiladi (katta ish).
