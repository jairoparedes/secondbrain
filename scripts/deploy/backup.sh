#!/usr/bin/env bash
# ============================================================
# Second Brain · backup diario de Postgres.
#
# Por defecto guarda un dump comprimido en /opt/secondbrain/backups con
# rotación local de 7 días. Si configuraste rclone, además sube el
# último dump a un remoto (Backblaze B2, S3, etc.).
#
# Configuración (todo opcional, leído de .env):
#
#   BACKUP_RCLONE_REMOTE   Nombre del remote configurado, ej: b2:misb-backups
#                          Si está seteado, se hace rclone copy.
#   BACKUP_LOCAL_KEEP_DAYS Default 7. Días a conservar localmente.
#   BACKUP_REMOTE_KEEP_DAYS Default 30. Aplicado en remote vía rclone delete.
#
# Para configurar rclone una vez:
#
#   sudo apt install -y rclone
#   rclone config            # interactivo: agregás un remote (ej. b2)
#   echo 'BACKUP_RCLONE_REMOTE=b2:misb-backups' >> /opt/secondbrain/.env
# ============================================================

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/secondbrain}"
cd "$REPO_DIR"

if [[ ! -f .env ]]; then
  echo "[backup] no encuentro .env en $REPO_DIR" >&2
  exit 1
fi

DB_USER="$(grep ^DB_USERNAME .env | cut -d= -f2)"
DB_NAME="$(grep ^DB_DATABASE .env | cut -d= -f2)"
RCLONE_REMOTE="$(grep -E '^BACKUP_RCLONE_REMOTE=' .env | cut -d= -f2- || true)"
LOCAL_KEEP="$(grep -E '^BACKUP_LOCAL_KEEP_DAYS=' .env | cut -d= -f2 || echo 7)"
REMOTE_KEEP="$(grep -E '^BACKUP_REMOTE_KEEP_DAYS=' .env | cut -d= -f2 || echo 30)"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$REPO_DIR/backups"
FILE="$DEST/secondbrain-${TS}.sql.gz"
mkdir -p "$DEST"

echo "[backup] $TS — pg_dump de $DB_NAME"
docker compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip -9 > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[backup] $SIZE → $FILE"

if [[ -n "$RCLONE_REMOTE" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "[backup] subiendo a $RCLONE_REMOTE"
    rclone copy "$FILE" "$RCLONE_REMOTE/postgres/" --quiet
    # Limpiar antiguos remotos. rclone delete no rompe si no hay matches.
    rclone delete "$RCLONE_REMOTE/postgres/" --min-age "${REMOTE_KEEP}d" --quiet || true
    echo "[backup] subida ok, retención remota ${REMOTE_KEEP}d"
  else
    echo "[backup] WARN: BACKUP_RCLONE_REMOTE seteado pero rclone no instalado." >&2
    echo "[backup] WARN: instalá con  sudo apt install rclone  y corré  rclone config" >&2
  fi
fi

# Retención local
find "$DEST" -name 'secondbrain-*.sql.gz' -mtime "+${LOCAL_KEEP}" -delete
echo "[backup] retención local ${LOCAL_KEEP}d aplicada"
echo "[backup] OK"
