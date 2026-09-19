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

# A failed seed is NOT fatal — a bad seed must not take the site down halfway
# through a rollout — but it must be impossible to miss in the Actions log.
# The old `|| echo "!! ... (non-fatal)"` one-liner was neither loud nor
# summarised, which is part of why "norms were never seeded at all" went
# unnoticed for as long as it did. Failures are collected here and re-printed
# as a banner at the very end, where a human actually looks.
# Newline-delimited rather than an array: `set -u` makes an empty array's
# ${#arr[@]} an unbound-variable error on older bash, and this script has to
# survive whatever bash the server happens to ship.
SEED_FAILURES=""

run_seed() {
  # run_seed <module> <human label>
  local module="$1" label="$2" rc=0
  echo "--> Seeding ${label} (python -m ${module})"
  docker compose -f "$COMPOSE_FILE" exec -T api python -m "$module" || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "--> ${label}: OK"
    return 0
  fi
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!! SEED FAILED: ${label} (python -m ${module}) exited ${rc}"
  echo "!! The deploy continues, but this seed did NOT run. See above."
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  SEED_FAILURES="${SEED_FAILURES}${label} (python -m ${module}, exit ${rc})\n"
}

echo "==> Seeding (idempotent) + clearing materials cache"
# Give the api a moment to finish `alembic upgrade head` on boot before seeding.
sleep 10
run_seed app.seed_catalog "stores/materials/ustalar catalog"
# Norms are what every smeta line prices against; without them the engine
# silently falls back to hardcoded constants and flags every line approximate.
# Deliberately NOT `app.seeds`, which would add a second demo catalog beside
# the one above — see app/seed_norms.py for the full reasoning.
run_seed app.seed_norms "smeta norms"
# The /materials response is cached 10 min; drop those keys so freshly seeded
# rows appear immediately.
docker compose -f "$COMPOSE_FILE" exec -T redis sh -c "redis-cli --scan --pattern 'materials:*' | xargs -r redis-cli DEL" || true

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Deployed. Running containers:"
docker compose -f "$COMPOSE_FILE" ps

if [ -n "$SEED_FAILURES" ]; then
  echo
  echo "################################################################"
  echo "# DEPLOY SUCCEEDED, BUT SOME SEED STEPS FAILED:"
  printf "%b" "$SEED_FAILURES" | while IFS= read -r failure; do
    [ -n "$failure" ] && echo "#   - ${failure}" || true
  done
  echo "# The site is up on the new build, but the database was not"
  echo "# fully seeded. Re-run the failing seed by hand:"
  echo "#   docker compose -f ${COMPOSE_FILE} exec -T api python -m <module>"
  echo "################################################################"
fi
