# Second Brain

Sistema privado de notas con arquitectura **zero-knowledge**, búsqueda semántica e IA.

> **Estado actual:** Fase 2 completada — cifrado E2E real (Argon2id + AES-256-GCM) con
> 32 tests backend pasando. La app es usable end-to-end: registrarse, escribir notas
> cifradas, organizarlas con tags, papelera, rotación de password.

---

## Stack

| Capa        | Tecnología                                | Estado |
|-------------|-------------------------------------------|--------|
| Frontend    | Next.js 14 (App Router) + TypeScript + Tailwind | ✅ Fase 1+2 |
| Cifrado     | Web Crypto + `hash-wasm` (Argon2id WASM)  | ✅ Fase 2 |
| Backend     | Laravel 11 (PHP 8.3) + Sanctum            | ✅ Fase 1+2 |
| DB          | PostgreSQL 16 + `pgvector` + `uuid-ossp`  | ✅ Listo |
| Cache/Queue | Redis 7                                   | ✅ Listo |
| Storage     | MinIO (S3-compatible)                     | ✅ Listo |
| Proxy       | Nginx                                     | ✅ Listo |
| Orquestación| Docker Compose                            | ✅ Listo |

Más detalle en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y los diagramas
interactivos en [`docs/architecture.html`](docs/architecture.html) /
[`docs/architecture-corporate.html`](docs/architecture-corporate.html).

---

## Arranque rápido (desarrollo)

### Requisitos
- Docker Desktop 24+
- 8 GB RAM libres recomendados

### Pasos

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Levantar el stack (la primera vez tarda: composer + npm)
docker compose up -d --build

# 3. Ver logs
docker compose logs -f backend frontend
```

Una vez arriba:

| Servicio          | URL                              |
|-------------------|----------------------------------|
| App               | http://localhost                 |
| API               | http://localhost/api             |
| MinIO consola     | http://localhost:9001            |
| Postgres          | `localhost:5432`                 |

Crear cuenta desde la UI en http://localhost/register; el cifrado se activa
automáticamente. Toda nota nueva sale cifrada del navegador.

### Comandos útiles

```bash
# Tests del backend (32/32)
docker compose exec backend php artisan test

# Smoke test de cifrado contra el API
docker compose exec frontend node scripts/crypto-api-e2e.mjs

# Verificar que Postgres guarda blobs opacos
docker compose exec postgres psql -U secondbrain -d secondbrain \
  -c "SELECT LEFT(title_ciphertext, 40) FROM notes ORDER BY created_at DESC LIMIT 3;"

# Reset completo (borra volúmenes)
docker compose down -v
```

Los scripts de `scripts/` envuelven los comandos comunes para Windows (PowerShell).

---

## Producción

- **Genérico (cualquier VPS):** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- **Google Cloud:** [`docs/DEPLOY-GCP.md`](docs/DEPLOY-GCP.md) + scripts
  automatizados en [`scripts/gcp/`](scripts/gcp/) — un comando crea la VM,
  otro la configura y deja todo levantado con TLS y backups diarios.

Lo que cubren:

- VPS / Compute Engine único con Docker Compose + Caddy (TLS automático)
- Build con imágenes inmutables (sin volúmenes de código)
- Backups diarios a Cloud Storage / S3
- Hardening: secrets, CORS, CSP, HSTS, monitoreo

---

## Estructura del monorepo

```
secondbrain/
├── backend/          # Laravel 11 API
│   ├── app/Domains/  # Auth, Notes, Tags, Search, Sync
│   ├── tests/        # 32 tests Feature pasando
│   └── ...
├── frontend/         # Next.js 14 + TypeScript
│   ├── app/          # /, /login, /register, /notes
│   ├── services/     # api.ts, crypto.ts, notesCrypto.ts
│   ├── stores/       # auth.ts, crypto.ts (master_key en memoria)
│   └── ...
├── infra/            # nginx, postgres init
├── docs/             # ARCHITECTURE, SECURITY, API, DEPLOYMENT, CONCEPTS
├── scripts/          # Helpers PowerShell + smoke tests
├── docker-compose.yml          # dev
├── docker-compose.prod.yml     # producción
├── .env.example
└── README.md
```

---

## Roadmap

- [x] **Fase 0** — Esqueleto del monorepo + Docker Compose
- [x] **Fase 1** — MVP backend (Sanctum, CRUD notas, tags) + frontend conectado
- [x] **Fase 2** — Cifrado E2E (Argon2id + AES-256-GCM, rotación de password)
- [ ] **Fase 3** — Búsqueda full-text con blind indexes + IndexedDB cifrado
- [ ] **Fase 4** — IA: embeddings + búsqueda semántica con pgvector
- [ ] **Fase 5** — Sincronización multi-device (offline-first)
- [ ] **Fase 6** — UX Pro (editor tipo Notion, grafo visual)
- [ ] **Fase 7** — Cloud + DevOps (CI/CD, K8s, observabilidad)

Detalle en [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Documentación

| Documento | Para qué sirve |
|---|---|
| [`docs/CONCEPTS.md`](docs/CONCEPTS.md) | Guía para principiantes con analogías y flujos |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura técnica, ADRs, dominios |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Modelo de amenazas, derivación de claves, zero-knowledge |
| [`docs/API.md`](docs/API.md) | Contratos de endpoints HTTP con ejemplos |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Guía genérica para llevar a producción (VPS) |
| [`docs/DEPLOY-GCP.md`](docs/DEPLOY-GCP.md) | Guía específica para Google Cloud Platform |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Plan por fases con checklist |
| [`docs/architecture.html`](docs/architecture.html) | Diagrama interactivo (tema dark) |
| [`docs/architecture-corporate.html`](docs/architecture-corporate.html) | Diagrama interactivo (tema light, formal) |

---

## Licencia

Privado. Todos los derechos reservados.
