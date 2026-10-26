# AI dizaynni barcha xonalarga qo'llash

Sana: 2026-10-27. Holat: tasdiqlash uchun.

## Muammo
AI dizayn yoki tayyor uslub faqat ochiq turgan xonaga qo'llanadi. Bir nechta xonali uyda qolgan xonalar bo'yalmagan holda qoladi (studiyada qo'shni xona kulrang ko'rinadi). Har bir xonani alohida ochib, dizaynni qayta qo'llash kerak bo'ladi.

## Maqsad va muvaffaqiyat mezoni
- Joriy xonaga dizayn qo'llangandan keyin "Barcha xonalarga qo'llash" tugmasi bitta bosishda uyning qolgan xonalariga ham dizaynni qo'llaydi.
- Devor, shift, plintus, karniz va chiroq uslubi hamma xonada bir xil bo'ladi. Pol ham bir xil bo'ladi, lekin oshxona va hammomga kafel qo'yiladi.
- Mebel har bir xonaga uning turiga qarab, o'sha uslubda tanlanadi: yotoqxonaga karavot, oshxonaga ovqat stoli, kabinetga ish stoli va hokazo.
- Foydalanuvchining o'zi qo'ygan mebel va chiroqlari saqlanadi.
- Bitta "Qaytarish" bosilsa, hamma xonalar avvalgi holatiga qaytadi.
- Boshqa oynada (tab) ochiq xonada qilingan o'zgarish jimgina o'chib ketmaydi.

## Doira
**Kiradi:**
- `applyDesignPlan`ning toza (store'siz) versiyasi `designRoomState`;
- boshqa xona uchun reja tuzuvchi `planForRoom`;
- `PATCH /rooms/{id}` uchun `expected_updated_at` himoyasi (409);
- AI rejasiga tanlangan uslub id'si (`style`);
- AI oynasidagi tugma, tasdiqlash oynasi, natija xabari va bir nechta xonani qaytarish.

**Kirmaydi:**
- xonalarning kichik rasmlarini (thumbnail) yangilash;
- `surfaces`dagi narx bog'lanishlari (hozir joriy xonada ham yangilanmaydi);
- backend'da bitta tranzaksiyali "hammasi yoki hech narsa" endpoint;
- mobil Expo ilova.

## Dizayn

### 1. Hisoblash mijozda, saqlash har bir xona uchun alohida
Layout, katalog tanlash va `roomModel` frontend'da TypeScript'da yozilgan, ularni Python'ga ko'chirish (~1000 qator) shart emas. Shuning uchun:
1. `getRooms(aptId)` uyning barcha xonalarini `state` va `geometry` bilan qaytaradi; bu so'rov allaqachon `['apt-rooms', aptId]` keshida bor.
2. Har bir boshqa xona uchun `planForRoom` reja tuzadi, `designRoomState` esa yangi `state`ni hisoblaydi: `{...room.state, designState, furniture, lights}`. Xona hech ochilmagan bo'lsa (`state` null), `DEFAULT_DESIGN_STATE`dan boshlanadi.
3. `updateRoom(id, { state, expected_updated_at })` bilan hamma xonalar parallel saqlanadi (`Promise.allSettled`). Keyin `['apt-rooms', aptId]`, `['room', id]` va `['studio-nav-total', id]` kesh kalitlari bekor qilinadi.
4. Joriy xona avvalgidek store orqali o'zgaradi va o'z autosave'i bilan saqlanadi.

### 2. `designRoomState` — toza funksiya
`applyDesignPlan` (`frontend/src/lib/aiDesign.ts`) ikkiga ajratiladi:
- `designRoomState(prev, geometry, plan, parts, catalog, roomType) → { designState, furniture, lights, applied }`. Funksiya store'ga tegmaydi. U quyidagi qoidalarni bajaradi:
  - `setWallCovering('ALL')` butun `wallCoverings` xaritasini almashtiradi;
  - xona shift dizaynini saqlab qolsa, foydalanuvchining shift sozlamalari ham saqlanadi;
  - `fromDesign` belgili eski mebel va chiroqlar olib tashlanadi, foydalanuvchiniki qoladi.
- `applyDesignPlan` shu funksiyani chaqirib, natijani store'ga yozadigan yupqa qobiqqa aylanadi. Joriy xona uchun xatti-harakat o'zgarmaydi; buni mavjud testlar tasdiqlaydi.

### 3. `planForRoom(source, room)`
- **Tayyor uslub manbasi:** `presetPlan(id, catalog, room.type, room.wallIds, room.size)`. Xona turi bo'yicha to'plam, nam xonada kafel pol va hammom qoidalari shu funksiyaning o'zida bor.
- **AI reja manbasi:**
  - devor, pol, shift, plintus va karniz manba rejadan olinadi;
  - urg'u devori va devor yoki burchakdagi chiroqlar devor tartibi bo'yicha ko'chiriladi: manbadagi devor indeksi `i` bo'lsa, `B.wallIds[i % n]`. Bu `resolveWalls` qoidasi bilan bir xil. Ko'chirib bo'lmaydigan zonadagi chiroq markazga qo'yiladi;
  - mebel `presetPlan(style, catalog, room.type, …).furniture`dan olinadi. `style` AI rejadagi yangi `style` maydonidan olinadi. U bo'lmasa (rasmli so'rov va hokazo), rejadagi mebellar katalogda qaysi uslubda ko'proq bo'lsa, o'sha uslub tanlanadi. Hech biri aniqlanmasa, xona turining standart shabloni olinadi;
  - xona qoidalari qo'llanadi:
    - oshxona va hammomda pol kafel;
    - quruq xonaga kafel pol ko'chsa, u laminatga almashtiriladi;
    - hammomda oboy bo'yoqqa almashadi, qandil va torsher qo'yilmaydi. Buning uchun `bathroomWalls` va `bathroomLights` eksport qilinadi.
- **Xona turi:** `effectiveRoomType(room.room_type, room.name)`. Tur ham, nomdan taxmin ham bo'lmasa, mehmonxona deb olinadi.

### 4. Backend
- **`PATCH /rooms/{id}`:** ixtiyoriy `expected_updated_at` maydoni qo'shiladi. Agar u xonaning hozirgi `updated_at` qiymatiga teng bo'lmasa, server 409 qaytaradi va hech narsa yozmaydi. Maydon berilmasa, xatti-harakat hozirgidek qoladi, ya'ni autosave buzilmaydi.
- **`DesignPlan`:** `style: str | None` maydoni qo'shiladi. Bu reja qaysi tayyor uslubdan boshlangani, ya'ni `starting_preset` id'si. Standart shablondan boshlangan bo'lsa ham shu id yoziladi. Hech qanday shablon ishlatilmagan bo'lsa (masalan rasmli so'rov), `None`.

### 5. UI (`AiBuilderSheet.tsx`)
- Dizayn qo'llangandan keyin pastki panelda "Barcha xonalarga qo'llash" tugmasi chiqadi. U faqat uyda kamida 2 ta xona bo'lsa ko'rinadi.
- Tugma bosilganda tasdiqlash oynasi ochiladi. Unda boshqa xonalar ro'yxati, har birining turi va har biriga nima qo'yilishi qisqa ko'rsatiladi, masalan "Yotoqxona: karavot, tumbochka, shkaf". Tur taxmin qilingan xonalar "(taxmin)" belgisi bilan chiqadi. Asosiy tugma: "Qo'llash".
- **Natija xabari:** "4 ta xonaga qo'llandi". Ba'zi xonalar o'tkazib yuborilgan bo'lsa, ular nomi va sababi bilan sanaladi: "boshqa oynada o'zgartirilgan" (409) yoki "saqlab bo'lmadi".
- **Qaytarish:** sessiya davomida `{roomId → oldingi state, yozilgandan keyingi updated_at}` saqlanadi. "Qaytarish" bosilsa:
  - joriy xona avvalgidek snapshot'dan tiklanadi;
  - boshqa xonalar oldingi `state`ga `expected_updated_at` bilan PATCH qilinadi. Bu orada o'zgargan xona qaytarilmaydi va bu haqda xabar chiqadi.
- **Matnlar:** barcha yangi matnlar `ai.*` kalitlarida, o'zbek, rus va ingliz tillarida, ko'plik shakllari bilan.

## Xatolar va chekka holatlar
- **Bitta xonali uy:** tugma ko'rinmaydi.
- **Hech ochilmagan xona:** standart holatdan boshlanadi. Geometriya API'dan keladi.
- **Kam devorli xona (3 ta yoki undan kam):** devorlar tartib bo'yicha aylanib moslanadi. Urg'u devori boshqa devorga tushishi mumkin; bu qabul qilinadi.
- **Katalogda shu xona turiga mebel yo'q:** xona devor, pol va chiroq bilan qoladi, mebel qo'shilmaydi. Tasdiqlash oynasida "mebel topilmadi" deb yoziladi.
- **Tarmoq xatosi:** saqlangan xonalar saqlangan holida qoladi, qolganlari xabarda ko'rsatiladi. Qaytarish faqat saqlanganlarga qo'llanadi.
- **Boshqa oynada ochiq xona:** PATCH 409 qaytaradi, xona o'tkazib yuboriladi va xabar chiqadi.
- **Qarama-qarshi ishtirok:** ochiq turgan boshqa oyna o'z store'idan keyinroq saqlasa (u `expected_updated_at` yubormaydi), bizning natijamiz ustidan yoziladi. Bu hozirgi last-write-wins xatti-harakati. Autosave'ga versiya qo'shish bu spec doirasiga kirmaydi.

## Test
**Backend:**
- PATCH `expected_updated_at` mos kelsa yozadi, mos kelmasa 409 qaytarib hech narsa yozmaydi, berilmasa hozirgidek ishlaydi.
- `DesignPlan.style` nomlangan uslub, standart shablon va rasm holatlarida to'g'ri to'ldiriladi.

**Frontend:**
- `designRoomState` va `applyDesignPlan` joriy xona uchun mavjud testlarning hammasidan o'tadi.
- `designRoomState` foydalanuvchi mebelini saqlaydi.
- `planForRoom`:
  - tayyor uslub turli xona turlarida o'z to'plamini beradi;
  - AI reja uchun urg'u devori va chiroq zonalari to'g'ri ko'chadi;
  - hammom va oshxona qoidalari qo'llanadi;
  - `style` yo'q bo'lsa, mebel uslubi to'g'ri aniqlanadi.
- AI oynasi:
  - tugma faqat 2 tadan ko'p xonada ko'rinadi;
  - tasdiqlash ro'yxati to'g'ri;
  - har bir xona to'g'ri `state` bilan PATCH qilinadi;
  - 409 qaytgan xona o'tkazib yuborilib, xabarda ko'rsatiladi;
  - "Qaytarish" oldingi `state`larni tiklaydi va o'zgargan xonani o'tkazib yuboradi.
