# Ma'lumotlar modeli

PostgreSQL 16. Modellar: `backend/app/models/`, migratsiyalar: `backend/alembic/versions/`.
Barcha pul summalari **so'mda, butun son** (`*_uzs`). Dollar faqat ko'rsatishda,
`app/services/currency.py` kursi bilan hisoblanadi.

## Bog'lanishlar

```
users ─┬─< apartments ─< rooms ─┬─< estimates
       │                        ├─< room_finishes >── materials
       │                        ├─< room_furniture_placements >── furniture
       │                        ├─< room_decorations / room_electrical / electrical_devices / room_states
       │                        └─< leads >── ustalar
       ├─< orders ─< order_lines (material_id yoki furniture_id)
       ├─< user_models            (foydalanuvchining o'z 3D modellari)
       ├─< room_renders           (fotorealistik renderlar)
       ├── stores (owner_user_id) ─┬─< furniture
       │                           ├─< materials ─< material_offers
       │                           └─< wallpapers
       └── ustalar (owner_user_id) ─< usta_portfolio_items
```

## Asosiy jadvallar

### Foydalanuvchi va loyiha
| Jadval | Nima saqlaydi | Muhim ustunlar |
|---|---|---|
| `users` | Hisob | `phone`, `username`, `password_hash`, `google_sub`, `apple_sub` (Google/Apple orqali kirish, unique), `email` (faqat ko'rsatish uchun), `language`, `is_admin`, `is_active` |
| `apartments` | Kvartira (loyiha) | `user_id`, `name`, `address`, `renovation_stage` |
| `rooms` | Xona | `apartment_id`, `geometry` (JSON: devorlar, eshik/derazalar, ixtiyoriy `vertices`), `ceiling_h`, `state` (JSON: studiyadagi butun holat — dizayn, mebel, chiroqlar, `layoutPos`), `room_scan` (JSON: LiDAR skaner ma'lumoti), `floor_area`, `net_wall_area`, `perimeter`, `share_token`, `deleted` (yumshoq o'chirish) |
| `draft_rooms` | Wizard qoralamasi (egasi — `user_id`) | `state`, `user_id` |
| `estimates` | Saqlangan smeta | `room_id`, `lines` (JSON), `total_uzs`, `status` |

`rooms.state` studiyaning to'liq holati: API uni **butunlay almashtiradi**
(`room.state = body.state`). Shuning uchun bitta kalitni yozganda ham butun
holatni yuborish kerak.

### Katalog va do'konlar
| Jadval | Nima saqlaydi | Muhim ustunlar |
|---|---|---|
| `stores` | Do'kon | `name`, `owner_user_id` (sotuvchi), `status` (moderatsiya: pending/approved/rejected), `is_active`, `partner_tier` |
| `materials` | Material (bo'yoq, plitka, parket…) | `store_id`, `category`, `unit`, `price_uzs`, `smeta_key` (smeta qatoriga bog'lash), `is_active` |
| `material_offers` | Bir materialning boshqa do'kondagi narxi | `material_id`, `store_id`, `price_uzs`, `in_stock`, `delivery_days` |
| `furniture` | 3D mebel modeli | `store_id`, `category`, `room_type`, `placement` (pol/devor/shift), `price_uzs`, `glb_key`, `glb_opt_key` (siqilgan nusxa), `footprint_w/d`, `height_cm` (sm), `status` |
| `wallpapers` | Oboy | `store_id`, `price_uzs`, o'lchamlari, `storage_key` |
| `user_models` | Foydalanuvchi yuklagan model | `user_id`, `storage_key`, `opt_key`, `sha256` (bir xil faylni qayta yuklashni aniqlash) |

Smeta narxni `materials.price_uzs` dan oladi (`services/estimate_catalog.py`:
`smeta_key` bo'yicha eng arzon faol material). `material_offers` hozircha faqat
narxlarni solishtirish endpoint'ida ishlatiladi, smetaga ta'sir qilmaydi.

### Buyurtmalar
| Jadval | Nima saqlaydi | Muhim ustunlar |
|---|---|---|
| `orders` | Buyurtma (har do'konga alohida) | `user_id`, `store_id`, `total_uzs`, `status` (accepted → gathering → on_the_way → delivered, yoki cancelled), `cancelled_by`, `cancel_reason`, `delivery_address`, `phone`, `payment_method` (matn) |
| `order_lines` | Buyurtma qatori | `material_id` yoki `furniture_id`, `product_name`, `unit_price_uzs` (buyurtma paytidagi narx nusxasi), `quantity` |

Holat o'tishlari qoidalari: `services/order_status.py`. Narx doim katalogdan
olinadi, mijoz yuborgan narxga ishonilmaydi. To'lov yozuvlari hali yo'q.

### Ustalar
| Jadval | Nima saqlaydi |
|---|---|
| `ustalar` | Usta profili: kasb, tuman, narx oralig'i, reyting, `owner_user_id`, moderatsiya `status` |
| `usta_portfolio_items` | Usta ishlari rasmlari |
| `leads` | Mijozdan ustaga murojaat (smeta nusxasi bilan) |
| `shop_inquiries` | Mijozdan do'konga savol (mebel yoki xona haqida) |

### Studiya tafsilotlari
`room_finishes`, `room_furniture_placements`, `room_decorations`,
`room_electrical`, `electrical_devices`, `room_states`: xona sirtlari, mebel
joylashuvi, elektr nuqtalari va ta'mir bosqichi. Bir qismi eski API bilan qolgan.
Studiyaning asosiy manbai `rooms.state`.

### Boshqalar
| Jadval | Nima saqlaydi |
|---|---|
| `room_renders` | Render natijalari (MyArchitectAI) |
| `media_jobs` | Fon ishlari hisobi |
| `norms` | Smeta me'yorlari: sarf, qatlam, chiqindi foizi |
| `content_reports` | Foydalanuvchilarning kontentga shikoyatlari: `reporter_id`, `target_type` + `target_id` (FK emas), `reason`, `details`, `status` (`open`/`resolved`/`dismissed`). Bir foydalanuvchi bitta obyektga bitta shikoyat |

## Hozircha yo'q narsalar (integratsiya uchun kerak bo'ladi)

- Tashqi platforma identifikatori (`source`, `external_id`, `url`) va sinxron vaqti (`last_synced_at`).
- Mahsulot qoldig'i soni (faqat `material_offers.in_stock` bor, bu ha/yo'q).
- Do'kon uchun tashqi hisob kalitlari (shifrlangan).
- To'lov tranzaksiyalari jadvali.

Batafsil: [INTEGRATIONS.md](INTEGRATIONS.md).
