#!/usr/bin/env bash
# ============================================================
# Bootstrap dentro de la VM: instala Docker, configura .env con
# secrets fuertes, levanta el stack en producción y migra la DB.
#
# Uso (dentro de la VM, ejecutar como sudo):
#   sudo bash scripts/gcp/02-bootstrap-vm.sh notas.tu-dominio.com PROJECT_ID-backups
#
# Argumentos:
#   $1   DOMAIN            ej. notas.tu-dominio.com
#   $2   GCP_BACKUP_BUCKET ej. miproyecto-backups (sin gs://)
# ============================================================

set -euo pipefail

DOMAIN="${1:?'Pasá el dominio como primer argumento, ej: notas.tu-dominio.com'}"
BUCKET="${2:-}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
step() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }

REPO_DIR="${REPO_DIR:-/opt/secondbrain}"

cd "$REPO_DIR"

# ------------------------------------------------------------
step "Paquetes base + firewall"
apt update -qq
apt install -y -qq curl git ufw

ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp           >/dev/null
ufw allow 80/tcp           >/dev/null
ufw allow 443/tcp          >/dev/null
yes | ufw --force enable   >/dev/null
ok "ufw activo (22, 80, 443)"

# ------------------------------------------------------------
step "Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') listo"

# Permitir docker al usuario que invocó sudo
INVOKER="${SUDO_USER:-$(whoami)}"
if [[ "$INVOKER" != "root" ]]; then
  usermod -aG docker "$INVOKER" || true
  ok "Usuario $INVOKER agregado al grupo docker (relogueate para que tome efecto)"
fi

# ------------------------------------------------------------
step "Configurando .env de producción"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

gen() { openssl rand -base64 36 | tr -d '+/='; }

APP_KEY="base64:$(openssl rand -base64 32)"
DB_PWD="$(gen)"
REDIS_PWD="$(gen)"
MINIO_PWD="$(gen)"

# Reemplazos seguros (idempotentes)
sed -i "s|^APP_KEY=.*|APP_KEY=${APP_KEY}|"                                   .env
sed -i "s|^APP_ENV=.*|APP_ENV=production|"                                   .env
sed -i "s|^APP_DEBUG=.*|APP_DEBUG=false|"                                    .env
sed -i "s|^APP_URL=.*|APP_URL=https://${DOMAIN}|"                            .env
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PWD}|"                            .env
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PWD}|"                   .env
sed -i "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=${MINIO_PWD}|"     .env
sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://${DOMAIN}/api|" .env

add_if_missing() {
  local KEY="$1" VALUE="$2"
  if ! grep -qE "^${KEY}=" .env; then
    echo "${KEY}=${VALUE}" >> .env
  else
    sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" .env
  fi
}

add_if_missing DOMAIN "$DOMAIN"
add_if_missing COMPOSE_FILE "docker-compose.yml:docker-compose.prod.yml"
[[ -n "$BUCKET" ]] && add_if_missing GCP_BACKUP_BUCKET "$BUCKET"

chmod 600 .env
ok ".env de producción generado"

# ------------------------------------------------------------
step "Build + up del stack"
docker compose pull --quiet || true
docker compose up -d --build
ok "Servicios levantados"

# ------------------------------------------------------------
step "Esperando a Postgres (healthcheck)"
ATTEMPTS=30
until docker compose exec -T postgres pg_isready -U "$(grep ^DB_USERNAME .env | cut -d= -f2)" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS-1))
  if [[ $ATTEMPTS -le 0 ]]; then
    echo "Postgres no respondió a tiempo. Revisá: docker compose logs postgres" >&2
    exit 1
  fi
  sleep 2
done
ok "Postgres listo"

# ------------------------------------------------------------
step "Migraciones + caches Laravel"
docker compose exec -T backend php artisan migrate --force
docker compose exec -T backend php artisan config:cache
docker compose exec -T backend php artisan route:cache
ok "Backend operativo"

# ------------------------------------------------------------
step "Bucket MinIO 'secondbrain'"
docker compose exec -T minio sh -c '
  mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && \
  mc mb --ignore-existing local/secondbrain >/dev/null
'
ok "MinIO listo"

# ------------------------------------------------------------
step "Backup script + cron diario"
mkdir -p "$REPO_DIR/scripts"
cp "$REPO_DIR/scripts/gcp/backup-to-gcs.sh" "$REPO_DIR/scripts/backup.sh"
chmod +x "$REPO_DIR/scripts/backup.sh"

CRON_LINE="0 3 * * * /opt/secondbrain/scripts/backup.sh >> /var/log/sb-backup.log 2>&1"
(
  crontab -l 2>/dev/null | grep -v 'backup.sh' || true
  echo "$CRON_LINE"
) | crontab -
touch /var/log/sb-backup.log && chmod 644 /var/log/sb-backup.log
ok "Backup diario 03:00 UTC programado"

# ------------------------------------------------------------
echo ""
bold "Bootstrap completo."
echo ""
echo "Probá ahora:"
echo "  curl -k https://${DOMAIN}/api/ping"
echo "  abrir en el navegador: https://${DOMAIN}"
echo ""
echo "Si Caddy todavía está negociando el certificado, esperá 30-60s."
echo ""
echo "Verificación zero-knowledge (debe mostrar bytes opacos):"
echo "  cd $REPO_DIR && docker compose exec postgres psql -U secondbrain -d secondbrain \\"
echo "    -c \"SELECT LEFT(content_ciphertext, 40) FROM notes ORDER BY created_at DESC LIMIT 3;\""
