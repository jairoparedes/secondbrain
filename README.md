# Second Brain

Sistema privado de notas con arquitectura **zero-knowledge**, búsqueda semántica e IA.

> Estado: **esqueleto inicial** — estructura completa, stubs de endpoints, sin lógica de negocio todavía.

---

## Stack

| Capa        | Tecnología                                |
|-------------|-------------------------------------------|
| Frontend    | Next.js 14 (App Router) + TypeScript + Tailwind |
| Backend     | Laravel 11 (PHP 8.3)                      |
| DB          | PostgreSQL 16 + `pgvector` + `uuid-ossp`  |
| Cache/Queue | Redis 7                                   |
| Storage     | MinIO (S3-compatible)                     |
| Proxy       | Nginx                                     |
| Orquestación| Docker Compose                            |

---

## Arranque rápido

### Requisitos
- Docker Desktop 24+
- 8 GB RAM libres recomendados

### Pasos

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Levantar stack completo
docker compose up -d --build

# 3. Ver logs (primera vez tarda: instala composer + npm)
docker compose logs -f backend frontend
```

Una vez arriba:

- Frontend: http://localhost
- API:      http://localhost/api
- MinIO:    http://localhost:9001 (consola)
- Postgres: `localhost:5432` (user/pass en `.env`)

### Comandos útiles

```bash
# Bash dentro del backend
docker compose exec backend sh

# Artisan
docker compose exec backend php artisan migrate
docker compose exec backend php artisan tinker

# Logs de un solo servicio
docker compose logs -f backend

# Reset completo (borra volúmenes)
docker compose down -v
```

Los scripts de `scripts/` envuelven estos comandos para Windows (PowerShell) y Unix.

---

## Estructura del monorepo

```
second-brain/
├── backend/          # Laravel 11 API (dominios: Auth, Notes, Tags, Search, Sync)
├── frontend/         # Next.js 14 (App Router, PWA, offline-first)
├── infra/            # nginx, postgres init, otros configs de infra
│   ├── nginx/
│   └── postgres/
├── docs/             # Decisiones de arquitectura, diagramas
├── scripts/          # Utilidades de desarrollo
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Roadmap

- [x] **Fase 0** — Esqueleto del monorepo + Docker Compose
- [ ] **Fase 1** — MVP: Auth + CRUD notas + Tags (sin cifrado)
- [ ] **Fase 2** — Cifrado E2E (AES-256-GCM + Argon2 en cliente)
- [ ] **Fase 3** — Búsqueda full-text con `tsvector`
- [ ] **Fase 4** — IA: embeddings + búsqueda semántica
- [ ] **Fase 5** — Sincronización multi-device (offline-first)
- [ ] **Fase 6** — UX Pro (editor tipo Notion, grafo visual)
- [ ] **Fase 7** — Cloud + DevOps (CI/CD, K8s)

Detalle en `docs/ROADMAP.md`.

---

## Documentación técnica

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Arquitectura general
- [`docs/SECURITY.md`](docs/SECURITY.md) — Modelo de cifrado zero-knowledge
- [`docs/API.md`](docs/API.md) — Endpoints (contratos iniciales)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — Plan por fases
