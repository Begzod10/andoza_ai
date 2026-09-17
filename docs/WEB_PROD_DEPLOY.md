# Web frontend → production (HTTPS)

How the React/Vite web app (the do'kon + 3D studio) is served in production, how
to deploy changes, and how to point it at a different API/domain. Mirrors the
mobile guide in `docs/mobile/IOS_BUILD.md`.

## TL;DR

- Prod is one HTTPS origin — **`https://andoza.jumaniyozov.uz`** — fronted by the
  VPS's system **nginx**, which reverse-proxies to the Docker containers.
- Push to **`master`** → GitHub Actions **auto-deploys** (`.github/workflows/deploy.yml`)
  → SSH → `docker compose -f docker-compose.prod.yml up -d --build`.
- The frontend's API base is **baked at build time** via `VITE_API_URL`. It MUST be
  the public HTTPS URL so the served app calls the API **same-origin** (no
  mixed-content, no CORS).

---

## 1. Architecture

```
                          ┌──────────────────── VPS 189.74.96.11 ────────────────────┐
Browser / mobile WebView  │  nginx (:443, Let's Encrypt)                              │
  https://andoza.jumaniyozov.uz  ─────────────►  server_name andoza.jumaniyozov.uz    │
                          │     location /        → 127.0.0.1:5173  (frontend, Docker) │
                          │     location /api/    → 127.0.0.1:8000  (backend,  Docker) │
                          │     location /media/  → 127.0.0.1:8000  (media)            │
                          └──────────────────────────────────────────────────────────┘
```

- **DNS:** an `A` record `andoza` on `jumaniyozov.uz` (Vercel DNS) → `189.74.96.11`,
  i.e. `andoza.jumaniyozov.uz` resolves to the VPS.
- **Containers** (`docker-compose.prod.yml`): `frontend` publishes host `:5173`
  (nginx-in-container serving the built static app), `api` publishes `:8000`.
- Because everything is under one origin, the studio's `credentials:'include'`
  cookie auth and its `/auth/refresh` flow work with no cross-site cookie issues.

---

## 2. The one build-time knob: `VITE_API_URL`

Vite inlines `import.meta.env.VITE_API_URL` **at build time** (see
`frontend/src/lib/api.ts` `BASE_URL`). It is passed as a Docker **build arg** in
`docker-compose.prod.yml`:

```yaml
  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_URL: ${VITE_API_URL:-https://andoza.jumaniyozov.uz/api/v1}
```

- It **must** be the HTTPS API base. If it's ever set to a plain-`http://` URL (or
  a raw IP:port) while the app is served over HTTPS, the browser blocks the API
  calls as **mixed content** and the studio silently fails to load data.
- Changing it requires a **rebuild** (it's baked in) — editing it at runtime does
  nothing.

To override for a one-off build without editing the file:
```bash
VITE_API_URL=https://andoza.jumaniyozov.uz/api/v1 \
  docker compose -f docker-compose.prod.yml up -d --build frontend
```

---

## 3. Deploying a change

Normal path — just push to `master`:

```bash
git push origin master
```

GitHub Actions `deploy.yml` SSHes into the VPS and runs
`docker compose -f docker-compose.prod.yml up -d --build`, which rebuilds the
frontend image (picking up `VITE_API_URL`) and the backend, then restarts them.
Media survives via the named `media_data` volume.

> ⚠️ Any push to `master` deploys prod. Review before merging.

Manual redeploy on the VPS (if needed):
```bash
ssh root@189.74.96.11
cd /opt/andoza_ai
docker compose -f docker-compose.prod.yml up -d --build frontend
```

---

## 4. nginx + HTTPS (one-time VPS setup)

Already done for `andoza.jumaniyozov.uz`; documented here to reproduce for a new
host/domain. nginx + certbot are installed on the VPS.

`/etc/nginx/sites-available/andoza.jumaniyozov.uz` (symlinked into `sites-enabled/`):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name andoza.jumaniyozov.uz;

    # USDZ/GLB/model uploads (API caps at 50 MB) — headroom over nginx default 1M.
    client_max_body_size 60M;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /media/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable + provision the cert (certbot rewrites the block to add `:443` + the cert
paths + an HTTP→HTTPS redirect, and installs an auto-renew timer):

```bash
ln -s /etc/nginx/sites-available/andoza.jumaniyozov.uz /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d andoza.jumaniyozov.uz --agree-tos -m you@example.com --redirect
```

---

## 5. Pointing prod at a different domain / API

1. **DNS:** add an `A` record for the new subdomain → the VPS IP.
2. **nginx:** copy the server block, change `server_name`, `ln -s`, `nginx -t &&
   systemctl reload nginx`, then `certbot --nginx -d <new-domain> --redirect`.
3. **Frontend:** set `VITE_API_URL` default in `docker-compose.prod.yml` to
   `https://<new-domain>/api/v1`, commit, push (rebuilds).
4. **Mobile:** update the prod URLs to match — Android `.github/workflows/release.yml`
   `--dart-define`s and the iOS GitHub secrets `API_URL_PROD` /
   `API_BASE_URL_PROD` / `STUDIO_BASE_URL_PROD` (see `docs/mobile/IOS_BUILD.md`).

---

## 6. Verify

```bash
# API over HTTPS (add --resolve if DNS hasn't propagated to your machine yet)
curl -s -o /dev/null -w "%{http_code}\n" https://andoza.jumaniyozov.uz/api/v1/furniture   # 200
# HTTP redirects to HTTPS
curl -s -o /dev/null -w "%{redirect_url}\n" http://andoza.jumaniyozov.uz/                  # https://…
# The built bundle points at the HTTPS API (not a raw http IP)
JS=$(curl -s https://andoza.jumaniyozov.uz/ | grep -oE '/assets/index-[^"]+\.js' | head -1)
curl -s "https://andoza.jumaniyozov.uz$JS" | grep -oE 'https://andoza\.jumaniyozov\.uz/api/v1'
```

---

## 7. Local dev (contrast)

Local uses `docker-compose.yml` (not `.prod.yml`): the Vite dev server on
`localhost:5173`, and `VITE_API_URL` pointed at the local API (`localhost:8000`).
The Android emulator reaches the host via `10.0.2.2` (see the mobile
`app_config.dart` defaults). None of the prod HTTPS wiring applies in dev.
