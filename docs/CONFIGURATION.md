# Sozlamalar (muhit o'zgaruvchilari)

Backend barcha sozlamalarni `backend/app/config.py` dagi `Settings` dan oladi:
avval muhit o'zgaruvchilari, keyin `backend/.env`. Namuna: `backend/.env.example`.
Yangi sozlama qo'shganda uni **uchala joyga** yozing: `config.py` (izoh bilan),
`.env.example` va shu jadval.

Productionda `.env` serverda turadi (`/opt/andoza_ai/backend/.env`) va repoga
kirmaydi. Kalitlarni hech qachon commit qilmang.

## Asosiy
| O'zgaruvchi | Standart | Vazifasi |
|---|---|---|
| `DATABASE_URL` | — (majburiy) | PostgreSQL. `postgresql://` avtomatik `postgresql+asyncpg://` ga aylantiriladi. |
| `REDIS_URL` | `redis://localhost:6379/0` | Kesh, limitlar, Celery broker va natijalar. |
| `SECRET_KEY` | — (majburiy) | JWT imzosi. |
| `ALGORITHM` | `HS256` | JWT algoritmi. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Kirish tokeni muddati. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Yangilash tokeni muddati. |
| `ENVIRONMENT` | `development` | Muhit nomi (productionda ham hozir `development`). |
| `API_DOCS_ENABLED` | `true` | `/docs`, `/redoc`, `/openapi.json`. Ochiq serverda `false` qiling. |
| `CORS_ORIGINS_STR` | localhost portlari | Ruxsat etilgan originlar: vergul bilan yoki JSON ro'yxat. Capacitor originlari (`capacitor://localhost`, `http://localhost`) har doim qo'shiladi. |
| `TRUST_PROXY_HEADERS` | `false` | `X-Forwarded-For` ga ishonish (OTP limitlari uchun mijoz IP'si). |
| `GOOGLE_CLIENT_IDS` | prod web + iOS client ID'lari | "Google orqali kirish": qabul qilinadigan ID token `aud` qiymatlari (vergul bilan). Bo'sh = o'chiq (503). |
| `APPLE_CLIENT_IDS` | `com.tamiruy.tamirUyMobileFlutter` | "Apple orqali kirish": qabul qilinadigan identity token `aud` qiymatlari, ya'ni iOS bundle id (vergul bilan). Bundle id o'zgarsa env orqali yangilang. Bo'sh = o'chiq (503). |
| `SENTRY_DSN` | bo'sh | Xatolarni Sentry'ga yuborish. |

## Fayllar
| O'zgaruvchi | Standart | Vazifasi |
|---|---|---|
| `MEDIA_ROOT` | `/app/media` | S3 sozlanmagan bo'lsa fayllar shu yerga yoziladi (volume'da bo'lishi shart). |
| `MEDIA_URL_PREFIX` | `/media` | Lokal fayllarning URL prefiksi. |
| `PUBLIC_BASE_URL` | bo'sh | Bo'sh bo'lsa media URL'lari so'rovdan quriladi. To'ldirilsa, aynan shu origin ishlatiladi. |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT_URL` | — | S3 yoki MinIO. Kalitlar bo'sh yoki `your-...` bo'lsa lokal disk ishlatiladi. |

## SMS (telefon orqali kirish)
| O'zgaruvchi | Standart | Vazifasi |
|---|---|---|
| `SMS_PROVIDER` | `eskiz` | `eskiz` yoki `playmobile`. |
| `SMS_SENDER_ID` | `AndozaAI` | Jo'natuvchi nomi. |
| `ESKIZ_EMAIL`, `ESKIZ_PASSWORD` | bo'sh | Eskiz hisobi. |
| `PLAYMOBILE_URL`, `PLAYMOBILE_LOGIN`, `PLAYMOBILE_PASSWORD` | — | Playmobile hisobi. |
| `OTP_GLOBAL_DAILY_LIMIT` | `2000` | Kuniga jami OTP SMS chegarasi. |

## AI va tashqi xizmatlar
| O'zgaruvchi | Standart | Vazifasi |
|---|---|---|
| `AI_FEATURES_ENABLED` | `false` | AI dizayner, smeta yordamchisi va boshqa LLM funksiyalari. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | bo'sh | OpenAI yoki OpenAI-mos provayder (masalan Gemini). |
| `AI_MODEL_BUILDER`, `AI_MODEL_EXPLAINER` | `gpt-4-turbo`, `gpt-4-mini` | Qaysi model qaysi vazifaga. |
| `MARKET_PRICES_ENABLED` | `false` | Gemini + Google Search bilan bozor narxlari. Pullik Gemini kaliti kerak. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | — | Bozor narxlari uchun. |
| `MARKET_PRICES_DAILY_LIMIT` | `10` | Foydalanuvchi kuniga necha marta narxlarni yangilay oladi. |
| `MARKET_PRICE_CACHE_DAYS` | `5` | Topilgan narx necha kun qayta ishlatiladi. |
| `MARKET_PRICE_MAX_LINES` | `15` | Bitta yangilashda ko'pi bilan nechta qator qidiriladi. |
| `MARKET_PRICE_MAX_DEVIATION` | `3.0` | Katalog narxidan necha marta farq qilsa, topilgan narx rad etiladi. |
| `TRIPO_API_KEY`, `TRIPO_API_URL`, `TRIPO_MODEL`, `TRIPO_FACE_LIMIT` | — | Rasmdan 3D model (Tripo). |
| `MODEL_FROM_PHOTO_DAILY_LIMIT` | `10` | Foydalanuvchiga kuniga nechta model (`0` — o'chiq). |
| `MYARCHITECT_API_KEY`, `MYARCHITECT_API_URL` | — | Fotorealistik render (MyArchitectAI). |
| `RENDER_DAILY_LIMIT` | `30` | Foydalanuvchiga kuniga nechta render (`0` — o'chiq). |
| `IMAGE_DESIGN_DAILY_LIMIT` | `10` | Foydalanuvchiga kuniga nechta "rasmdan AI dizayn" (har biri pullik vision chaqiruvi). Rasm 10 MB gacha. Hostdagi nginx'da `client_max_body_size` kamida `12m` bo'lishi kerak: undan katta so'rovlarni chekkada to'xtatadi, kichikroq qiymat esa haqiqiy rasmlarni ham rad etadi. |

## Frontend
| O'zgaruvchi | Vazifasi |
|---|---|
| `VITE_API_URL` | API manzili, **build vaqtida** kodga yoziladi. Productionda ochiq HTTPS manzil bo'lishi shart. Qarang: [WEB_PROD_DEPLOY.md](WEB_PROD_DEPLOY.md). |

## Docker compose (production)
| O'zgaruvchi | Vazifasi |
|---|---|
| `FORWARDED_ALLOW_IPS` | uvicorn qaysi proxy IP'larining `X-Forwarded-*` sarlavhalariga ishonadi (standart `172.16.0.0/12`). |
