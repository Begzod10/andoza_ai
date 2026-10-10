# 3D modellarni serverda siqish (GLB optimizatsiya)

Sana: 2026-10-10. Holat: tasdiqlash uchun.

## Maqsad
Studiyada mebel qo'yilganda yuklanish va qotish vaqtini qisqartirish. Ko'rinish sifati o'zgarmasligi kerak.

**Muvaffaqiyat mezoni:**
- har bir model siqilgan nusxa bilan beriladi;
- asl fayl doim saqlanib qoladi;
- studiyada ko'rinish o'zgarmaydi.

## Dalillar (2026-10-10 spike)
Productiondagi 5 ta eng og'ir model bir xil sahnada solishtirildi (`gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 2048 --simplify false`):

- **Ko'rinish:** asl bilan bir xil.
- **Birinchi kadr:** 2–6 baravar tez.
  - Karavot 1: 643 → 97 ms
  - Karavot 2: 542 → 112 ms
  - Rakovina: 1303 → 482 ms
- **Hajm:**
  - katalog modellari 5–18% kichraydi, chunki ular allaqachon kvantlangan;
  - foydalanuvchi modeli 61 MB dan 12 MB ga tushdi.

Uchburchaklarni kamaytirish (simplify) to'qilgan matolarda sifatni buzdi, shuning uchun **bu ishga kirmaydi**.

## Doira
**Kiradi:**
- do'kon katalogi modellari (`furniture.glb_key`): admin va sotuvchi yuklaydi;
- foydalanuvchi o'zi yuklagan modellar (`user_models.storage_key`).

**Kirmaydi:**
- skaner GLB'lari (`room_scan.glb_path`);
- rasmdan yasalgan modellarning oraliq fayllari;
- render;
- uchburchaklarni kamaytirish.

## Dizayn

### 1. Ma'lumotlar
Migratsiya `1786000033`, ikkala ustun ham nullable:
- `furniture.glb_opt_key` (string, nullable)
- `user_models.opt_key` (string, nullable)

Siqilgan fayl kaliti: asl kalit, faqat oxiridagi `.glb` o'rniga `.opt.glb`. Masalan `furniture/<uuid>.opt.glb`.

### 2. API
`glb_url` (catalog, admin, seller) va foydalanuvchi modelining `url` maydoni:
- siqilgan kalit bo'lsa, siqilgan faylni beradi;
- bo'lmasa, aslini beradi.

Javob shakli o'zgarmaydi, mijozlar (veb va mobil) hech narsani sezmaydi.

### 3. Siqish vazifasi
Celery vazifasi `optimize_glb(kind, id)`. `kind` qiymati `"furniture"` yoki `"user_model"`, navbat `converter` (allaqachon bor, `-c 2`).

Qadamlar:
1. Asl faylni `download_file` bilan o'qib, vaqtinchalik papkaga yozadi.
2. `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 2048 --simplify false` ni ishga tushiradi, vaqt chegarasi 300 s.
3. Natija faqat shu hollarda qabul qilinadi:
   - buyruq muvaffaqiyatli tugagan;
   - chiqish fayli bo'sh emas;
   - hajmi aslidan **kichik**.

   Aks holda hech narsa yozilmaydi va sabab logga tushadi.
4. `upload_file` bilan `.opt.glb` ni saqlaydi va ustunni yangilaydi.
5. Asl kalit tashqi URL (`http...`) bo'lsa, vazifa o'tkazib yuboriladi.

**Qachon chaqiriladi:**
- Admin model yuklaganda (`POST` admin_catalog `upload_furniture_model`).
- Sotuvchi model yuklaganda (`seller.upload_furniture`).
- Foydalanuvchi model yuklaganda (`user_models` `POST`). Bir xil fayl qayta yuklansa (sha256 bir xil), faqat metama'lumot yangilanadi, siqish qayta qilinmaydi.

Kodda modelning faylini almashtiradigan endpoint yo'q (`PATCH` faqat metama'lumotni tahrirlaydi), shuning uchun almashtirish holati yo'q.

Navbatga qo'yib bo'lmasa (broker o'chiq), yuklash baribir muvaffaqiyatli bo'ladi va asl fayl ishlatiladi.

**O'chirish:** siqilgan fayl asl fayl bilan birga o'chiriladi. Bu to'rt joyda bajariladi:
- admin model o'chirish;
- admin do'kon o'chirish (do'kon modellari bilan);
- sotuvchi model o'chirish;
- foydalanuvchi model o'chirish.

Asl faylni o'chirish mantig'i o'zgarmaydi.

### 4. Server imiji
`backend/Dockerfile` ga Node.js va `npm i -g @gltf-transform/cli@4.1.1` qo'shiladi:
- WebP uchun `sharp` linux-x64 glibc uchun tayyor binar bilan keladi;
- imij taxminan 150 MB kattalashadi;
- `api`, `worker` va `converter` bir imijdan foydalanadi.

### 5. Mavjud modellar uchun bir martalik buyruq
`python scripts/optimize_models.py [--dry-run] [--only furniture|user_models] [--limit N]`:
- **`--dry-run`:** nomzodlar soni va jami hajmini ko'rsatadi, hech narsa yozmaydi.
- **Asosiy rejim:** modellarni ketma-ket, navbatsiz qayta ishlaydi. Har biri uchun "oldin → keyin" hajmini chiqaradi, oxirida umumiy natijani beradi.
- Siqilgan nusxasi allaqachon bor modellar o'tkazib yuboriladi, shuning uchun buyruqni qayta ishga tushirish xavfsiz.
- Productionda faqat foydalanuvchi ruxsati bilan ishga tushiriladi.

### 6. Frontend
- `useGLTF` (drei 9.122) meshopt dekoderini allaqachon o'zi ulaydi. WebP'ni three.js `GLTFLoader` o'zi o'qiydi. Shuning uchun studiyada o'zgarish kerak emas.
- `lib/modelConverter.ts` dagi to'g'ridan-to'g'ri `GLTFLoader` (3 joy) ga `MeshoptDecoder` ulanadi, shunda foydalanuvchi allaqachon siqilgan fayl yuklasa ham ochiladi.

## Xatolarga chidamlilik va orqaga qaytarish
- Har qanday xatoda asl fayl ishlatiladi, foydalanuvchi buni sezmaydi.
- To'liq orqaga qaytarish: `update furniture set glb_opt_key=null; update user_models set opt_key=null;`. Asl fayllarga tegilmaydi.

## Testlar
**Backend:**
- vazifa: subprocess soxtalashtiriladi; muvaffaqiyat, kattaroq natija, xato va vaqt chegarasi holatlari;
- URL tanlash: siqilgan kalit bor yoki yo'q;
- yuklashda vazifa navbatga qo'yiladi;
- o'chirishda siqilgan fayl ham o'chadi;
- buyruqning `--dry-run` rejimi.

**Frontend:** `modelConverter` meshopt dekoderini ulaydi.

**Qo'lda:** productionda quruq ishga tushirish, keyin ruxsat bilan haqiqiy ishga tushirish, keyin studiyada 2–3 modelni ko'z bilan tekshirish.

## Ochiq xavflar
- **Server xotirasi:** 60 MB'lik modelni siqish taxminan 1 GB RAM talab qilishi mumkin. Shuning uchun bir martalik buyruq modellarni ketma-ket ishlaydi. Agar bu yetmasa, `converter` uchun `-c 1` qo'yiladi.
- **Brauzer qo'llab-quvvatlashi:** WebP teksturalarni hamma zamonaviy brauzerlar o'qiydi. Safari 14 dan eski versiyalar o'qimaydi.
