# Despliegue en Google Cloud Platform

Guía específica para llevar Second Brain a GCP. Complementa
[`DEPLOYMENT.md`](DEPLOYMENT.md), que cubre los conceptos generales.

> **Resumen:** la vía recomendada para empezar es **Compute Engine VM
> única + Docker Compose + Caddy** (USD 15–25/mes). Cuando crezca, se
> migra a **Cloud Run + Cloud SQL + Memorystore + Cloud Storage** sin
> tocar el código.

---

## 0. Prerrequisitos en tu máquina local

```bash
# Google Cloud SDK
# https://cloud.google.com/sdk/docs/install
gcloud --version

# Login y selección de cuenta
gcloud auth login
gcloud auth application-default login
```

Necesitás:
- Una cuenta de Google con **billing habilitada** (Google da USD 300
  de crédito gratis los primeros 90 días).
- Un dominio que controles (cualquier registrar sirve; Cloudflare es
  gratis y rápido).

---

## Opción A — Compute Engine VM única (recomendada)

Una sola VM con Docker Compose, idéntica a un VPS común. Mismo
`docker-compose.prod.yml`, misma operación que `DEPLOYMENT.md`. La
diferencia con un VPS común es que GCP te da snapshots automáticos,
backups managed y monitoreo gratuito.

### A.1. Variables de entorno locales

Pegá en tu shell (ajustá los valores):

```bash
export PROJECT_ID="secondbrain-prod-$(date +%s | tail -c 4)"   # debe ser globalmente único
export PROJECT_NAME="Second Brain"
export REGION="southamerica-west1"     # Santiago. Otras: us-central1, us-east1, europe-west1.
export ZONE="${REGION}-a"
export VM_NAME="sb-prod"
export MACHINE_TYPE="e2-small"         # 2 vCPU, 2 GB RAM. e2-medium si esperás >100 users.
export DISK_SIZE="30GB"
export DOMAIN="notas.tu-dominio.com"
```

### A.2. Crear proyecto y habilitar APIs

```bash
gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
gcloud config set project "$PROJECT_ID"

# Vincular billing (necesario para crear cualquier recurso)
BILLING_ACCOUNT=$(gcloud billing accounts list --format="value(name)" --limit=1)
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"

# APIs mínimas
gcloud services enable \
  compute.googleapis.com \
  storage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com
```

### A.3. Reservar IP estática

Necesitamos una IP fija para apuntar el DNS:

```bash
gcloud compute addresses create sb-ip --region="$REGION"
EXTERNAL_IP=$(gcloud compute addresses describe sb-ip --region="$REGION" --format="value(address)")
echo "IP estática: $EXTERNAL_IP"
```

### A.4. Apuntar el dominio

En tu DNS (Cloudflare, Route 53, registrar, lo que uses):

```
A   notas.tu-dominio.com   $EXTERNAL_IP
```

Verificá la propagación antes de seguir:

```bash
dig +short "$DOMAIN"
# debe devolver $EXTERNAL_IP
```

### A.5. Reglas de firewall

```bash
gcloud compute firewall-rules create allow-http  \
  --allow=tcp:80  --target-tags=http-server  --network=default
gcloud compute firewall-rules create allow-https \
  --allow=tcp:443 --target-tags=https-server --network=default
# SSH viene abierto por default desde 35.235.240.0/20 vía IAP; está bien.
```

### A.6. Crear la VM

```bash
gcloud compute instances create "$VM_NAME" \
  --zone="$ZONE" \
  --machine-type="$MACHINE_TYPE" \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size="$DISK_SIZE" \
  --boot-disk-type=pd-balanced \
  --address=sb-ip \
  --tags=http-server,https-server \
  --metadata=enable-oslogin=TRUE \
  --shielded-secure-boot \
  --shielded-vtpm \
  --shielded-integrity-monitoring
```

Esperá ~30 segundos a que esté `RUNNING`:

```bash
gcloud compute instances list
```

### A.7. Habilitar snapshots automáticos diarios

```bash
# Política de snapshots: 1 por día, retener 14 días
gcloud compute resource-policies create snapshot-schedule sb-daily \
  --region="$REGION" \
  --max-retention-days=14 \
  --on-source-disk-delete=apply-retention-policy \
  --daily-schedule \
  --start-time=07:00 \
  --storage-location="$REGION"

# Adjuntar al disco de la VM
gcloud compute disks add-resource-policies "$VM_NAME" \
  --zone="$ZONE" \
  --resource-policies=sb-daily
```

### A.8. Bootstrap dentro de la VM

Conectarse y ejecutar el script de bootstrap:

```bash
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command='
  set -e
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y curl git ufw
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 22,80,443/tcp
  sudo ufw --force enable

  # Docker oficial
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER
'
```

> Tras ese paso, **reconectate** para que Docker tome el grupo nuevo.

```bash
gcloud compute ssh "$VM_NAME" --zone="$ZONE"
```

Y ya dentro de la VM:

```bash
sudo mkdir -p /opt/secondbrain && sudo chown $USER /opt/secondbrain
cd /opt/secondbrain
git clone https://github.com/jairoparedes/secondbrain.git .
cp .env.example .env

# Generar secrets
APP_KEY="base64:$(openssl rand -base64 32)"
DB_PWD=$(openssl rand -base64 36 | tr -d '+/=')
REDIS_PWD=$(openssl rand -base64 36 | tr -d '+/=')
MINIO_PWD=$(openssl rand -base64 36 | tr -d '+/=')

# Editar .env (también podés usar nano)
sed -i "s|APP_KEY=.*|APP_KEY=$APP_KEY|"                                 .env
sed -i "s|APP_ENV=.*|APP_ENV=production|"                               .env
sed -i "s|APP_DEBUG=.*|APP_DEBUG=false|"                                .env
sed -i "s|APP_URL=.*|APP_URL=https://notas.tu-dominio.com|"             .env
sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=$DB_PWD|"                          .env
sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PWD|"                 .env
sed -i "s|AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$MINIO_PWD|"   .env
sed -i "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://notas.tu-dominio.com/api|" .env

# Compose con override de producción + dominio para Caddy
echo "DOMAIN=notas.tu-dominio.com"                          >> .env
echo "COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml" >> .env

# Levantar todo
docker compose up -d --build

# Migrar DB
docker compose exec backend php artisan migrate --force

# Cachear config
docker compose exec backend sh -c "php artisan config:cache && php artisan route:cache"

# Crear bucket de MinIO
docker compose exec minio sh -c \
  "mc alias set local http://localhost:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD && \
   mc mb --ignore-existing local/secondbrain"
```

Espera ~30 segundos a que Caddy negocie el certificado y entrá a:

```
https://notas.tu-dominio.com
```

### A.9. Verificar zero-knowledge en producción

```bash
docker compose exec postgres psql -U secondbrain -d secondbrain \
  -c "SELECT LEFT(content_ciphertext, 40) FROM notes ORDER BY created_at DESC LIMIT 3;"
```

Si ves base64 random sin correlación con tus textos, todo funciona.

### A.10. Backups a Cloud Storage

GCP es perfecto para esto: barato y nativo.

```bash
# En la VM
gcloud auth configure-docker  # opcional, no relevante aquí

# Crear bucket de backups (en tu máquina local, vincula al proyecto)
gcloud storage buckets create gs://"$PROJECT_ID"-backups \
  --location="$REGION" \
  --uniform-bucket-level-access

# Política de retención: 30 días, después borrar
cat > /tmp/lifecycle.json <<'EOF'
{
  "rule": [
    { "action": {"type": "Delete"}, "condition": {"age": 30} }
  ]
}
EOF
gcloud storage buckets update gs://"$PROJECT_ID"-backups \
  --lifecycle-file=/tmp/lifecycle.json
```

En la VM, crear el script de backup:

```bash
sudo install -d -o $USER /opt/secondbrain/backups

cat > /opt/secondbrain/scripts/backup.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

cd /opt/secondbrain
TS=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/opt/secondbrain/backups
BUCKET="$(grep -E '^GCP_BACKUP_BUCKET=' .env | cut -d= -f2)"

# Dump comprimido de Postgres
docker compose exec -T postgres pg_dump -U secondbrain secondbrain \
  | gzip -9 > "$DEST/secondbrain-$TS.sql.gz"

# Subir a GCS
gcloud storage cp "$DEST/secondbrain-$TS.sql.gz" \
  "gs://$BUCKET/postgres/secondbrain-$TS.sql.gz"

# Retención local: 7 días
find "$DEST" -name 'secondbrain-*.sql.gz' -mtime +7 -delete
BASH
chmod +x /opt/secondbrain/scripts/backup.sh

# Configurar bucket en .env (en la VM)
echo "GCP_BACKUP_BUCKET=$PROJECT_ID-backups" >> /opt/secondbrain/.env

# Cron diario 03:00 UTC
( crontab -l 2>/dev/null; echo "0 3 * * * /opt/secondbrain/scripts/backup.sh >> /var/log/sb-backup.log 2>&1" ) | crontab -
```

Para que la VM pueda escribir al bucket sin credenciales, usa la
**Service Account por default de Compute Engine**, que ya tiene permisos
de escritura en sus propios buckets. Si querés ser más estricto:

```bash
# En tu máquina local
SA_EMAIL="$(gcloud iam service-accounts list --filter='email~^.*compute@developer.gserviceaccount.com$' --format='value(email)' --project=$PROJECT_ID)"
gcloud storage buckets add-iam-policy-binding "gs://$PROJECT_ID-backups" \
  --member="serviceAccount:$SA_EMAIL" \
  --role=roles/storage.objectAdmin
```

### A.11. Probar el restore

Esto es lo que de verdad importa de los backups:

```bash
# En la VM
LATEST=$(gcloud storage ls "gs://$(grep GCP_BACKUP_BUCKET .env | cut -d= -f2)/postgres/" | tail -1)
gcloud storage cp "$LATEST" /tmp/restore-test.sql.gz

# Crear DB de prueba sin tocar la real
docker compose exec postgres createdb -U secondbrain secondbrain_restore_test
gunzip -c /tmp/restore-test.sql.gz | \
  docker compose exec -T postgres psql -U secondbrain secondbrain_restore_test

docker compose exec postgres psql -U secondbrain secondbrain_restore_test \
  -c "SELECT COUNT(*) FROM users;"
docker compose exec postgres dropdb -U secondbrain secondbrain_restore_test
```

### A.12. Logs y monitoreo gratis con GCP

```bash
# Stream de logs de la VM
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command='cd /opt/secondbrain && docker compose logs -f --tail=50'

# Métricas de la VM (CPU, RAM, disco) en consola web
echo "https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
```

GCP da Cloud Monitoring sin costo extra para una VM. Configurá una
alerta de CPU > 80 % por 5 min y otra de "instancia ausente":

```bash
# UI más rápido para esto que CLI:
echo "https://console.cloud.google.com/monitoring/alerting?project=$PROJECT_ID"
```

---

## Opción B — Cloud Run + Cloud SQL + Memorystore + GCS

Cuando la app despegue (>1000 usuarios activos, equipo distribuido,
necesidad de zero-downtime deploys), se migra a esta arquitectura sin
tocar el código de la app. Solo cambian los `Dockerfile` para single-
process y las variables de entorno.

### Mapping de componentes

| Local / VM       | GCP managed                       |
|------------------|-----------------------------------|
| nginx + caddy    | Cloud Load Balancer + Cloud Armor (TLS, DDoS) |
| frontend Next.js | Cloud Run service `sb-frontend`   |
| backend Laravel  | Cloud Run service `sb-backend`    |
| queue worker     | Cloud Run service `sb-queue` con `--no-cpu-throttling` y `--min-instances=1` |
| postgres+pgvector| **Cloud SQL Postgres 16** con extensión `vector` |
| redis            | **Memorystore Redis Standard 7**  |
| minio            | **Cloud Storage** vía S3 interoperability mode |

### Cambios en el código (mínimos)

1. **Backend Dockerfile** ya soporta `target: prod`.
   Cambio adicional para Cloud Run: PHP-FPM debe escuchar HTTP no FastCGI.
   Solución: añadir un `nginx-unit` o cambiar a `frankenphp` (recomendado:
   imagen `dunglas/frankenphp:1-php8.3` reemplaza al PHP-FPM + nginx).

2. **Frontend Dockerfile target `runner`** ya está listo (Next.js
   standalone server.js).

3. **`AWS_ENDPOINT`** apunta a `https://storage.googleapis.com` y
   `AWS_USE_PATH_STYLE_ENDPOINT=true`. Hay que generar HMAC keys de
   interoperabilidad para Cloud Storage.

4. **`DB_HOST`** apunta al Cloud SQL Auth Proxy (sidecar de Cloud Run)
   o a la IP privada vía VPC connector.

5. **`REDIS_HOST`** = IP privada de Memorystore. Cloud Run necesita
   VPC Serverless Access connector.

### Pasos a alto nivel

```bash
# Cloud SQL Postgres 16 con pgvector (la extensión ya viene desde 2024)
gcloud sql instances create sb-pg \
  --database-version=POSTGRES_16 \
  --tier=db-g1-small \
  --region="$REGION" \
  --storage-size=10GB \
  --backup-start-time=03:00

gcloud sql databases create secondbrain --instance=sb-pg

gcloud sql users create secondbrain --instance=sb-pg --password="$DB_PWD"

# Habilitar pgvector
gcloud sql instances patch sb-pg --database-flags=cloudsql.enable_pgaudit=on
# CREATE EXTENSION vector se ejecuta vía migración de Laravel

# Memorystore Redis
gcloud redis instances create sb-redis \
  --size=1 --region="$REGION" --tier=basic --redis-version=redis_7_0

# Cloud Storage para uploads
gcloud storage buckets create gs://"$PROJECT_ID"-uploads --location="$REGION"

# HMAC para que el SDK S3 hable con GCS
gcloud iam service-accounts create sb-storage --display-name="SB storage"
gcloud storage hmac create sb-storage@"$PROJECT_ID".iam.gserviceaccount.com

# Build y deploy con Cloud Build
gcloud builds submit --tag "gcr.io/$PROJECT_ID/sb-backend" ./backend
gcloud builds submit --tag "gcr.io/$PROJECT_ID/sb-frontend" ./frontend

gcloud run deploy sb-backend \
  --image "gcr.io/$PROJECT_ID/sb-backend" \
  --region "$REGION" \
  --add-cloudsql-instances "$PROJECT_ID:$REGION:sb-pg" \
  --vpc-connector sb-vpc \
  --set-env-vars "APP_ENV=production,..."

gcloud run deploy sb-frontend \
  --image "gcr.io/$PROJECT_ID/sb-frontend" \
  --region "$REGION" \
  --allow-unauthenticated
```

> Migrar a esta arquitectura es ~1 día de trabajo, principalmente
> ajustando el Dockerfile del backend a FrankenPHP. Si te interesa
> hacerlo desde el inicio, abrime un issue.

---

## Costos comparados

| Componente              | Opción A (VM única) | Opción B (managed) |
|-------------------------|--------------------:|-------------------:|
| Cómputo                 | e2-small ~USD 14/mes | Cloud Run pay-per-request, ~USD 10–40/mes según tráfico |
| DB                      | Postgres en VM       | Cloud SQL db-g1-small ~USD 25/mes |
| Cache                   | Redis en VM          | Memorystore basic 1 GB ~USD 35/mes |
| Storage                 | MinIO en VM          | Cloud Storage ~USD 0.02/GB/mes |
| Egress (asume 50 GB/mes)| ~USD 6              | ~USD 6 |
| Backups (30 GB)         | ~USD 0.60           | ~USD 0.60 |
| Load Balancer + TLS     | Caddy (incluido)     | ~USD 18/mes |
| **Total estimado**      | **USD 20–25/mes**   | **USD 95–125/mes** |

Crédito gratis de USD 300 por 90 días te cubre cualquiera de las dos.

---

## Limpieza si querés desinstalar todo

```bash
gcloud compute instances delete "$VM_NAME" --zone="$ZONE" --quiet
gcloud compute addresses delete sb-ip --region="$REGION" --quiet
gcloud storage rm -r "gs://$PROJECT_ID-backups"
gcloud projects delete "$PROJECT_ID"
```

---

## Scripts automatizados

Para no copiar/pegar cada comando, el repo trae:

| Script                                    | Qué hace                                         |
|-------------------------------------------|--------------------------------------------------|
| [`scripts/gcp/01-create-vm.sh`](../scripts/gcp/01-create-vm.sh) | Proyecto, APIs, IP, firewall, VM, snapshots |
| [`scripts/gcp/02-bootstrap-vm.sh`](../scripts/gcp/02-bootstrap-vm.sh) | Corre adentro de la VM: Docker, código, .env, levantado, migración |
| [`scripts/gcp/backup-to-gcs.sh`](../scripts/gcp/backup-to-gcs.sh) | Dump diario de Postgres a Cloud Storage |
| [`scripts/gcp/README.md`](../scripts/gcp/README.md) | Orden de ejecución y variables esperadas |

Uso típico:

```bash
# En tu máquina local
export PROJECT_ID="secondbrain-prod"
export DOMAIN="notas.tu-dominio.com"
export REGION="southamerica-west1"
./scripts/gcp/01-create-vm.sh

# Después, en la VM
ssh-into-vm
cd /opt && sudo mkdir secondbrain && sudo chown $USER secondbrain
cd secondbrain && git clone https://github.com/jairoparedes/secondbrain.git .
sudo bash scripts/gcp/02-bootstrap-vm.sh notas.tu-dominio.com
```
