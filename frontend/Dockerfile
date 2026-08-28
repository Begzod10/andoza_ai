# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# API base URL is baked in at build time (Vite inlines VITE_* env vars).
ARG VITE_API_URL=http://localhost:8000/api/v1
RUN printf 'VITE_API_URL=%s\n' "$VITE_API_URL" > .env.production \
    && npx vite build

# ─── Serve stage ────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# SPA fallback so client-side routes (/studio/... etc.) resolve to index.html
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
