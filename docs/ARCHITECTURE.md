# andoza.ai arxitekturasi

O'zbekiston uchun uy ta'miri va xona dizayni platformasi: o'lchash, 3D studiya,
smeta (xarajat hisobi), do'konlar katalogi va buyurtmalar, ustalar, AI yordamchilar.

Tegishli hujjatlar:
- [DATA_MODEL.md](DATA_MODEL.md) — ma'lumotlar bazasi jadvallari.
- [CONFIGURATION.md](CONFIGURATION.md) — muhit o'zgaruvchilari (`.env`).
- [INTEGRATIONS.md](INTEGRATIONS.md) — tashqi xizmatlar va yangi integratsiya qo'shish.
- [WEB_PROD_DEPLOY.md](WEB_PROD_DEPLOY.md) — productionga chiqarish va nginx.

## Umumiy ko'rinish

```
Brauzer / iOS ilova (Capacitor WebView)
          │ https://andoza.jumaniyozov.uz
          ▼
   nginx (VPS, :443) ──── /        → frontend konteyneri (statik React build, :5173)
                     ├─── /api/    → api konteyneri (FastAPI, :8000)
                     └─── /media/  → api konteyneri (yuklangan fayllar)

 api ──────┬── PostgreSQL 16 (asosiy ma'lumotlar)
           ├── Redis 7 (kesh, limitlar, Celery broker)
           └── media_data volume (/app/media: GLB, rasm, skaner fayllari)

 worker    ── Celery, navbatlar: default, media (-c 4)
 converter ── Celery, navbat: converter (-c 2) — skaner GLB'lari, model siqish
 beat      ── Celery beat (hozircha jadval bo'sh)
```

Hamma backend konteynerlari (`api`, `worker`, `converter`, `beat`) bitta
`backend/Dockerfile` imijidan quriladi va `media_data` volume'ni bo'lishadi.
`api` ishga tushganda `alembic upgrade head` migratsiyalarni o'zi qo'llaydi.

## Backend (`backend/`)

FastAPI + SQLAlchemy 2 (async, asyncpg) + Alembic + Celery + Redis.

| Papka | Vazifasi |
|---|---|
| `app/main.py` | Ilovani yig'adi: CORS, routerlar (hammasi `/api/v1` ostida), `/media` statik fayllari. |
| `app/config.py` | Barcha sozlamalar (`Settings`, pydantic-settings). Qarang: [CONFIGURATION.md](CONFIGURATION.md). |
| `app/routers/` | HTTP endpoint'lar, mavzu bo'yicha bitta faylda. |
| `app/services/` | Biznes mantiq: smeta, AI dizayner, tashqi API klientlari, buyurtma holatlari. |
| `app/models/` | SQLAlchemy modellari. Qarang: [DATA_MODEL.md](DATA_MODEL.md). |
| `app/schemas/` | Pydantic so'rov/javob sxemalari. |
| `app/core/` | Umumiy vositalar: `storage.py` (S3 yoki lokal disk), `cache.py` (Redis), `security.py` (JWT, parol), `sms.py`. |
| `app/api/v1/deps.py` | Autentifikatsiya bog'liqliklari: `CurrentUser`, `require_admin`. |
| `app/tasks/media.py` | Celery vazifalari (skaner GLB, model siqish). Ro'yxatga olinadigan yagona vazifa moduli. |
| `celery_app.py` | Celery sozlamasi va navbatlar marshruti. |
| `alembic/versions/` | Migratsiyalar. Raqamlash: `17860000NN_<nom>.py`. |
| `scripts/` | Qo'lda ishga tushiriladigan skriptlar (masalan `optimize_models.py`, `eval_ai_design.py`). |
| `tests/` | pytest. Docker ichida: `docker compose exec -T api python -m pytest -q`. |

**Autentifikatsiya:** JWT `token` cookie'da (brauzer) yoki `Authorization: Bearer`
sarlavhasida (iOS ilova). Telefon OTP (Eskiz/Playmobile SMS) yoki parol bilan kirish.
Admin huquqi — `users.is_admin`, sotuvchi — `stores.owner_user_id`.

**Fayllar:** S3 kalitlari to'ldirilgan bo'lsa S3, aks holda `MEDIA_ROOT` (lokal
disk). Productionda lokal disk ishlatiladi. Faylning URL'i har doim
`absolute_media_url()` orqali quriladi.

**API hujjati:** `/docs` (Swagger), `/redoc`, `/openapi.json`. `API_DOCS_ENABLED=false`
bilan o'chiriladi.

## Frontend (`frontend/`)

React 18 + Vite (PWA) + TypeScript + React Three Fiber (3D) + Zustand + TanStack Query + Tailwind.

| Papka | Vazifasi |
|---|---|
| `src/pages/` | Sahifalar: `studio/` (3D studiya), `wizard/` (o'lchash), `dokon/` (do'kon), `seller/`, `smeta/`, `projects/` va boshqalar. |
| `src/components/` | Qayta ishlatiladigan UI. `ui/` — tema komponentlari (`Panel`, `Tile`, `Button`). |
| `src/features/studio/` | 3D sahna qismlari: mebel, devorlar, chiroqlar. |
| `src/lib/` | Mantiq va API klienti (`lib/api/*.ts` — har bir backend mavzusi uchun bitta fayl). |
| `src/store/` | Zustand store'lar. `roomStore.ts` — studiyadagi xona holati (slice'larga bo'lingan). |
| `src/locale/uz.ts` | Foydalanuvchiga ko'rinadigan matnlar. |

API manzili build vaqtida `VITE_API_URL` orqali beriladi. Testlar: `vitest` (`frontend/` papkasidan).

**iOS ilova:** `frontend/dist` Capacitor bilan o'raladi (`capacitor.config.ts`,
`ios/`). O'rnatilgan ilova o'z build'idagi kodni ishlatadi, shuning uchun veb
deploy uni yangilamaydi.

## Deploy

`master` ga har bir push:
1. **CI** (`.github/workflows/ci.yml`): backend va frontend testlari.
2. **Deploy** (`.github/workflows/deploy.yml`): SSH orqali serverda
   `deploy/remote-deploy.sh` — `git reset --hard origin/master`,
   `docker compose -f docker-compose.prod.yml up -d --build`, so'ng seed'lar.

Server: `/opt/andoza_ai`. Muhim cheklov: server protsessori virtual (`QEMU Virtual CPU`,
faqat SSE2), shuning uchun x86-64-v2 yoki SIMD talab qiladigan kutubxonalar
(masalan `sharp`) u yerda ishlamaydi.

## Ildizdagi eski fayllar

Ildizdagi `App.tsx`, `src/`, `app.json`, `babel.config.js` — 2026-yil iyulidagi
eski React Native ilovasidan qolgan, hozirgi mahsulotda ishlatilmaydi. O'sha
davrning hujjatlari [`docs/archive/mobile-app-2026-07/`](archive/mobile-app-2026-07/) da.
