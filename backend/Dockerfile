FROM node:20-bookworm-slim AS gltf
RUN npm install -g @gltf-transform/cli@4.1.1 && npm cache clean --force

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Compresses uploaded 3D models (meshopt geometry, WebP textures): see
# app/services/glb_optimizer.py. Only the node binary and the CLI are copied in from the
# build stage; Debian's own npm would pull ~300 MB of packages. Pinned: the settings were
# checked by eye against this version.
COPY --from=gltf /usr/local/bin/node /usr/local/bin/node
COPY --from=gltf /usr/local/lib/node_modules/@gltf-transform /usr/local/lib/node_modules/@gltf-transform
RUN ln -s /usr/local/lib/node_modules/@gltf-transform/cli/bin/cli.js /usr/local/bin/gltf-transform \
    && gltf-transform --version

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
