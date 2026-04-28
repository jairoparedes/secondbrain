#!/usr/bin/env bash
# ============================================================
# Backup diario de Postgres a Google Cloud Storage.
# Lo invoca cron desde dentro de la VM de producción.
#
# Lee de /opt/secondbrain/.env la variable GCP_BACKUP_BUCKET.
# La Service Account default de Compute Engine ya tiene permisos
# para escribir en buckets del mismo proyecto si se creó la VM
# con --scopes=cloud-platform (lo hace 01-create-vm.sh).
# ============================================================

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/secondbrain}"
cd "$REPO_DIR"

if [[ ! -f .env ]]; then
  echo "[backup] no encuentro .env en $REPO_DIR" >&2
  exit 1
fi

BUCKET="$(grep -E '^GCP_BACKUP_BUCKET=' .env | cut -d= -f2 || true)"
if [[ -z "$BUCKET" ]]; then
  echo "[backup] GCP_BACKUP_BUCKET no configurado en .env" >&2
  exit 1
fi

DB_USER="$(grep ^DB_USERNAME .env | cut -d= -f2)"
DB_NAME="$(grep ^DB_DATABASE .env | cut -d= -f2)"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$REPO_DIR/backups"
FILE="$DEST/secondbrain-${TS}.sql.gz"
mkdir -p "$DEST"

echo "[backup] $TS — pg_dump de $DB_NAME"
docker compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip -9 > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[backup] $SIZE → gs://$BUCKET/postgres/$(basename "$FILE")"

gcloud storage cp "$FILE" "gs://$BUCKET/postgres/$(basename "$FILE")" --quiet

# Retención local: conservar últimos 7 días
find "$DEST" -name 'secondbrain-*.sql.gz' -mtime +7 -delete

echo "[backup] OK"
