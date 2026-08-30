# AndozaAI

AI-powered home renovation and room design platform for Uzbekistan.

## Quick Start

```bash
# 1. Copy env files (defaults work with docker-compose out of the box)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Start all services (the api container runs migrations automatically)
docker-compose up -d

# 3. Seed data
docker-compose exec api python app/seeds.py

# 4. Open app
open http://localhost:5173
```

## Architecture

- Frontend: React 18 + Vite PWA + Three.js + Zustand -> localhost:5173
- Backend: FastAPI + PostgreSQL + Redis + Celery -> localhost:8000
- API docs: http://localhost:8000/docs

## Shipped

- Measurement wizard (60-second room input)
- 3D "Ichkarida" studio (React Three Fiber) — walls/floor/ceiling finishes,
  oboy (wallpaper) and paint, wall panels, furniture placement, lighting,
  electrical points, sibling-room floor-plan view
- Do'kon: admin-managed catalog of shops, 3D furniture models, and oboy —
  surfaced live inside the studio's furniture picker
- Smeta engine (deterministic room-cost calculation) with live USD/UZS
  conversion, PDF export, and an AI-assisted Q&A drawer over the estimate
- Ustalar directory with lead generation
- Phone OTP + password authentication

## Next

- Photo mode (SAM 2 segmentation) and AI dizayner recommendations
- Walk-through camera controls
- Real payment flow on the customer-facing marketplace (currently a stub)

## Project layout

```
backend/   FastAPI + SQLAlchemy (async) + Alembic + Celery/Redis
frontend/  React 18 + Vite + TypeScript + R3F (3D) + Zustand + TanStack Query
```

Routers/services/schemas/models are separated in `backend/app/`; the frontend
groups by feature under `frontend/src/{pages,components,features,lib,store}`.
See `.github/workflows/` for CI (`ci.yml`) and the auto-deploy pipeline
(`deploy.yml`) — every push to `master` is tested, then deployed.
