#!/usr/bin/env bash
# ============================================================
# Crea la infraestructura de GCP para correr Second Brain.
#
# Variables esperadas (exportá antes):
#   PROJECT_ID    nombre globalmente único del proyecto
#   REGION        ej. southamerica-west1, us-central1, europe-west1
#   DOMAIN        ej. notas.tu-dominio.com (sólo para mostrarte la IP)
#   MACHINE_TYPE  default: e2-small (2 vCPU / 2 GB)
#   DISK_SIZE     default: 30GB
#   VM_NAME       default: sb-prod
#
# Uso:
#   export PROJECT_ID=secondbrain-prod
#   export REGION=southamerica-west1
#   export DOMAIN=notas.tu-dominio.com
#   ./scripts/gcp/01-create-vm.sh
# ============================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID es requerido}"
: "${REGION:?REGION es requerido}"
: "${DOMAIN:?DOMAIN es requerido}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-small}"
DISK_SIZE="${DISK_SIZE:-30GB}"
VM_NAME="${VM_NAME:-sb-prod}"
ZONE="${REGION}-a"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
step() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }

# ------------------------------------------------------------
step "Verificando gcloud CLI"
gcloud --version | head -n 1
ok "gcloud disponible"

# ------------------------------------------------------------
step "Creando o seleccionando proyecto $PROJECT_ID"
if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  ok "Proyecto $PROJECT_ID ya existe"
else
  gcloud projects create "$PROJECT_ID" --name="Second Brain"
  ok "Proyecto creado"
fi
gcloud config set project "$PROJECT_ID" >/dev/null

# ------------------------------------------------------------
step "Vinculando billing"
BILLING_ACCOUNT="$(gcloud billing accounts list --format='value(name)' --filter='open=true' --limit=1 || true)"
if [[ -z "$BILLING_ACCOUNT" ]]; then
  echo "No encontré ninguna billing account activa." >&2
  echo "Configurala primero en https://console.cloud.google.com/billing" >&2
  exit 1
fi
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT" >/dev/null
ok "Billing vinculado a $BILLING_ACCOUNT"

# ------------------------------------------------------------
step "Habilitando APIs"
gcloud services enable \
  compute.googleapis.com \
  storage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com >/dev/null
ok "APIs habilitadas"

# ------------------------------------------------------------
step "Reservando IP estática (sb-ip)"
if ! gcloud compute addresses describe sb-ip --region="$REGION" >/dev/null 2>&1; then
  gcloud compute addresses create sb-ip --region="$REGION" >/dev/null
fi
EXTERNAL_IP="$(gcloud compute addresses describe sb-ip --region="$REGION" --format='value(address)')"
ok "IP estática: $EXTERNAL_IP"

# ------------------------------------------------------------
step "Reglas de firewall"
for RULE in "allow-http:tcp:80:http-server" "allow-https:tcp:443:https-server"; do
  IFS=':' read -r NAME PROTO PORT TAG <<<"$RULE"
  if ! gcloud compute firewall-rules describe "$NAME" >/dev/null 2>&1; then
    gcloud compute firewall-rules create "$NAME" \
      --allow="$PROTO:$PORT" \
      --target-tags="$TAG" \
      --network=default >/dev/null
    ok "Regla $NAME creada"
  else
    ok "Regla $NAME ya existía"
  fi
done

# ------------------------------------------------------------
step "Creando VM $VM_NAME en $ZONE ($MACHINE_TYPE)"
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" >/dev/null 2>&1; then
  ok "VM ya existe (no se recrea)"
else
  gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --image-family=ubuntu-2404-lts-amd64 \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size="$DISK_SIZE" \
    --boot-disk-type=pd-balanced \
    --address="$EXTERNAL_IP" \
    --tags=http-server,https-server \
    --metadata=enable-oslogin=TRUE \
    --shielded-secure-boot \
    --shielded-vtpm \
    --shielded-integrity-monitoring \
    --scopes=cloud-platform >/dev/null
  ok "VM creada"
fi

# ------------------------------------------------------------
step "Snapshots automáticos diarios (retención 14 días)"
if ! gcloud compute resource-policies describe sb-daily --region="$REGION" >/dev/null 2>&1; then
  gcloud compute resource-policies create snapshot-schedule sb-daily \
    --region="$REGION" \
    --max-retention-days=14 \
    --on-source-disk-delete=apply-retention-policy \
    --daily-schedule \
    --start-time=07:00 \
    --storage-location="$REGION" >/dev/null
fi
DISK_NAME="$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" \
  --format='value(disks[0].source.basename())')"
gcloud compute disks add-resource-policies "$DISK_NAME" \
  --zone="$ZONE" \
  --resource-policies=sb-daily >/dev/null 2>&1 || true
ok "Snapshots configurados"

# ------------------------------------------------------------
step "Bucket de backups"
BUCKET="${PROJECT_ID}-backups"
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" \
    --location="$REGION" \
    --uniform-bucket-level-access >/dev/null
  cat > /tmp/sb-lifecycle.json <<'EOF'
{ "rule": [ { "action": {"type": "Delete"}, "condition": {"age": 30} } ] }
EOF
  gcloud storage buckets update "gs://$BUCKET" \
    --lifecycle-file=/tmp/sb-lifecycle.json >/dev/null
fi
ok "Bucket gs://$BUCKET listo (retención 30 días)"

# ------------------------------------------------------------
echo ""
bold "Infraestructura GCP lista."
echo ""
echo "Próximos pasos:"
echo "  1) Apuntar tu DNS:   $DOMAIN  →  A  $EXTERNAL_IP"
echo "  2) Esperar propagación:   dig +short $DOMAIN"
echo "  3) Conectarse a la VM:"
echo ""
echo "        gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID"
echo ""
echo "  4) Dentro de la VM:"
echo ""
echo "        sudo mkdir -p /opt/secondbrain && sudo chown \$USER /opt/secondbrain"
echo "        cd /opt/secondbrain"
echo "        git clone https://github.com/jairoparedes/secondbrain.git ."
echo "        sudo bash scripts/gcp/02-bootstrap-vm.sh $DOMAIN $BUCKET"
echo ""
echo "Resumen:"
echo "  PROJECT_ID  = $PROJECT_ID"
echo "  REGION/ZONE = $REGION / $ZONE"
echo "  VM_NAME     = $VM_NAME"
echo "  EXTERNAL_IP = $EXTERNAL_IP"
echo "  BUCKET      = gs://$BUCKET"
