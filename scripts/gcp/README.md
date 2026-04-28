# Despliegue automatizado en Google Cloud (Compute Engine)

Tres scripts que cubren todo el camino. Para una explicación completa,
ver [`docs/DEPLOY-GCP.md`](../../docs/DEPLOY-GCP.md).

## Orden de ejecución

```text
[laptop]  ./01-create-vm.sh
              ↓ crea proyecto, IP, firewall, VM, snapshots, bucket de backups
              ↓ devuelve IP estática para apuntar el DNS

[DNS]     A   notas.tu-dominio.com  →  <IP que devolvió el script>

[laptop]  gcloud compute ssh sb-prod --zone=...

[VM]      cd /opt && sudo mkdir secondbrain && sudo chown $USER secondbrain
[VM]      cd secondbrain && git clone https://github.com/jairoparedes/secondbrain.git .
[VM]      sudo bash scripts/gcp/02-bootstrap-vm.sh notas.tu-dominio.com PROJECT_ID-backups

[VM]      (cron diario ya quedó configurado para correr backup-to-gcs.sh)
```

## Variables y argumentos

### `01-create-vm.sh` (corre en tu laptop)

| Var               | Default              | Notas                                    |
|-------------------|---------------------|------------------------------------------|
| `PROJECT_ID`      | (requerido)         | Globalmente único en GCP                 |
| `REGION`          | (requerido)         | `southamerica-west1`, `us-central1`, etc.|
| `DOMAIN`          | (requerido)         | Solo para imprimir instrucciones         |
| `MACHINE_TYPE`    | `e2-small`          | 2 vCPU, 2 GB RAM                         |
| `DISK_SIZE`       | `30GB`              |                                          |
| `VM_NAME`         | `sb-prod`           |                                          |

### `02-bootstrap-vm.sh` (corre dentro de la VM, como root)

| Posicional | Descripción                                  |
|------------|----------------------------------------------|
| `$1`       | Dominio (ej. `notas.tu-dominio.com`)         |
| `$2`       | Bucket de backups (ej. `miproyecto-backups`) |

### `backup-to-gcs.sh` (cron, corre en la VM)

Lee `/opt/secondbrain/.env`. Espera ver:

- `GCP_BACKUP_BUCKET=...` — nombre del bucket sin `gs://`
- `DB_USERNAME`, `DB_DATABASE` — para el pg_dump

## Qué deja configurado

- VM Ubuntu 24.04 con Docker, ufw activo (22, 80, 443)
- IP estática + snapshot diario del disco (retención 14 días)
- Bucket `gs://PROJECT_ID-backups` con lifecycle de 30 días
- Stack levantado con `docker-compose.prod.yml` + Caddy (TLS automático)
- Migración de DB ejecutada
- Caches de Laravel optimizadas
- Bucket de MinIO `secondbrain` creado
- Cron diario 03:00 UTC haciendo `pg_dump` y subiendo a GCS

## Ejecutar manualmente un backup

```bash
sudo /opt/secondbrain/scripts/backup.sh
gcloud storage ls gs://PROJECT_ID-backups/postgres/
```

## Restaurar de un backup

```bash
# Descargar el dump más reciente
LATEST=$(gcloud storage ls gs://PROJECT_ID-backups/postgres/ | tail -1)
gcloud storage cp "$LATEST" /tmp/restore.sql.gz

# Restaurar a una DB de prueba (no toca la real)
cd /opt/secondbrain
docker compose exec postgres createdb -U secondbrain secondbrain_restore_test
gunzip -c /tmp/restore.sql.gz \
  | docker compose exec -T postgres psql -U secondbrain secondbrain_restore_test

# Verificar
docker compose exec postgres psql -U secondbrain secondbrain_restore_test \
  -c "SELECT count(*) FROM users;"

# Limpiar
docker compose exec postgres dropdb -U secondbrain secondbrain_restore_test
```

## Troubleshooting

| Síntoma | Probable causa | Fix |
|---------|----------------|-----|
| Caddy no obtiene certificado | DNS no propagado | `dig +short DOMAIN`, esperar y reiniciar `caddy` |
| `gcloud storage cp` da 401 | VM no creada con `--scopes=cloud-platform` | Re-crear VM o agregar SA con role `storage.objectAdmin` |
| `php artisan migrate` falla | `.env` malformado | `cat .env`, comprobar líneas duplicadas |
| Build del backend tarda 10 min | Composer install sin cache | Solo la primera vez, las siguientes son rápidas |
