# Roadmap

## Fase 0 — Esqueleto (ACTUAL)
- [x] Monorepo: `backend/`, `frontend/`, `infra/`, `docs/`, `scripts/`
- [x] Docker Compose: nginx + Laravel + Next.js + Postgres + Redis + MinIO
- [x] Migraciones SQL base (users, notes, tags, note_tags, note_relations, embeddings)
- [x] Rutas API stub (501)

## Fase 1 — MVP (4–6 semanas)
- [ ] Auth real: register/login/refresh con Sanctum + Argon2id
- [ ] CRUD notas (aún sin cifrado)
- [ ] Tags
- [ ] Editor Markdown básico en frontend
- [ ] Lista + búsqueda simple `LIKE`

## Fase 2 — Seguridad (2–3 semanas)
- [ ] Derivación de clave en cliente (Argon2id WASM)
- [ ] Cifrado AES-256-GCM de contenido y título
- [ ] Wrapping de `note_key` con `master_key`
- [ ] Flujo de cambio de password + rotación
- [ ] Auditoría append-only

## Fase 3 — Búsqueda (2–4 semanas)
- [ ] Blind index (HMAC por token)
- [ ] Full-text sobre blind index en Postgres
- [ ] Índice local en IndexedDB (cifrado)
- [ ] Ranking combinado

## Fase 4 — IA (3–6 semanas)
- [ ] Integración OpenAI embeddings (opt-in, rompe zero-knowledge)
- [ ] Tabla `embeddings` con `pgvector`
- [ ] Endpoint `/api/search` unificado (FTS + vector)
- [ ] Clasificación automática de tags
- [ ] Sugerencias "notas relacionadas"

## Fase 5 — Sync (3–5 semanas)
- [ ] Event log cliente (IndexedDB)
- [ ] Push/pull con cursor
- [ ] Resolución de conflictos (last-writer-wins + merge manual)
- [ ] WebSocket para push server→cliente

## Fase 6 — UX Pro
- [ ] Editor rich-text estilo Notion (TipTap)
- [ ] Grafo visual de notas relacionadas
- [ ] Comandos `/` y atajos
- [ ] Drag & drop de archivos

## Fase 7 — Cloud & DevOps
- [ ] CI/CD (GitHub Actions): lint, test, build, push images
- [ ] Terraform / Pulumi para IaC
- [ ] Kubernetes manifests (Helm chart)
- [ ] Observabilidad: Prometheus + Grafana + Loki
- [ ] Backups automatizados de Postgres y MinIO
