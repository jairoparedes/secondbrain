# Arquitectura

## Estado por capa

| Capa | Estado | Comentario |
|---|---|---|
| Cliente (Next.js) | ✅ Fase 1+2 | Páginas auth + CRUD + UnlockDialog. Cifrado activo. |
| Edge (Nginx) | ✅ | Reverse proxy, FastCGI a backend, proxy a frontend. |
| Backend (Laravel) | ✅ Fase 1+2 | Sanctum, CRUD, change-password. 32 tests verdes. |
| Worker de colas | ⏳ | Contenedor activo, sin jobs reales aún (los necesita Fase 4). |
| PostgreSQL + pgvector | ✅ | 12 migraciones aplicadas, 19 tablas. |
| Redis | ✅ | Cache, sesiones (no usadas), colas. |
| MinIO | ✅ | Bucket `secondbrain` listo (lo usa Fase 2+ para adjuntos). |

## Visión general

```
                    ┌─────────────┐
                    │   Cliente   │  Navegador / PWA
                    │  + cifrado  │  Argon2id + AES-256-GCM
                    └──────┬──────┘
                           │ HTTPS (TLS en producción)
                    ┌──────▼──────┐
                    │    Nginx    │  reverse proxy + headers de seguridad
                    └──┬───────┬──┘
                       │       │
                /api   │       │  /  (assets + páginas)
                       │       │
              ┌────────▼─┐   ┌─▼────────┐
              │ Laravel  │   │ Next.js  │
              │ (PHP-FPM)│   │  (Node)  │
              └─────┬────┘   └──────────┘
                    │ encola jobs
                    │
              ┌─────▼──────┐
              │ Queue      │  worker artisan, sin nginx por delante
              │ Worker     │
              └─────┬──────┘
                    │
      ┌─────────────┼────────────────┐
      │             │                │
┌─────▼─────┐  ┌────▼────┐     ┌─────▼─────┐
│ Postgres  │  │  Redis  │     │   MinIO   │
│ +pgvector │  │ (cache/ │     │  (S3)     │
└───────────┘  │  queue) │     └───────────┘
               └─────────┘
```

Diagrama interactivo: [`architecture.html`](architecture.html) (dark) /
[`architecture-corporate.html`](architecture-corporate.html) (light).

## Principios

1. **Zero-knowledge** — el backend nunca ve el contenido plano de las notas.
   Toda la criptografía vive en el cliente. **Implementado en Fase 2**.
2. **Monolito modular** — Laravel organizado por dominios (`app/Domains/*`).
   Migración a microservicios solo si el dolor lo justifica.
3. **Offline-first** — el frontend es una PWA que funciona sin red y
   sincroniza cuando hay conexión (IndexedDB + event log). Estructura lista
   en `services/sync.ts`, integración en Fase 5.
4. **Search layered** — full-text barato (Postgres `tsvector` sobre blind
   indexes) + semántica cara (embeddings en `pgvector`), ambos sirviendo al
   mismo endpoint. Fase 3 + 4.
5. **Compatibilidad hacia atrás** — el campo `notes.encryption_version` permite
   coexistencia de notas legadas (v0 = plaintext de Fase 1) y cifradas (v1
   = AES-256-GCM de Fase 2), sin requerir migración masiva de datos.
6. **Todo cifrado en reposo** (producción) — Postgres con TDE / volúmenes
   cifrados, MinIO con server-side encryption.

## Dominios del backend

| Dominio  | Responsabilidad                                                        | Estado |
|----------|------------------------------------------------------------------------|--------|
| `Auth`   | Registro, login, refresh, me, logout, change-password (rotación KEK)   | ✅ Fase 1+2 |
| `Notes`  | CRUD cifrado de notas, soft delete, restore, paginación, scoping       | ✅ Fase 1+2 |
| `Tags`   | Organización y filtros con unique `(user_id, name)`                    | ✅ Fase 1 |
| `Search` | Full-text y búsqueda semántica unificadas                              | ⏳ Fase 3+4 |
| `Sync`   | Event log, push/pull con cursor, resolución de conflictos              | ⏳ Fase 5 |

Ubicación física: `backend/app/Domains/<Dominio>/Http/Controllers/*.php`.

## Tablas en Postgres

| Tabla                    | Para qué                                       |
|--------------------------|------------------------------------------------|
| `users`                  | Cuentas. Contiene `kdf_salt` y `master_key_wrapped` para Fase 2. |
| `personal_access_tokens` | Tokens Sanctum (Bearer) por dispositivo.       |
| `notes`                  | Bytes opacos (`title_ciphertext`, `content_ciphertext`, `note_key_wrapped`). |
| `tags` + `note_tags`     | Etiquetas por usuario y su pivote con notas.   |
| `note_relations`         | Relaciones explícitas entre notas (Fase 6).    |
| `note_blind_indexes`     | HMAC por palabra para búsqueda exacta cifrada (Fase 3). |
| `embeddings`             | Vectores `pgvector` para búsqueda semántica (Fase 4). |
| `sync_events`            | Event log autoritativo del servidor (Fase 5).  |
| `audit_log`              | Bitácora append-only (Fase 2 endgame).         |
| `cache`, `cache_locks`, `jobs`, `failed_jobs`, `job_batches`, `sessions`, `password_reset_tokens` | Plumbing estándar de Laravel. |

## Decisiones clave (ADRs abreviados)

### ADR-001: PostgreSQL + pgvector (no Elasticsearch todavía)
**Contexto:** necesitamos full-text y semántica.
**Decisión:** Postgres `tsvector` + `pgvector` cubre MVP y fase 4. Evitamos
la complejidad operacional de ES hasta tener > 10M notas o latencia
problemática.
**Consecuencia:** migración futura a ES está contemplada pero no bloqueante.

### ADR-002: Laravel monolito modular, no microservicios
**Contexto:** tentación de partir en servicios desde el día 1.
**Decisión:** un solo servicio Laravel con dominios bien separados. Un
worker de colas aparte.
**Consecuencia:** despliegue simple, refactor a servicios es posible si un
dominio escala de forma distinta.

### ADR-003: Cifrado en cliente con Web Crypto API + hash-wasm
**Contexto:** zero-knowledge real.
**Decisión:** AES-256-GCM (Web Crypto nativa) para el contenido. Argon2id
(`hash-wasm` WASM, ~50 KB) para derivación de KEK con t=3, m=64 MiB, p=1
(OWASP 2024). Clave maestra nunca sale del dispositivo.
**Consecuencia:** no podemos indexar el contenido en el servidor; la
búsqueda se hace sobre blind indexes (Fase 3) o localmente en el cliente
con el índice descifrado.

### ADR-004: UUID como PK en todas las tablas
Facilita sincronización offline-first sin colisiones (Fase 5) y URLs no
enumerables.

### ADR-005: Tres capas de claves (KEK → master_key → note_key)
**Contexto:** necesitamos poder rotar la password sin re-cifrar todas las
notas (lento) y poder compartir notas individuales en el futuro sin dar
acceso al resto.
**Decisión:** la `master_key` se genera aleatoria al registro y nunca cambia.
Lo que cambia con la password es la KEK que la envuelve. Cada nota tiene
su propia `note_key`, envuelta con la `master_key`.
**Consecuencia:** rotar password es O(1) cliente + O(1) servidor. Compartir
una nota será O(1) (re-envolver solo esa `note_key`).

### ADR-006: `encryption_version` como discriminante por nota
**Contexto:** notas creadas en Fase 1 (texto plano) deben seguir siendo
legibles después de Fase 2.
**Decisión:** columna `notes.encryption_version` smallint default 0.
v0 = plaintext, v1 = AES-256-GCM con note_key wrappeada. La UI marca con
badge "legada" o "e2e" según corresponda.
**Consecuencia:** migración gradual sin big-bang; futuras versiones (v2,
v3) caben con el mismo mecanismo.

## Flujos principales

### Registro
```
[cliente] randomBytes(16) → kdf_salt
[cliente] Argon2id(password, kdf_salt) → KEK
[cliente] generateAesKey() → master_key
[cliente] AES-GCM(master_key, KEK) → master_key_wrapped
[cliente] POST /auth/register { email, password, kdf_salt, master_key_wrapped }
[server]  Hash::make(password) → users.password (bcrypt para Sanctum)
[server]  guarda kdf_salt y master_key_wrapped tal cual
[server]  emite token Sanctum
```

### Crear nota
```
[cliente] generateAesKey() → note_key
[cliente] AES-GCM(title, note_key) → title_ciphertext
[cliente] AES-GCM(content, note_key) → content_ciphertext
[cliente] AES-GCM(note_key, master_key) → note_key_wrapped
[cliente] POST /notes { title_ciphertext, content_ciphertext, note_key_wrapped, encryption_version: 1, tag_ids }
[server]  validate + INSERT en notes (todos los blobs son base64 opacos)
```

### Reload + unlock
```
Token Sanctum sigue en localStorage; master_key se perdió al recargar.
[cliente] muestra UnlockDialog
[usuario] tipea password
[cliente] Argon2id(password, kdf_salt) → KEK
[cliente] AES-GCM unwrap (master_key_wrapped, KEK) → master_key
[cliente] guarda master_key en memoria del store; todo descifra de nuevo
```

### Cambio de password (rotación de KEK, las notas no se tocan)
```
[cliente] genera new_kdf_salt aleatorio
[cliente] Argon2id(new_password, new_kdf_salt) → new_KEK
[cliente] AES-GCM(master_key, new_KEK) → new_master_key_wrapped
[cliente] POST /auth/change-password { current_password, new_password, new_kdf_salt, new_master_key_wrapped }
[server]  Hash::check(current) → ok
[server]  Hash::make(new) → users.password
[server]  UPDATE users SET kdf_salt = ?, master_key_wrapped = ?
[server]  REVOKE otros tokens (mantiene sólo el actual)
```

## Criterios de éxito por fase

| Fase | Criterio | Cómo se verifica |
|---|---|---|
| 1 | Auth + CRUD notas funcionando | `php artisan test` y smoke E2E ✅ |
| 2 | El servidor no puede leer notas | `psql` muestra ciphertexts opacos ✅ |
| 3 | Búsqueda exacta en cliente sin pedir nada al server | Test E2E "buscar 'cliente'" sin texto plano en payload |
| 4 | Búsqueda semántica funcional | `SELECT ... ORDER BY embedding <-> $1 LIMIT 10` devuelve resultados |
| 5 | Edits en device A aparecen en device B | Test E2E con dos navegadores |
