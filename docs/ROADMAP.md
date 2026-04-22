# Roadmap

## Fase 0 — Esqueleto ✅
- [x] Monorepo: `backend/`, `frontend/`, `infra/`, `docs/`, `scripts/`
- [x] Docker Compose: nginx + Laravel + Next.js + Postgres + Redis + MinIO
- [x] Migraciones SQL base (users, notes, tags, note_tags, note_relations, embeddings)
- [x] Rutas API stub (501)

## Fase 1 — MVP ✅
Backend
- [x] Auth real: register/login/logout/refresh/me con Sanctum personal access tokens
- [x] Manejo unificado de errores JSON `{ error: { code, message } }`
- [x] CRUD notas con soft delete + restore + scoping por usuario
- [x] Tags con scoping por usuario y `(user_id, name)` unique
- [x] Sincronización de tags al crear/actualizar notas con validación de ownership
- [x] Paginación en `/api/notes` (`?page=` `?per_page=` `?trashed=`)
- [x] Tests Feature (27/27): Auth, Notes, Tags

Frontend
- [x] Cliente HTTP tipado + tipos compartidos con el backend
- [x] Store de auth con Zustand + persistencia en localStorage
- [x] Hook `useAuthGuard` para rutas protegidas/guest
- [x] Páginas `/register`, `/login`, `/notes`, home con estado de sesión
- [x] Editor Markdown con preview split-pane (sin dependencias)
- [x] TagPicker con creación inline
- [x] Búsqueda local por texto sobre notas cargadas
- [x] Papelera: listar, eliminar (soft), restaurar

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
