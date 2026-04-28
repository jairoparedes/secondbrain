#!/usr/bin/env bash
# ============================================================
# Second Brain · update a la última versión.
#
# Ejecutar dentro del VPS desde /opt/secondbrain (o donde clonaste):
#
#   bash scripts/deploy/update.sh
#
# Hace:
#   1. git pull
#   2. docker compose build (con cache, rápido)
#   3. up -d (rolling: para los contenedores cambiados)
#   4. php artisan migrate --force
#   5. recachear config y rutas
#   6. healthcheck final
# ============================================================

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/secondbrain}"
cd "$REPO_DIR"

ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
step() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
err()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }

step "git pull"
git pull --ff-only
ok "Repo en $(git rev-parse --short HEAD)"

step "Build (con cache)"
docker compose build
ok "Imágenes actualizadas"

step "Up con recreate de contenedores"
docker compose up -d --remove-orphans
ok "Contenedores actualizados"

step "Esperando health de Postgres"
DB_USER="$(grep ^DB_USERNAME .env | cut -d= -f2)"
ATTEMPTS=30
until docker compose exec -T postgres pg_isready -U "$DB_USER" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS-1))
  if [[ $ATTEMPTS -le 0 ]]; then
    err "Postgres no responde, abortando migrate."; exit 1
  fi
  sleep 2
done
ok "Postgres listo"

step "Migraciones + caches"
docker compose exec -T backend php artisan migrate --force
docker compose exec -T backend php artisan config:cache
docker compose exec -T backend php artisan route:cache
ok "Backend al día"

step "Healthcheck"
sleep 4
HEALTH="$(curl -fsS --max-time 10 http://localhost/api/ping || echo 'FAIL')"
if [[ "$HEALTH" == *'"status":"ok"'* ]]; then
  ok "API local responde: $HEALTH"
else
  err "Healthcheck fallido. Mirá:  docker compose logs --tail=80 backend"
  exit 1
fi

echo ""
echo "Update completo. Versión: $(git rev-parse --short HEAD)"
