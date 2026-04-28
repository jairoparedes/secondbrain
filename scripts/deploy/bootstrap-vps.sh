#!/usr/bin/env bash
# ============================================================
# Second Brain · Bootstrap de un VPS de cero a producción.
#
# Funciona en cualquier VPS Linux con systemd (Ubuntu 24/22, Debian 12+,
# y otras distros con apt). Instala Docker + Compose, clona el repo si
# hace falta, genera secrets fuertes, configura .env, levanta el stack
# en producción con TLS automático (Caddy), migra la DB y deja un cron
# diario de backup local.
#
# Uso (como root o con sudo):
#
#   sudo bash bootstrap-vps.sh DOMAIN [REPO_URL]
#
#   DOMAIN     Dominio que ya apunta a este VPS (ej. notas.midominio.com)
#              Si no tenés dominio aún, podés pasar la IP pública del VPS
#              y la app servirá HTTP plano (sin TLS).
#   REPO_URL   Opcional. URL del repo. Default: el oficial.
#
# Ejemplo típico:
#
#   curl -fsSL https://raw.githubusercontent.com/jairoparedes/secondbrain/main/scripts/deploy/bootstrap-vps.sh \
#     | sudo bash -s -- notas.midominio.com
#
# Idempotente: podés correrlo varias veces sin romper nada.
# ============================================================

set -euo pipefail

DOMAIN="${1:-}"
REPO_URL="${2:-https://github.com/jairoparedes/secondbrain.git}"
REPO_DIR="${REPO_DIR:-/opt/secondbrain}"
RUN_USER="${SUDO_USER:-${USER:-root}}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
step() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
err()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }

if [[ -z "$DOMAIN" ]]; then
  err "Faltó el dominio. Uso:"
  err "  sudo bash bootstrap-vps.sh DOMAIN"
  err ""
  err "Si todavía no tenés dominio, pasá la IP pública del VPS"
  err "(la app va a servir HTTP plano hasta que apuntes un dominio real)."
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  err "Necesito root. Ejecutá con sudo."
  exit 1
fi

# ------------------------------------------------------------
step "Detectando sistema"
. /etc/os-release || true
OS_ID="${ID:-unknown}"
OS_VER="${VERSION_ID:-?}"
echo "OS: $OS_ID $OS_VER  ·  Dominio: $DOMAIN"

case "$OS_ID" in
  ubuntu|debian) ;;
  *)
    err "Distro $OS_ID no probada. El script asume apt."
    err "Si querés intentar igual, exportá FORCE_APT=1 y re-ejecutá."
    [[ "${FORCE_APT:-0}" == "1" ]] || exit 1
    ;;
esac

# ------------------------------------------------------------
step "Paquetes base"
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl git ufw cron openssl \
  unattended-upgrades >/dev/null
ok "ca-certificates, curl, git, ufw, cron, openssl"

# ------------------------------------------------------------
step "Firewall (ufw)"
ufw --force reset >/dev/null
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp           >/dev/null
ufw allow 80/tcp           >/dev/null
ufw allow 443/tcp          >/dev/null
yes | ufw --force enable   >/dev/null
ok "ufw activo, puertos abiertos: 22, 80, 443"

# ------------------------------------------------------------
step "Docker + Compose"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1 || true
DOCKER_VER="$(docker --version | awk '{print $3}' | tr -d ',')"
COMPOSE_VER="$(docker compose version --short 2>/dev/null || echo 'desconocida')"
ok "Docker $DOCKER_VER · Compose $COMPOSE_VER"

if [[ "$RUN_USER" != "root" ]]; then
  usermod -aG docker "$RUN_USER" || true
  ok "Usuario $RUN_USER agregado al grupo docker (relogueá tras este script)"
fi

# ------------------------------------------------------------
step "Clonando o actualizando $REPO_DIR"
if [[ ! -d "$REPO_DIR/.git" ]]; then
  mkdir -p "$REPO_DIR"
  chown -R "$RUN_USER":"$RUN_USER" "$REPO_DIR"
  sudo -u "$RUN_USER" git clone --depth 1 "$REPO_URL" "$REPO_DIR"
  ok "Repo clonado"
else
  sudo -u "$RUN_USER" git -C "$REPO_DIR" pull --ff-only
  ok "Repo actualizado al último main"
fi
cd "$REPO_DIR"

# ------------------------------------------------------------
step "Generando .env de producción"

if [[ ! -f .env ]]; then
  cp .env.example .env
  ok ".env creado desde .env.example"
else
  ok ".env ya existía (se preservan valores existentes en lo posible)"
fi

# Genera un secret aleatorio si la línea actual aún tiene el valor del example
gen() { openssl rand -base64 36 | tr -d '+/=' | head -c 48; }

# Reemplaza solo si el valor actual coincide con el placeholder del example
maybe_replace() {
  local KEY="$1" PLACEHOLDER="$2" VALUE="$3"
  local CURRENT
  CURRENT="$(grep -E "^${KEY}=" .env | cut -d= -f2- || true)"
  if [[ -z "$CURRENT" || "$CURRENT" == "$PLACEHOLDER" ]]; then
    sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" .env
  fi
}

# Asegura que la línea exista (la setea o la agrega)
upsert() {
  local KEY="$1" VALUE="$2"
  if grep -qE "^${KEY}=" .env; then
    sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" .env
  else
    echo "${KEY}=${VALUE}" >> .env
  fi
}

APP_KEY_PLACEHOLDER=""
DB_PWD_PLACEHOLDER="secondbrain_dev_change_me"
MINIO_PWD_PLACEHOLDER="secondbrain_dev_change_me"

# APP_KEY siempre se asegura
if ! grep -qE "^APP_KEY=base64:" .env; then
  upsert APP_KEY "base64:$(openssl rand -base64 32)"
fi

# Secrets: solo se generan si seguían siendo los del example
maybe_replace DB_PASSWORD            "$DB_PWD_PLACEHOLDER"    "$(gen)"
maybe_replace REDIS_PASSWORD         "null"                   "$(gen)"
maybe_replace AWS_SECRET_ACCESS_KEY  "$MINIO_PWD_PLACEHOLDER" "$(gen)"

# Configuración de producción
upsert APP_ENV   production
upsert APP_DEBUG false
upsert APP_URL   "https://${DOMAIN}"
upsert NEXT_PUBLIC_API_URL "https://${DOMAIN}/api"
upsert SANCTUM_STATEFUL_DOMAINS "${DOMAIN}"
upsert SESSION_SECURE_COOKIE true

# Para que Caddy y el override de prod tomen el dominio
upsert DOMAIN "$DOMAIN"
upsert COMPOSE_FILE "docker-compose.yml:docker-compose.prod.yml"

# REDIS_PASSWORD ya no debe ser "null" para producción
if grep -qE '^REDIS_PASSWORD=null$' .env; then
  upsert REDIS_PASSWORD "$(gen)"
fi

chmod 600 .env
chown "$RUN_USER":"$RUN_USER" .env
ok ".env asegurado con secrets fuertes y compose override de producción"

# ------------------------------------------------------------
step "Build + up del stack (esto puede tardar ~5 min la primera vez)"
docker compose pull --ignore-pull-failures --quiet || true
docker compose up -d --build
ok "Servicios levantados"

# ------------------------------------------------------------
step "Esperando a Postgres"
DB_USER="$(grep ^DB_USERNAME .env | cut -d= -f2)"
ATTEMPTS=60
until docker compose exec -T postgres pg_isready -U "$DB_USER" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS-1))
  if [[ $ATTEMPTS -le 0 ]]; then
    err "Postgres no respondió a tiempo. Revisá:  docker compose logs postgres"
    exit 1
  fi
  sleep 2
done
ok "Postgres listo"

# ------------------------------------------------------------
step "Migrar DB + cachear config Laravel"
docker compose exec -T backend php artisan migrate --force
docker compose exec -T backend php artisan config:cache
docker compose exec -T backend php artisan route:cache
ok "Backend operativo"

# ------------------------------------------------------------
step "Bucket MinIO 'secondbrain'"
docker compose exec -T minio sh -c '
  mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && \
  mc mb --ignore-existing local/secondbrain >/dev/null
' || true
ok "MinIO listo"

# ------------------------------------------------------------
step "Backup local diario (cron 03:00 UTC)"
mkdir -p "$REPO_DIR/backups"
chown "$RUN_USER":"$RUN_USER" "$REPO_DIR/backups"

# El script de backup vive en el repo (genérico, soporta rclone para remoto opcional)
chmod +x "$REPO_DIR/scripts/deploy/backup.sh" 2>/dev/null || true

CRON_LINE="0 3 * * * cd $REPO_DIR && bash scripts/deploy/backup.sh >> /var/log/sb-backup.log 2>&1"
(
  crontab -l 2>/dev/null | grep -v 'scripts/deploy/backup.sh' || true
  echo "$CRON_LINE"
) | crontab -
touch /var/log/sb-backup.log
chmod 644 /var/log/sb-backup.log
ok "Cron de backup registrado"

# ------------------------------------------------------------
step "Healthcheck final"
sleep 8
HEALTH="$(curl -fsS --max-time 10 "http://localhost/api/ping" || echo 'FAIL')"
if [[ "$HEALTH" == *'"status":"ok"'* ]]; then
  ok "API local: $HEALTH"
else
  err "El healthcheck local no devolvió 'ok'. Mirá logs con:"
  err "  docker compose logs --tail=50 backend nginx"
fi

echo ""
bold "Bootstrap completo."
echo ""
echo "Probá ahora desde tu laptop:"
echo "  curl https://${DOMAIN}/api/ping"
echo "  abrir en el navegador: https://${DOMAIN}"
echo ""
echo "Si Caddy todavía está negociando el certificado TLS, esperá 30-60s."
echo "Si DOMAIN era una IP, accedé por http://${DOMAIN} (sin TLS)."
echo ""
echo "Día a día:"
echo "  cd $REPO_DIR"
echo "  bash scripts/deploy/update.sh           # actualizar a la última versión del repo"
echo "  docker compose logs -f --tail=50        # ver logs"
echo "  bash scripts/deploy/backup.sh           # disparar backup manual"
echo ""
echo "Backups remotos (opcional, recomendado):"
echo "  ver scripts/deploy/README.md sección 'Backups remotos con rclone'"
