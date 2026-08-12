#!/usr/bin/env bash
# Runs ON THE SERVER. Invoked by the GitHub Actions deploy workflow (and can be
# run by hand). Pulls the latest master and rebuilds the production stack.
#
# backend/.env and frontend/.env are gitignored, so `git reset --hard` leaves
# them untouched — they live only on the server.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/andoza_ai}"
COMPOSE_FILE="docker-compose.prod.yml"

cd "$APP_DIR"

echo "==> Fetching latest master"
git fetch --all --prune
git reset --hard origin/master

echo "==> Building & starting containers"
docker compose -f "$COMPOSE_FILE" up -d --build

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Deployed. Running containers:"
docker compose -f "$COMPOSE_FILE" ps
