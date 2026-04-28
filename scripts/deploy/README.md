# Deploy genérico a un VPS

Tres scripts que cubren el ciclo de vida de Second Brain en cualquier
VPS Linux con systemd (Ubuntu 24/22, Debian 12+). Independiente del
proveedor (Hetzner, DigitalOcean, Linode, OVH, Contabo, etc.).

| Script | Para qué |
|---|---|
| `bootstrap-vps.sh` | Cero-a-producción en un comando. Idempotente. |
| `update.sh` | Operación día a día tras un `git push`. |
| `backup.sh` | pg_dump diario local + opcional remoto vía rclone. |

> **Para Google Cloud específicamente** hay una guía y scripts
> separados en [`../gcp/`](../gcp/) que aprovechan IPs estáticas,
> snapshots y Cloud Storage nativos. Esta carpeta es el camino
> portable.

---

## Despliegue inicial

### Antes de empezar

- Tu VPS arrancado, con SSH funcionando y un usuario con `sudo`.
- (Recomendado) un dominio apuntando al VPS:
  ```
  A   notas.midominio.com   →   IP_DEL_VPS
  ```
  Si todavía no tenés dominio, podés usar la IP pública del VPS
  como argumento; la app va a servir HTTP plano (sin TLS) hasta que
  apuntes un dominio real.

### Comando único

Conectate al VPS por SSH y pegá:

```bash
curl -fsSL https://raw.githubusercontent.com/jairoparedes/secondbrain/main/scripts/deploy/bootstrap-vps.sh \
  | sudo bash -s -- notas.midominio.com
```

> Reemplazá `notas.midominio.com` por tu dominio o IP. La primera ejecución
> tarda ~5 min porque hace `composer install` y `npm install` dentro de las
> imágenes.

Cuando termine, vas a ver:

```
Bootstrap completo.
Probá ahora desde tu laptop:
  curl https://notas.midominio.com/api/ping
  abrir en el navegador: https://notas.midominio.com
```

### Qué dejó configurado

- Docker Engine + Compose actualizados
- ufw activo con 22, 80 y 443 abiertos
- Repo clonado en `/opt/secondbrain`
- `.env` con secrets aleatorios fuertes (APP_KEY, DB, Redis, MinIO)
- `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml` para usar el
  override de producción (Caddy con TLS, sin puertos públicos, etc.)
- Stack levantado con TLS automático (Let's Encrypt vía Caddy)
- Migraciones de Laravel ejecutadas
- Caches de Laravel (`config:cache`, `route:cache`)
- Bucket MinIO `secondbrain` creado
- Cron diario 03:00 UTC ejecutando backup local
- Logs del backup en `/var/log/sb-backup.log`

---

## Operación día a día

### Actualizar a la última versión del repo

```bash
cd /opt/secondbrain
bash scripts/deploy/update.sh
```

Hace `git pull`, rebuild, up, migrate y health check. Si algo falla, te
deja la versión anterior corriendo (no rompe el sitio).

### Ver logs

```bash
docker compose logs -f --tail=80
docker compose logs -f --tail=80 backend       # solo Laravel
docker compose logs -f --tail=80 caddy         # TLS / accesos
```

### Reiniciar un servicio

```bash
docker compose restart backend
```

### Verificar zero-knowledge en producción

Esto es lo que prueba que el cifrado E2E está activo:

```bash
docker compose exec postgres psql -U secondbrain -d secondbrain \
  -c "SELECT LEFT(content_ciphertext, 40) FROM notes ORDER BY created_at DESC LIMIT 3;"
```

Tenés que ver bytes random base64, no el texto que escribiste.

### Disparar un backup manual

```bash
bash scripts/deploy/backup.sh
ls -lh backups/
```

---

## Backups remotos con rclone (opcional, recomendado)

Backups locales solos no protegen ante incendio del datacenter o ransomware.
Configurá rclone para sincronizar a un proveedor barato.

### 1. Instalar rclone

```bash
sudo apt update && sudo apt install -y rclone
```

### 2. Configurar un remote (interactivo)

```bash
rclone config
```

Opciones recomendadas y baratas:

| Proveedor | Comentarios | Costo aprox. |
|---|---|---|
| **Backblaze B2** | Más barato, S3-compatible | USD 0.006/GB/mes |
| **Cloudflare R2** | Sin egress fees | USD 0.015/GB/mes |
| **Wasabi** | Sin egress fees, mínimo 1 TB | USD 6.99/mes |
| **AWS S3** | Estándar de la industria | USD 0.023/GB/mes |
| **Hetzner Storage Box** | Si ya estás en Hetzner | EUR 3.20/mes (1 TB) |

Durante el wizard de `rclone config`:
- `New remote` → nombre, ej `b2` o `r2`
- Storage → elegir el proveedor
- Pegar tus credenciales API (key / token)
- Aceptar defaults para el resto

### 3. Probar que funciona

```bash
# Crear el bucket si no existe (B2 ejemplo)
rclone mkdir b2:misb-backups

# Listar
rclone ls b2:misb-backups
```

### 4. Activarlo en `.env`

```bash
echo 'BACKUP_RCLONE_REMOTE=b2:misb-backups' | sudo tee -a /opt/secondbrain/.env
```

Variables opcionales:

| Var | Default | Qué hace |
|---|---|---|
| `BACKUP_RCLONE_REMOTE` | (vacío) | Si está, sube. Si no, sólo local. |
| `BACKUP_LOCAL_KEEP_DAYS` | 7 | Días que conserva backups locales |
| `BACKUP_REMOTE_KEEP_DAYS` | 30 | Días que conserva en remoto (vía rclone) |

### 5. Probar el flujo completo

```bash
sudo bash /opt/secondbrain/scripts/deploy/backup.sh
rclone ls b2:misb-backups/postgres/
```

---

## Restaurar de un backup

```bash
cd /opt/secondbrain

# Si el backup es local
LATEST=$(ls -1t backups/secondbrain-*.sql.gz | head -1)

# Si está en remoto
# rclone copy b2:misb-backups/postgres/secondbrain-20260427T030000Z.sql.gz /tmp/
# LATEST=/tmp/secondbrain-20260427T030000Z.sql.gz

# Restaurar a una DB de prueba (no toca la real)
docker compose exec postgres createdb -U secondbrain secondbrain_restore_test
gunzip -c "$LATEST" \
  | docker compose exec -T postgres psql -U secondbrain secondbrain_restore_test

# Verificar
docker compose exec postgres psql -U secondbrain secondbrain_restore_test \
  -c "SELECT count(*) AS users FROM users;"
docker compose exec postgres psql -U secondbrain secondbrain_restore_test \
  -c "SELECT count(*) AS notes FROM notes;"

# Limpiar
docker compose exec postgres dropdb -U secondbrain secondbrain_restore_test
```

> **Hacelo cada mes**. Lo que cuenta no es tener backups, es tener
> backups que sabés restaurar.

---

## Troubleshooting

| Síntoma | Probable causa | Fix |
|---|---|---|
| Caddy logs muestran `obtain certificate timeout` | DNS no propagó o puerto 80 cerrado | `dig +short DOMAIN` y `sudo ufw status` |
| `502 Bad Gateway` en `/api` | backend caído | `docker compose logs --tail=100 backend` |
| `502 Bad Gateway` en `/` | frontend caído | `docker compose logs --tail=100 frontend` |
| Login falla con 419 | Stateful Sanctum sin domain match | revisar `SANCTUM_STATEFUL_DOMAINS` en `.env` |
| Crear cuenta tarda > 5s | Argon2id en CPU lenta | reducir `iterations` en `frontend/services/crypto.ts` (impacto en seguridad) |
| Tras update, el site sigue mostrando lo viejo | Cache del navegador con service worker | hard refresh, o purgar `frontend_next` volume |
| `permission denied` al correr backup.sh por cron | El usuario root no tiene grupo docker | el script ya corre con `sudo bash`; si lo cambiaste, revertilo |

---

## Hardening adicional (recomendado tras el deploy inicial)

### Llave SSH y cerrar password auth

En tu máquina:
```bash
ssh-copy-id usuario@ip-del-vps
```

En el VPS, editar `/etc/ssh/sshd_config`:
```
PasswordAuthentication no
PermitRootLogin no
```

```bash
sudo systemctl restart sshd
```

### Updates automáticos de seguridad

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Monitoreo externo gratuito

[UptimeRobot](https://uptimerobot.com) apuntando a:
```
https://notas.midominio.com/api/ping
```

Esperar `200` y `"status":"ok"`. Cualquier otra cosa = email.
