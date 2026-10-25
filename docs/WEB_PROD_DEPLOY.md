# Web frontend → production (HTTPS)

How the React/Vite web app (the do'kon + 3D studio) is served in production, how
to deploy changes, and how to point it at a different API/domain. Mirrors the
mobile guide in `docs/mobile/IOS_BUILD.md`.

## TL;DR

- Prod is one HTTPS origin — **`https://andozaai.uz`** — fronted by the
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
  https://andozaai.uz           ─────────────►  server_name andozaai.uz            │
                          │     location /        → 127.0.0.1:5173  (frontend, Docker) │
                          │     location /api/    → 127.0.0.1:8000  (backend,  Docker) │
                          │     location /media/  → 127.0.0.1:8000  (media)            │
                          └──────────────────────────────────────────────────────────┘
```

- **DNS:** an `A` record `andoza` on `jumaniyozov.uz` (Vercel DNS) → `189.74.96.11`,
  i.e. `andozaai.uz` resolves to the VPS.
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
        VITE_API_URL: ${VITE_API_URL:-https://andozaai.uz/api/v1}
```

- It **must** be the HTTPS API base. If it's ever set to a plain-`http://` URL (or
  a raw IP:port) while the app is served over HTTPS, the browser blocks the API
  calls as **mixed content** and the studio silently fails to load data.
- Changing it requires a **rebuild** (it's baked in) — editing it at runtime does
  nothing.

To override for a one-off build without editing the file:
```bash
VITE_API_URL=https://andozaai.uz/api/v1 \
  docker compose -f docker-compose.prod.yml up -d --build frontend
```

### The other half: media URLs the API generates

The same mixed-content trap bites from the server side. nginx terminates TLS and
proxies plain HTTP to the container, so the API only learns the browser's real
scheme from `X-Forwarded-Proto`. uvicorn ignores that header unless it is started
with `--proxy-headers`, and it only trusts it from `--forwarded-allow-ips`:

```yaml
command: >
  sh -c "alembic upgrade head &&
  uvicorn app.main:app --host 0.0.0.0 --port 8000
  --proxy-headers --forwarded-allow-ips=${FORWARDED_ALLOW_IPS:-172.16.0.0/12}"
```

`172.16.0.0/12` is the private range Docker allocates bridge networks from — the
proxied request reaches the container from the bridge *gateway* (e.g.
`172.18.0.1`), never from `127.0.0.1`, so uvicorn's default would silently reject
nginx's headers. Set `FORWARDED_ALLOW_IPS` if this host's Docker pool differs.
Avoid `*`: `:8000` is published on the public interface, so `*` would let anyone
spoof `X-Forwarded-*`.

Without it every `glb_url`/`thumbnail_url` came back as `http://...` on the HTTPS
site and the browser blocked all of them — no 3-D furniture model would load.
`app/core/storage.py::request_base_url` now also upgrades the scheme from
`X-Forwarded-Proto` itself (one-way, never a downgrade) as a backstop, and honours
`PUBLIC_BASE_URL` when you want to pin the origin explicitly.

Check it after a deploy:

```bash
curl -s https://andozaai.uz/api/v1/furniture | grep -o 'http://[^"]*' | head
# must print nothing
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

The site is served at `andozaai.uz`. Its DNS is on Cloudflare with the records
set to **DNS only** (grey cloud): proxied, Cloudflare could open connections to the
VPS but the replies never came back (stuck in SYN-RECV, every request a 525), so
browsers reach nginx directly and the Let's Encrypt certificate below is the one
they see. nginx + certbot are installed on the VPS.

The old `andoza.jumaniyozov.uz` is answered by the same block: its pages redirect
(301) to `https://andozaai.uz` with the same path, while `/api/` and `/media/` keep
being served there so app builds that still call the old host do not break.

**Except inside the app's WebView.** Mobile builds up to 1.0.0+24 open the Studio
at `https://andoza.jumaniyozov.uz/...?app=1`, and the app's WebView refuses to
follow a navigation to any other host, so a 301 to `andozaai.uz` leaves the
Studio on "Studio yuklanmadi: Frame load interrupted". The app's WebView is told
apart by its User-Agent (Android System WebView carries `; wv)`, iOS WKWebView has
no `Safari/` token) and is served the site on the old host; browsers are still
redirected. Drop the two `map`s and go back to the plain `$host` check once those
builds are gone (1.0.0+25 and later use `andozaai.uz`).

This works because the built site calls the API on a relative `/api/v1`
(`VITE_API_URL` in `docker-compose.prod.yml`): on the old host the Studio then
talks to the old host's `/api/`, where the app put its auth cookies. If the
server's `.env` sets `VITE_API_URL` to a full URL, remove that line.

To apply on the VPS: put the two `map` blocks above the `server` blocks in
`/etc/nginx/sites-available/andoza.jumaniyozov.uz`, change the `if` in
`location /` of the **:443** block (the one certbot manages) to
`if ($andoza_old_redirect)`, then `nginx -t && systemctl reload nginx`. Check:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://andoza.jumaniyozov.uz/login                       # 301 (browser)
curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36" https://andoza.jumaniyozov.uz/login   # 200 (app WebView)
```

On the VPS the file is `/etc/nginx/sites-available/andoza.jumaniyozov.uz`
(symlinked into `sites-enabled/`):

```nginx
# The app's own WebView (Studio in mobile builds <= 1.0.0+24) — see above.
map $http_user_agent $andoza_app_webview {
    default 0;
    "~; wv\)" 1;                                          # Android System WebView
    "~*(iPhone|iPad|iPod).*AppleWebKit(?!.*Safari)" 1;     # iOS WKWebView
}
map "$host:$andoza_app_webview" $andoza_old_redirect {
    default 0;
    "andoza.jumaniyozov.uz:0" 1;
}

server {
    listen 80;
    listen [::]:80;
    server_name andozaai.uz www.andozaai.uz andoza.jumaniyozov.uz;

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
        # The site lives at andozaai.uz; the old domain keeps /api and /media for older app
        # builds, and the whole site for their WebView ($andoza_old_redirect, above).
        if ($andoza_old_redirect) {
            return 301 https://andozaai.uz$request_uri;
        }
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
paths + an HTTP→HTTPS redirect, and installs an auto-renew timer). One certificate,
named `andoza.jumaniyozov.uz`, covers all three names:

```bash
ln -s /etc/nginx/sites-available/andoza.jumaniyozov.uz /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx --expand --cert-name andoza.jumaniyozov.uz -d andoza.jumaniyozov.uz -d andozaai.uz -d www.andozaai.uz --redirect
```

certbot then writes the `:80` block with one `if ($host = …) { return 301 … }` per
name. Point the old domain's line straight at the new one, so plain-http visits to
it skip a hop:

```nginx
    if ($host = andoza.jumaniyozov.uz) {
        return 301 https://andozaai.uz$request_uri;
    } # managed by Certbot
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
curl -s -o /dev/null -w "%{http_code}\n" https://andozaai.uz/api/v1/furniture   # 200
# HTTP redirects to HTTPS
curl -s -o /dev/null -w "%{redirect_url}\n" http://andozaai.uz/                  # https://…
# The old domain's pages redirect to the new one; its API still answers
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://andoza.jumaniyozov.uz/login   # 301 https://andozaai.uz/login
curl -s -o /dev/null -w "%{http_code}\n" https://andoza.jumaniyozov.uz/api/v1/furniture       # 200
# The built bundle points at the HTTPS API (not a raw http IP)
JS=$(curl -s https://andozaai.uz/ | grep -oE '/assets/index-[^"]+\.js' | head -1)
curl -s "https://andozaai.uz$JS" | grep -oE 'https://andozaai\.uz/api/v1'
```

---

## 7. Local dev (contrast)

Local uses `docker-compose.yml` (not `.prod.yml`): the Vite dev server on
`localhost:5173`, and `VITE_API_URL` pointed at the local API (`localhost:8000`).
The Android emulator reaches the host via `10.0.2.2` (see the mobile
`app_config.dart` defaults). None of the prod HTTPS wiring applies in dev.
