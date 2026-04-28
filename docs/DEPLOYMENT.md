# Guía de despliegue a producción

Esta guía cubre el camino más simple y seguro para llevar Second Brain de
desarrollo (`docker compose up`) a un servidor real con un dominio y TLS.

> **Resumen ejecutivo:** un VPS pequeño (2 vCPU / 4 GB RAM) con Docker
> Compose + Caddy alcanza para algunos cientos de usuarios. Costo
> estimado: USD 12–24/mes (Hetzner / DigitalOcean / Linode / Vultr).

---

## 1. Prerrequisitos

| Recurso | Recomendado | Notas |
|---|---|---|
| Dominio | `notas.tu-dominio.com` | Apuntalo al VPS con un A record |
| VPS | 2 vCPU, 4 GB RAM, 40 GB SSD, Ubuntu 24.04 LTS | Hetzner CX22 (€4/mes), DO `s-2vcpu-2gb` (USD 18/mes) |
| Docker | 26+ con Compose v2 | Instalado vía script oficial |
| TLS | Caddy (automático) | Alternativa: certbot + nginx |
| Backups | Snapshots diarios del VPS + dump de Postgres a S3/Backblaze | Imprescindible |
| Monitoreo | UptimeRobot (gratis) o Healthchecks.io | Alertas básicas por email |

**Lo que NO recomendamos para empezar:**
- Kubernetes — overkill para un solo servicio.
- Despliegue serverless del backend Laravel — PHP-FPM con persistencia
  de Sanctum y conexiones largas a Redis se lleva mejor con un proceso
  long-lived.

---

## 2. Decisión: ¿qué arquitectura?

Tres opciones según el nivel de seriedad del proyecto.

### Opción A — VPS único, todo dockerizado (recomendada para MVP)

Un solo servidor corre nginx, frontend, backend, queue worker, Postgres,
Redis y MinIO. Es lo mismo que en desarrollo, pero con TLS, secrets
fuertes y volúmenes persistentes. Backups en cron.

**Pros:** simple, barato, reproducible.
**Contras:** un solo punto de falla. Si el disco se llena, todo se cae.

### Opción B — VPS app + Postgres managed

Postgres lo provee tu cloud (Neon, Supabase, RDS, Hetzner Managed DB).
El resto sigue en el VPS.

**Pros:** backups y replicación automáticas. Restore probado.
**Contras:** USD 15–60/mes adicionales.

### Opción C — Componentes cloud separados

Backend y queue en Fly.io o Railway. Postgres managed. MinIO → S3 real.
Frontend en Vercel.

**Pros:** escala horizontal, deploys con zero-downtime.
**Contras:** más servicios que mantener; el modelo zero-knowledge no
cambia, pero la operación se vuelve más cara.

**Esta guía sigue la Opción A.** Las opciones B y C son extensiones obvias
una vez estabilizado.

---

## 3. Preparar el VPS

Asumimos Ubuntu 24.04 LTS y un usuario `deploy` con sudo.

```bash
# Actualizar e instalar dependencias
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw fail2ban unattended-upgrades

# Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Docker oficial
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# cerrar sesión y volver a entrar para que tome el grupo

# Actualizaciones automáticas de seguridad
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Endurecer SSH (recomendado)

En `/etc/ssh/sshd_config`:
```
PasswordAuthentication no
PermitRootLogin no
```
Y reiniciá: `sudo systemctl restart sshd`. Asegurate de tener tu llave
SSH cargada antes.

---

## 4. Clonar el repo y configurar

```bash
cd /opt
sudo mkdir secondbrain && sudo chown deploy:deploy secondbrain
cd secondbrain
git clone https://github.com/jairoparedes/secondbrain.git .

# Variables de entorno de producción
cp .env.example .env
nano .env
```

### Cambios obligatorios en `.env`

```ini
# --- App ---
APP_NAME=SecondBrain
APP_ENV=production
APP_DEBUG=false
APP_URL=https://notas.tu-dominio.com
# Generar abajo con: docker run --rm php:8.3-cli php -r "echo 'base64:'.base64_encode(random_bytes(32));"
APP_KEY=base64:CAMBIAR_POR_VALOR_REAL_DE_32_BYTES

# --- Puertos NO se exponen al host en prod (solo Caddy) ---
HTTP_PORT=80
POSTGRES_PORT=5432
REDIS_PORT=6379
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001

# --- Postgres ---
DB_CONNECTION=pgsql
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=secondbrain
DB_USERNAME=secondbrain
# Mínimo 32 caracteres, generado al azar
DB_PASSWORD=CAMBIAR_POR_PASSWORD_LARGO_Y_RANDOM

# --- Redis ---
REDIS_HOST=redis
REDIS_PASSWORD=CAMBIAR_POR_PASSWORD_LARGO
REDIS_PORT=6379

QUEUE_CONNECTION=redis
CACHE_STORE=redis
SESSION_DRIVER=redis

# --- MinIO ---
AWS_ACCESS_KEY_ID=secondbrain
AWS_SECRET_ACCESS_KEY=CAMBIAR_POR_PASSWORD_MINIO_LARGO
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=secondbrain
AWS_ENDPOINT=http://minio:9000
AWS_USE_PATH_STYLE_ENDPOINT=true

# --- Frontend ---
NEXT_PUBLIC_API_URL=https://notas.tu-dominio.com/api
NEXT_PUBLIC_APP_NAME=SecondBrain

# --- Sanctum ---
SANCTUM_STATEFUL_DOMAINS=notas.tu-dominio.com
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
```

### Generar secrets

```bash
# APP_KEY
docker run --rm php:8.3-cli php -r \
  "echo 'base64:'.base64_encode(random_bytes(32)).PHP_EOL;"

# DB_PASSWORD, REDIS_PASSWORD, AWS_SECRET_ACCESS_KEY
openssl rand -base64 36
openssl rand -base64 36
openssl rand -base64 36
```

> **Nunca** uses los valores de `.env.example` en producción.

---

## 5. Build de imágenes inmutables

En desarrollo, los volúmenes `./backend:/var/www/html` y
`./frontend:/app` montan el código del host (hot reload). En producción
queremos que el código viva *adentro* de la imagen, sin volúmenes de
código, para que sea reproducible.

El repo trae:
- `docker-compose.prod.yml` con overrides de producción.
- `frontend/Dockerfile.prod` con build estático multi-stage.

```bash
# Build con los overrides de producción
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Levantar
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Migrar la DB
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec backend php artisan migrate --force

# Cachear config y rutas (mejora rendimiento)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec backend sh -c "php artisan config:cache && php artisan route:cache"

# Crear el bucket de MinIO
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec minio sh -c \
  "mc alias set local http://localhost:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD && \
   mc mb --ignore-existing local/secondbrain"
```

Para evitar tipear el `-f` cada vez:
```bash
echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml' >> .env
# A partir de ahora `docker compose ...` ya usa los dos.
```

---

## 6. TLS con Caddy

Caddy se encarga automáticamente de Let's Encrypt. No te tenés que
preocupar por renovar nada.

Crear `/opt/secondbrain/Caddyfile`:

```caddyfile
notas.tu-dominio.com {
    encode zstd gzip

    # Headers de seguridad (CSP permite WASM para Argon2id)
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    }

    # Caddy delega a nginx (que ya rutea /api → backend, / → frontend)
    reverse_proxy nginx:80
}
```

Agregar el servicio `caddy` al stack está incluido en
`docker-compose.prod.yml`. Levantá Caddy con todos los demás:

```bash
docker compose up -d caddy
```

Caddy resolverá DNS, pedirá certificado a Let's Encrypt y arrancará en
HTTPS. Ya podés visitar `https://notas.tu-dominio.com`.

> **DNS:** asegurate de que `A notas.tu-dominio.com → IP_DEL_VPS` esté
> propagado **antes** de levantar Caddy, o el primer arranque va a
> fallar (Caddy reintenta cada minuto, eventualmente lo logra).

---

## 7. Hardening adicional

### Quitar puertos públicos innecesarios

En `docker-compose.prod.yml` los puertos de Postgres, Redis, MinIO y
nginx **no se exponen al host**. Solo Caddy escucha 443.

Verificación:
```bash
sudo ss -tlnp | grep LISTEN
# debería mostrar solo :22 (SSH) y :443 (Caddy)
```

### Sanctum stateful (opcional)

Si en el futuro querés autenticación por cookie (en vez de Bearer
token en localStorage), ponés:
```ini
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
SANCTUM_STATEFUL_DOMAINS=notas.tu-dominio.com
```
Y en `backend/bootstrap/app.php` re-habilitás `$middleware->statefulApi()`.

### Rate limiting más agresivo

En `backend/app/Providers/AppServiceProvider.php`, ajustar el limitador:
```php
RateLimiter::for('api', function (Request $request) {
    return Limit::perMinute(30)->by($request->user()?->id ?: $request->ip());
});
```

### CSP más estricta

Una vez verificada la app, podés sacar `'unsafe-inline'` de `style-src`
si Tailwind permite (en Next 14 sí).

---

## 8. Backups

### Postgres — dump diario a Backblaze B2 / S3

Crear `/opt/secondbrain/scripts/backup-postgres.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/opt/secondbrain/backups
mkdir -p "$DEST"

docker compose -f /opt/secondbrain/docker-compose.yml \
  -f /opt/secondbrain/docker-compose.prod.yml \
  exec -T postgres pg_dump -U secondbrain secondbrain \
  | gzip -9 > "$DEST/secondbrain-$TS.sql.gz"

# Subir a remoto (rclone con cualquier proveedor S3-compatible)
rclone copy "$DEST/secondbrain-$TS.sql.gz" remote:secondbrain-backups/postgres/

# Retention local: 7 días
find "$DEST" -name 'secondbrain-*.sql.gz' -mtime +7 -delete
```

Cron diario a las 3 AM UTC:
```cron
0 3 * * * /opt/secondbrain/scripts/backup-postgres.sh >> /var/log/sb-backup.log 2>&1
```

### MinIO — replicación a otro proveedor

Configurar replicación cross-region en MinIO o sincronizar con `mc mirror`
en cron. Para volumen bajo (< 1 GB) un `rclone sync` diario alcanza.

### Probar el restore

**Lo único que cuenta es que el restore funcione.** Probalo cada mes:

```bash
gunzip -c secondbrain-XXX.sql.gz | \
  docker compose exec -T postgres psql -U secondbrain secondbrain_test
```

---

## 9. Operación día-a-día

### Logs

```bash
docker compose logs -f backend frontend
docker compose logs --tail=50 caddy
```

### Updates

```bash
cd /opt/secondbrain
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose exec backend php artisan migrate --force
docker compose exec backend php artisan config:cache
```

Para downtime cero, ver Opción C (Fly.io / Railway con health checks).

### Healthcheck externo

Configurar UptimeRobot apuntando a:
```
https://notas.tu-dominio.com/api/ping
```

Esperar `200` y `"status":"ok"`. Cualquier otra cosa = alerta por email.

### Métricas (opcional)

Si querés algo más serio que un endpoint:
- **Prometheus** + **Grafana**: scrapeable desde nginx logs y endpoints
  `/metrics` (pendiente de Fase 7).
- **Sentry**: integrar `sentry/sentry-laravel` y `@sentry/nextjs` para
  capturar errores en producción.

---

## 10. Checklist final antes de abrir al público

- [ ] Dominio resuelve al VPS y `https://` funciona con candado verde.
- [ ] `APP_DEBUG=false` y `APP_ENV=production` en `.env`.
- [ ] Todos los secrets cambiados respecto a `.env.example`.
- [ ] `php artisan migrate --force` corrió sin errores.
- [ ] `php artisan test` pasa contra el contenedor de producción.
- [ ] `curl https://notas.tu-dominio.com/api/ping` devuelve 200.
- [ ] Crear cuenta de prueba, escribir nota, **verificar en Postgres**
  que `content_ciphertext` es opaco (ver `SECURITY.md` § "Cómo
  verificarlo").
- [ ] Backup de Postgres corrió al menos una vez. Restore probado.
- [ ] UptimeRobot o equivalente configurado.
- [ ] SSH password disabled, root login disabled, firewall activo.
- [ ] Snapshots automáticos del VPS habilitados en el panel del proveedor.
- [ ] Documentar credenciales de admin en un gestor (1Password, Bitwarden,
  Vaultwarden self-hosted).

---

## 11. Costos típicos al mes

| Componente | Costo |
|---|---|
| VPS Hetzner CX22 (2 vCPU / 4 GB) | €4 |
| Backups remotos (Backblaze B2, ~10 GB) | USD 0.06 |
| Dominio | USD 1 |
| UptimeRobot free | USD 0 |
| **Total estimado** | **~USD 6/mes** |

Con DigitalOcean equivalente: USD 24/mes. Con Postgres managed
(Neon free tier, 0.5 GB): mismo VPS pero más resiliente.

---

## 12. Troubleshooting común

| Síntoma | Causa probable | Fix |
|---|---|---|
| `502 Bad Gateway` en `/api` | backend caído | `docker compose logs backend`, revivir con `restart backend` |
| Frontend muestra "API caída" | `NEXT_PUBLIC_API_URL` apunta mal | Reconstruir frontend con la URL correcta |
| Login falla con 419 | Sanctum stateful sin matching domain | Revisar `SANCTUM_STATEFUL_DOMAINS` |
| Crear cuenta tarda > 5 s | Argon2id en CPU lenta | Reducir `iterations` en `crypto.ts` (impacto en seguridad) |
| Postgres no arranca tras update | Migración fallida | Restore del último dump, revisar la migración nueva |
| Caddy no obtiene cert | DNS no propagado o puerto 80 cerrado | `dig +short notas.tu-dominio.com` y `ufw status` |

---

## 13. Roadmap de despliegue

- **Fase 7** del roadmap incluye CI/CD con GitHub Actions, manifiestos
  Helm para Kubernetes y observabilidad completa. Esta guía es lo
  necesario hasta llegar ahí.
- Antes de Fase 7: probablemente quieras **CI** que corra los 32 tests
  en cada PR. Ya hay un `.github/workflows/ci.yml` esqueleto.
